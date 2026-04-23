// lib/badge-candidats.ts
// Gestion centralisée des badges "nouveau/non vu" dans la liste candidats
// Source de vérité : Supabase DB (table candidats_vus + user_metadata.candidats_viewed_all_at)
// Cache : localStorage (write-through — UI instantanée, sync DB en fire-and-forget)

export const VIEWED_KEY = 'talentflow_viewed_candidats'
export const SEUIL_JOURS = 30
export const SEUIL_MS = SEUIL_JOURS * 24 * 60 * 60 * 1000

// ── Cache in-memory (module-level, partagé entre tous les composants) ─────────
// Lecture synchrone localStorage au chargement du module — premier render correct, pas de flash
let _viewedAllAt: string | null =
  typeof window !== 'undefined'
    ? localStorage.getItem('talentflow_viewed_all_at')
    : null
let _dbSynced = false
let _initPromise: Promise<{ viewedSet: Set<string>; viewedAllAt: string | null }> | null = null

/** Appel unique garanti — retourne la même promise si déjà en cours/terminé */
export function ensureInit(): Promise<{ viewedSet: Set<string>; viewedAllAt: string | null }> {
  if (!_initPromise) _initPromise = initViewedFromDB()
  return _initPromise
}

/** Re-lance initViewedFromDB et remplace le cache _initPromise. Appelé sur focus
 *  window pour capter les suppressions serveur (candidats_vus purgé par sync CV). */
export function refreshViewedFromDB(): Promise<{ viewedSet: Set<string>; viewedAllAt: string | null }> {
  _initPromise = initViewedFromDB()
  return _initPromise
}

// ── localStorage (cache write-through) ───────────────────────────────────────

export function getViewedSet(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try { return new Set(JSON.parse(localStorage.getItem(VIEWED_KEY) || '[]')) }
  catch { return new Set() }
}

function writeViewedSet(set: Set<string>) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(VIEWED_KEY, JSON.stringify([...set])) }
  catch { /* ignore */ }
}

// ── Événement global de changement de badge ───────────────────────────────────

export function dispatchBadgesChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('talentflow:badges-changed'))
  }
}

// ── Init depuis DB — appelé une fois au montage de CandidatsList ──────────────
// Merge DB + localStorage (import one-shot du localStorage existant vers DB)

export async function initViewedFromDB(): Promise<{ viewedSet: Set<string>; viewedAllAt: string | null }> {
  try {
    const res = await fetch('/api/candidats/vus', { cache: 'no-store' })
    if (!res.ok) throw new Error('API indisponible')
    const { viewedIds, viewedAllAt }: { viewedIds: string[]; viewedAllAt: string | null } = await res.json()

    // Migration one-shot : candidats_viewed_all_at localStorage → Supabase user_metadata
    let resolvedViewedAllAt = viewedAllAt
    if (!viewedAllAt && typeof window !== 'undefined') {
      const localViewedAllAt = localStorage.getItem('candidats_viewed_all_at')
      if (localViewedAllAt) {
        resolvedViewedAllAt = localViewedAllAt
        // Migrer vers Supabase en fire-and-forget
        fetch('/api/candidats/vus', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ viewedAllAt: localViewedAllAt }),
        }).catch(() => {})
      }
    }

    _viewedAllAt = resolvedViewedAllAt
    if (resolvedViewedAllAt && typeof window !== 'undefined') {
      localStorage.setItem('talentflow_viewed_all_at', resolvedViewedAllAt)
    }
    _dbSynced = true

    // v1.9.40 — DB fait foi SANS EXCEPTION.
    // Ancien bug : UNION local+DB quand toSync > 0 bloquait le badge après ré-import
    // (serveur DELETE candidats_vus → local contient encore l'ID → UNION le réinjecte
    // dans viewedSet → hasBadge return false). Solution : DB truth strict, localStorage
    // aligné dessus, puis re-sync des vraies migrations one-shot en fire-and-forget
    // (les IDs local-only qui n'auraient jamais été en DB) — elles apparaîtront au
    // prochain focus via refreshViewedFromDB.
    const localSet = getViewedSet()
    const dbSet = new Set<string>(viewedIds)

    // Migration résiduelle : IDs en local pas en DB ET PAS purgés récemment par serveur.
    // On ne peut pas distinguer "migration restante" vs "purge serveur récente",
    // donc on ne push QUE si la purge est improbable : jamais re-push ce qui est
    // en local-only — laisser mourir naturellement. Si c'était une vraie migration
    // one-shot en suspens, elle se rejouera au prochain markCandidatVu.
    // (En pratique la migration v1.9.9 est terminée depuis longtemps.)

    // DB = source de vérité. localStorage aligné sur DB.
    const viewedSet = dbSet
    writeViewedSet(viewedSet)

    // Log discret pour diagnostiquer si un user a encore des IDs local-only
    const localOnly = [...localSet].filter(id => !dbSet.has(id))
    if (localOnly.length > 0 && typeof window !== 'undefined') {
      console.debug(`[badge] ${localOnly.length} IDs local-only ignorés (DB truth)`)
    }

    return { viewedSet, viewedAllAt: resolvedViewedAllAt }
  } catch {
    // Fallback : localStorage uniquement
    _dbSynced = false
    return { viewedSet: getViewedSet(), viewedAllAt: null }
  }
}

