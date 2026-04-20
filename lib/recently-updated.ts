// Badge vert "✓ Actualisé" — feedback visuel transient après un update CV manuel.
// TTL 10 min en localStorage. Indépendant du badge rouge per-user (viewedSet).
// v1.9.65+ : feature B post-feedback João — le badge rouge est invisible pour celui
// qui vient d'importer (car il a ouvert la fiche), donc on ajoute un repère vert
// temporaire comme preuve visuelle immédiate que l'import a réussi.

const KEY = 'tf_recently_updated'
const TTL_MS = 10 * 60 * 1000 // 10 min
const EVENT = 'talentflow:recently-updated-changed'

type Map = Record<string, number> // candidat_id → timestamp

function read(): Map {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Map
    // Purge entries expirées à chaque lecture
    const now = Date.now()
    const cleaned: Map = {}
    let changed = false
    for (const [id, ts] of Object.entries(parsed)) {
      if (now - ts < TTL_MS) cleaned[id] = ts
      else changed = true
    }
    if (changed) window.localStorage.setItem(KEY, JSON.stringify(cleaned))
    return cleaned
  } catch { return {} }
}

function write(map: Map) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map))
    window.dispatchEvent(new CustomEvent(EVENT))
  } catch { /* ignore */ }
}

export function markRecentlyUpdated(id: string) {
  const m = read()
  m[id] = Date.now()
  write(m)
}

export function isRecentlyUpdated(id: string): boolean {
  const m = read()
  const ts = m[id]
  if (!ts) return false
  return Date.now() - ts < TTL_MS
}

export function getRecentlyUpdatedMap(): Map {
  return read()
}

/** Temps relatif court : "à l'instant", "il y a 2 min", etc. */
export function relativeMinutes(ts: number): string {
  const diffMs = Date.now() - ts
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'à l\'instant'
  if (diffMin === 1) return 'il y a 1 min'
  return `il y a ${diffMin} min`
}

export function onRecentlyUpdatedChange(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(EVENT, cb)
  return () => window.removeEventListener(EVENT, cb)
}

export const RECENTLY_UPDATED_EVENT = EVENT
