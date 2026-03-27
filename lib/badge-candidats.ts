// lib/badge-candidats.ts
// Gestion centralisée des badges "nouveau/mis à jour" dans la liste candidats
// Partagé entre CandidatsList, Sidebar, et la fiche candidat

export const VIEWED_KEY = 'talentflow_viewed_candidats'
export const SEUIL_JOURS = 30
export const SEUIL_MS = SEUIL_JOURS * 24 * 60 * 60 * 1000

/** Lire la liste des fiches ouvertes depuis localStorage */
export function getViewedSet(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try { return new Set(JSON.parse(localStorage.getItem(VIEWED_KEY) || '[]')) }
  catch { return new Set() }
}

/** Dispatcher l'événement global de changement de badge */
export function dispatchBadgesChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('talentflow:badges-changed'))
  }
}

/** Marquer une fiche comme vue — badge disparaît */
export function markCandidatVu(id: string) {
  if (typeof window === 'undefined') return
  try {
    const set = getViewedSet()
    set.add(id)
    localStorage.setItem(VIEWED_KEY, JSON.stringify([...set]))
    dispatchBadgesChanged()
  } catch { /* ignore */ }
}

/** Marquer une fiche comme non vue — badge réapparaît */
export function markCandidatNonVu(id: string) {
  if (typeof window === 'undefined') return
  try {
    const set = getViewedSet()
    set.delete(id)
    localStorage.setItem(VIEWED_KEY, JSON.stringify([...set]))
    dispatchBadgesChanged()
  } catch { /* ignore */ }
}

/** Marquer plusieurs fiches comme vues d'un coup (ex: "Tout marquer vu") */
export function markTousVus(ids: string[]) {
  if (typeof window === 'undefined') return
  try {
    const set = getViewedSet()
    ids.forEach(id => set.add(id))
    localStorage.setItem(VIEWED_KEY, JSON.stringify([...set]))
    dispatchBadgesChanged()
  } catch { /* ignore */ }
}

/** Est-ce que ce candidat a été créé/mis à jour dans les 30 derniers jours ? */
export function isRecent(created_at: string | null | undefined): boolean {
  if (!created_at) return false
  return Date.now() - new Date(created_at).getTime() < SEUIL_MS
}

/** Badge actif si récent ET pas encore vu */
export function hasBadge(id: string, created_at: string | null | undefined, viewedSet: Set<string>): boolean {
  return isRecent(created_at) && !viewedSet.has(id)
}
