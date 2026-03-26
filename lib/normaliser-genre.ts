/**
 * Normalise la valeur du genre retournée par Claude ou importée.
 * Accepte M, F, Male, Female, homme, femme (insensible à la casse).
 * Tout autre valeur → null (jamais d'erreur DB).
 */
export function normaliserGenre(raw: unknown): 'homme' | 'femme' | null {
  if (!raw) return null
  const g = String(raw).trim().toLowerCase()
  if (g === 'm' || g === 'male' || g === 'homme') return 'homme'
  if (g === 'f' || g === 'female' || g === 'femme') return 'femme'
  return null
}
