// lib/clients-seen.ts
// v2.1.14 — Tracker local des clients vus (badge isNew) pour qu'il disparaisse
// dès l'ouverture de la fiche, comme le badge per-user des candidats.

const STORAGE_KEY = 'talentflow_clients_seen_ids'
const MAX_IDS = 5000 // limite anti-bloat localStorage

function load(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || '[]'
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr : [])
  } catch { return new Set() }
}

function save(set: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    // Garde les MAX_IDS plus récents (LRU implicite par insertion order)
    const arr = Array.from(set)
    const trimmed = arr.length > MAX_IDS ? arr.slice(arr.length - MAX_IDS) : arr
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {}
}

export function getClientsSeenIds(): Set<string> {
  return load()
}

export function markClientSeen(id: string) {
  if (!id) return
  const s = load()
  if (s.has(id)) return
  s.add(id)
  save(s)
  // Broadcast pour que la liste re-render le badge
  try { window.dispatchEvent(new CustomEvent('talentflow:client-seen', { detail: id })) } catch {}
}

export function isClientSeen(id: string): boolean {
  return load().has(id)
}
