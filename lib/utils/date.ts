// TalentFlow — Helpers de date canoniques (format suisse)
//
// Objectif : source UNIQUE de formatage de date pour le projet.
// Migrer progressivement les 13 implémentations locales existantes vers ce module.
// Voir l'audit Fix 12 pour la liste des fichiers à migrer.
//
// Convention L-Agence : format suisse (points, pas de slashes).

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return '—'
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}.${month}.${year}`
}

export function formatDateShort(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return '—'
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}.${month}`
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return '—'
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${day}.${month}.${year} ${hh}:${mm}`
}

/**
 * Format long FR (ex: "12 mai 2026") — utile pour emails/PDFs où on veut un mois en lettres.
 */
export function formatDateLongFr(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(d)
}