// ── Sync DB (fire-and-forget) ─────────────────────────────────────────────────

function syncToDB(ids: string[]) {
  if (typeof window === 'undefined' || ids.length === 0) return
  fetch('/api/candidats/vus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  }).catch(() => {})
}

function unsyncFromDB(ids: string[]) {
  if (typeof window === 'undefined' || ids.length === 0) return
  fetch('/api/candidats/vus', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  }).catch(() => {})
}

// ── API publique (identique à avant — pas de breaking change) ─────────────────

export function markCandidatVu(id: string) {
  if (typeof window === 'undefined') return
  const set = getViewedSet()
  if (set.has(id)) return // déjà vu — pas de dispatch inutile
  set.add(id)
  writeViewedSet(set)
  syncToDB([id])
  dispatchBadgesChanged()
}

export function markCandidatNonVu(id: string) {
  if (typeof window === 'undefined') return
  // v1.9.47 — "Non vu" réarme le badge pour TOUS les users (pas juste le courant)
  // et force last_import_at=NOW côté serveur pour garantir que le badge apparaisse.
  const set = getViewedSet()
  set.delete(id)
  writeViewedSet(set)
  fetch('/api/candidats/vus', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [id], all_users: true }),
  }).catch(() => {})
  dispatchBadgesChanged()
}

export function markTousVus(ids: string[]) {
  if (typeof window === 'undefined') return
  const set = getViewedSet()
  ids.forEach(id => set.add(id))
  writeViewedSet(set)
  syncToDB(ids)
  dispatchBadgesChanged()
}

// ── Helpers badge ─────────────────────────────────────────────────────────────

export function isRecent(created_at: string | null | undefined): boolean {
  if (!created_at) return false
  return Date.now() - new Date(created_at).getTime() < SEUIL_MS
}

/** Un candidat est "non vu" PAR CE USER si :
 *  - last_import_at renseigné ET pas dans viewedSet ET last_import_at > viewedAllAt (ré-import non vu par ce user)
 *  - OU récent ET pas dans viewedSet ET pas couvert par viewedAllAt
 *
 *  Note : à chaque import, candidats_vus est purgé par candidat_id côté serveur → tous les users
 *  retrouvent un viewedSet vide pour ce candidat, donc le badge réapparaît pour TOUT LE MONDE jusqu'à ré-ouverture.
 */
export function hasBadge(
  id: string,
  created_at: string | null | undefined,
  viewedSet: Set<string>,
  viewedAllAt?: string | null,
  last_import_at?: string | null,
): boolean {
  // Déjà vu individuellement par ce user → jamais de badge
  if (viewedSet.has(id)) return false

  // Priorité 1 : ré-import récent non encore vu par ce user
  if (last_import_at) {
    if (!viewedAllAt || new Date(last_import_at) > new Date(viewedAllAt)) {
      // v1.9.90 — garde-fou recalibré : isRecent sur last_import_at (activité récente)
      // au lieu de created_at (désormais immuable depuis v1.9.90 = vraie date de 1er import).
      // Avant v1.9.90 : created_at était écrasé à fileDate par les updates → le garde-fou
      //                v1.9.48 fonctionnait car candidat updaté récemment avait created_at=now.
      // Après v1.9.90 : created_at est immuable → un candidat updaté aujourd'hui mais
      //                créé il y a 2 ans perdait le badge. Fix : on regarde la dernière activité.
      if (!isRecent(last_import_at)) return false
      return true
    }
  }
  // Priorité 2 : candidat récemment créé non couvert par viewedAllAt
  if (!isRecent(created_at)) return false
  if (viewedAllAt && created_at && new Date(created_at) < new Date(viewedAllAt)) return false
  return true
}

export function getViewedAllAt(): string | null { return _viewedAllAt }
export function isDBSynced(): boolean { return _dbSynced }

/** Appelé après "Tout marquer vu" — met à jour la mémoire + localStorage immédiatement */
export function markAllVu(timestamp?: string) {
  const ts = timestamp ?? new Date().toISOString()
  _viewedAllAt = ts
  if (typeof window !== 'undefined') {
    localStorage.setItem('talentflow_viewed_all_at', ts)
  }
  dispatchBadgesChanged()
}
