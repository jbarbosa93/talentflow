// lib/format-candidat.ts
// Fonctions de normalisation pour l'affichage des données candidats
// Affichage uniquement — ne modifie pas les données en base

/**
 * Capitalise chaque mot : "jean-paul DUPONT" → "Jean-Paul Dupont"
 * Gère les traits d'union, espaces multiples, et les particules (de, du, van, etc.)
 */
export function formatName(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .trim()
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((part, i, arr) => {
      // Préserver les séparateurs (espaces, tirets)
      if (/^\s+$/.test(part) || part === '-') return part
      // Particules françaises/néerlandaises : ne pas capitaliser si pas en début
      const particules = ['de', 'du', 'des', 'le', 'la', 'les', 'van', 'von', 'der', 'den', 'dit', 'el']
      const isFirst = arr.slice(0, i).every(p => /^\s+$/.test(p) || p === '-')
      if (!isFirst && particules.includes(part)) return part
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join('')
}

/**
 * Email en minuscule
 */
export function formatEmail(value: string | null | undefined): string {
  if (!value) return ''
  return value.trim().toLowerCase()
}

/**
 * Ville avec première lettre majuscule par mot
 * "GENÈVE" → "Genève", "saint-gall" → "Saint-Gall"
 */
export function formatCity(value: string | null | undefined): string {
  if (!value) return ''
  return formatName(value)
}

/**
 * Pays avec première lettre majuscule
 */
export function formatCountry(value: string | null | undefined): string {
  if (!value) return ''
  return formatName(value)
}

/**
 * Nom complet formaté : Prénom Nom
 */
export function formatFullName(prenom: string | null | undefined, nom: string | null | undefined): string {
  const p = formatName(prenom)
  const n = formatName(nom)
  return [p, n].filter(Boolean).join(' ')
}

/**
 * Initiales formatées (toujours en majuscule)
 */
export function formatInitials(prenom: string | null | undefined, nom: string | null | undefined): string {
  const p = (prenom || '').trim()[0] || ''
  const n = (nom || '').trim()[0] || ''
  return (p + n).toUpperCase()
}
