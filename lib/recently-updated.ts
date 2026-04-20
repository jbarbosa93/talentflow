// Badge coloré "✓ Actualisé" / "✓ Réactivé" / "✓ Nouveau" — feedback visuel transient
// après un import manuel. TTL 10 min en localStorage. Indépendant du badge rouge per-user.
// v1.9.65+ : feature B post-feedback João.

const KEY = 'tf_recently_updated'
const TTL_MS = 10 * 60 * 1000 // 10 min
const EVENT = 'talentflow:recently-updated-changed'

export type RecentlyUpdatedType = 'nouveau' | 'reactive' | 'mis_a_jour'

type Entry = { ts: number; type: RecentlyUpdatedType }
type Map = Record<string, Entry>

function migrateLegacy(raw: any): Map {
  // Ancien format : { id: timestamp } → convertir en { id: { ts, type: 'mis_a_jour' } }
  if (!raw || typeof raw !== 'object') return {}
  const out: Map = {}
  for (const [id, val] of Object.entries(raw)) {
    if (typeof val === 'number') out[id] = { ts: val, type: 'mis_a_jour' }
    else if (val && typeof val === 'object' && typeof (val as any).ts === 'number') out[id] = val as Entry
  }
  return out
}

function read(): Map {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = migrateLegacy(JSON.parse(raw))
    const now = Date.now()
    const cleaned: Map = {}
    let changed = false
    for (const [id, entry] of Object.entries(parsed)) {
      if (now - entry.ts < TTL_MS) cleaned[id] = entry
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

export function markRecentlyUpdated(id: string, type: RecentlyUpdatedType = 'mis_a_jour') {
  const m = read()
  m[id] = { ts: Date.now(), type }
  write(m)
}

export function isRecentlyUpdated(id: string): boolean {
  const m = read()
  const e = m[id]
  if (!e) return false
  return Date.now() - e.ts < TTL_MS
}

export function getRecentlyUpdatedEntry(id: string): Entry | null {
  const m = read()
  const e = m[id]
  if (!e) return null
  return Date.now() - e.ts < TTL_MS ? e : null
}

export function getRecentlyUpdatedMap(): Map {
  return read()
}

/** Temps relatif court : "à l'instant", "il y a 2 min", etc. */
export function relativeMinutes(ts: number): string {
  const diffMs = Date.now() - ts
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return "à l'instant"
  if (diffMin === 1) return 'il y a 1 min'
  return `il y a ${diffMin} min`
}

export function getBadgeStyleForType(type: RecentlyUpdatedType): { bg: string; fg: string; border: string; label: string } {
  switch (type) {
    case 'nouveau':
      return { bg: 'var(--success-soft)', fg: 'var(--success)', border: 'var(--success)', label: '✓ Nouveau' }
    case 'reactive':
      return { bg: 'var(--warning-soft)', fg: 'var(--warning)', border: 'var(--warning)', label: '✓ Réactivé' }
    case 'mis_a_jour':
    default:
      return { bg: 'var(--info-soft)', fg: 'var(--info)', border: 'var(--info)', label: '✓ Actualisé' }
  }
}

export function onRecentlyUpdatedChange(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(EVENT, cb)
  return () => window.removeEventListener(EVENT, cb)
}

export const RECENTLY_UPDATED_EVENT = EVENT
