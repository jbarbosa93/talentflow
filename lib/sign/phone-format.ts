// TalentFlow Sign — Normalisation E.164 des numéros WhatsApp
// v2.2.5 — Phase 4d

/**
 * Normalise un numéro saisi par l'utilisateur en format E.164 strict.
 * Accepte : +41 79 123 45 67, 0041791234567, 0791234567 (assume Suisse), etc.
 * Retourne : +41791234567 (regex `^\+\d{10,15}$`).
 *
 * Politique :
 *   - Si commence par '+' → garde le préfixe, vire tout ce qui n'est pas chiffre derrière
 *   - Si commence par '00' → remplace par '+'
 *   - Si commence par '0' (ex: 0791234567) → assume CH +41 (cas le plus fréquent)
 *   - Sinon → préfixe '+' (laisse le user assumer le code pays)
 *
 * Retourne null si invalide (longueur hors [10, 15] chiffres ou caractères non numériques restants).
 */
export function normalizePhoneE164(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  let digits: string
  let prefix = '+'

  if (trimmed.startsWith('+')) {
    digits = trimmed.slice(1).replace(/\D/g, '')
  } else if (trimmed.startsWith('00')) {
    digits = trimmed.slice(2).replace(/\D/g, '')
  } else if (trimmed.startsWith('0')) {
    // Convention CH par défaut (cas le plus fréquent du repo)
    digits = '41' + trimmed.slice(1).replace(/\D/g, '')
  } else {
    digits = trimmed.replace(/\D/g, '')
  }

  if (digits.length < 10 || digits.length > 15) return null
  return prefix + digits
}

/** Validation stricte : retourne true si déjà en E.164 valide. */
export function isE164(s: string | null | undefined): boolean {
  return !!s && /^\+\d{10,15}$/.test(s)
}

/**
 * Format affichable lisible (sans changer la valeur stockée) :
 *   +41791234567 → +41 79 123 45 67
 * Heuristique simple ; si pays inconnu, regroupe par 3.
 */
export function displayPhone(e164: string | null | undefined): string {
  if (!e164) return ''
  const m = e164.match(/^\+(\d{1,3})(\d+)$/)
  if (!m) return e164
  const [, cc, rest] = m
  // CH/FR (cc=41/33) : +CC X XX XX XX XX
  if (cc === '41' || cc === '33') {
    const groups = rest.match(/(\d)(\d{2})(\d{2})(\d{2})(\d{2,3})/)
    if (groups) return `+${cc} ${groups[1]} ${groups[2]} ${groups[3]} ${groups[4]} ${groups[5]}`
  }
  // Default : groupes de 3
  const grouped = rest.match(/.{1,3}/g)?.join(' ') || rest
  return `+${cc} ${grouped}`
}
