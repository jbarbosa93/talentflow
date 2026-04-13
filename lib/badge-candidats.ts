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

    // Merge : DB + localStorage existant (migration one-shot)
    const localSet = getViewedSet()
    const dbSet = new Set<string>(viewedIds)

    // IDs en localStorage mais pas en DB → les upserter en DB (migration)
    const toSync = [...localSet].filter(id => !dbSet.has(id))
    if (toSync.length > 0) {
      syncToDB(toSync) // fire-and-forget
    }

    // Union des deux
    const merged = new Set<string>([...dbSet, ...localSet])
    writeViewedSet(merged)
    return { viewedSet: merged, viewedAllAt: resolvedViewedAllAt }
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
  const set = getViewedSet()
  set.delete(id)
  writeViewedSet(set)
  unsyncFromDB([id])
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

/** Un candidat est "non vu" si :
 *  - has_update = true ET pas dans viewedSet → badge visible (viewedSet synchrone pour feedback immédiat)
 *  - OU récent ET pas dans viewedSet ET pas couvert par viewedAllAt
 */
export function hasBadge(
  id: string,
  created_at: string | null | undefined,
  viewedSet: Set<string>,
  viewedAllAt?: string | null,
  has_update?: boolean,
): boolean {
  // Priorité 1 : has_update flag (CV mis à jour) → badge toujours visible
  // Le clear se fait via PATCH has_update:false + update cache React Query depuis la fiche
  if (has_update) return true
  // Priorité 2 : logique "non vu" classique
  if (!isRecent(created_at)) return false
  if (viewedSet.has(id)) return false
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
