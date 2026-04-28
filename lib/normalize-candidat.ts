// lib/normalize-candidat.ts
// Normalisation des données candidats AVANT écriture en DB (imports CV et OneDrive).
// Différent de format-candidat.ts (affichage UI) — ici on nettoie les données stockées.

import { normalizeLocalisation as normalizeLocalisationCanonical } from './normalize-localisation'

const PARTICLES = new Set([
  'de', 'da', 'das', 'do', 'dos', 'du',
  'van', 'von', 'ver', 'der', 'den',
  'del', 'della', 'di', 'dit',
  'des', 'le', 'la', 'las', 'los', 'el',
  'y', 'e', 'bin', 'binti', 'al',
])

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function isAllCaps(str: string): boolean {
  const letters = str.match(/[a-zA-ZÀ-ÿ]/g)
  if (!letters || letters.length === 0) return false
  return letters.every(c => c === c.toUpperCase())
}

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((part, i, arr) => {
      if (/^\s+$/.test(part) || part === '-') return part
      const isFirst = arr.slice(0, i).every(p => /^\s+$/.test(p) || p === '-')
      if (!isFirst && PARTICLES.has(part)) return part
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join('')
}

function inferPaysFromLocalisation(loc?: string | null): string {
  if (!loc) return 'Suisse'
  const l = loc.toLowerCase()
  if (l.includes('france')) return 'France'
  if (l.includes('portugal')) return 'Portugal'
  if (l.includes('espagne') || l.includes('spain')) return 'Espagne'
  if (l.includes('italie') || l.includes('italia')) return 'Italie'
  return 'Suisse'
}

// ─── FONCTIONS PUBLIQUES ──────────────────────────────────────────────────────

/**
 * Email : trim + lowercase + null si vide ou invalide (sans @ ou sans .)
 */
export function normalizeEmail(email: string): string | null {
  if (!email) return null
  const v = email.trim().toLowerCase()
  if (!v || !v.includes('@') || !v.includes('.')) return null
  return v
}

/**
 * Nom/prénom : Title Case UNIQUEMENT si tout en majuscules.
 * Ne touche pas les valeurs mixtes ("Pedro FERREIRA") ni tout en minuscules.
 * Particules (de, da, dos, du, van, von…) restent minuscules hors 1ère position.
 */
export function normalizeName(nom: string, prenom: string): { nom: string; prenom: string } {
  return {
    nom:    isAllCaps(nom)    ? toTitleCase(nom)    : nom,
    prenom: isAllCaps(prenom) ? toTitleCase(prenom) : prenom,
  }
}

/**
 * Téléphone : normalise vers +XX XX XX XX XX
 * - "079 123 45 67"  → "+41 79 123 45 67"
 * - "0041 79 123..."  → "+41 79 123 45 67"
 * - "+41 0766810784"  → "+41 76 681 07 84" (fix double-préfixe)
 * - "06 12 34 56 78"  → "+33 6 12 34 56 78"
 * paysDefaut : "Suisse" | "France" | ... (utilisé quand impossible à inférer du numéro)
 */
export function normalizeTelephone(tel: string, paysDefaut = 'Suisse'): string | null {
  if (!tel) return null

  const hasPlus = tel.trimStart().startsWith('+')
  const digits = tel.replace(/\D/g, '')
  if (!digits || digits.length < 7 || digits.length > 15) return null

  let country = ''
  let local = ''

  if (hasPlus) {
    // Numéro avec indicatif international
    if (digits.startsWith('41')) {
      country = '41'; local = digits.slice(2)
      // Fix double-préfixe : +41 0766... → enlever le 0 redondant
      if (local.startsWith('0') && local.length === 10) local = local.slice(1)
    } else if (digits.startsWith('351')) {
      country = '351'; local = digits.slice(3)
    } else if (digits.startsWith('33')) {
      country = '33'; local = digits.slice(2)
    } else if (digits.startsWith('34')) {
      country = '34'; local = digits.slice(2)
    } else if (digits.startsWith('39')) {
      country = '39'; local = digits.slice(2)
    } else {
      // Autre pays — retourner sans reformatage des espaces
      return '+' + digits
    }
  } else if (digits.startsWith('0041')) {
    country = '41'; local = digits.slice(4)
  } else if (digits.startsWith('0033')) {
    country = '33'; local = digits.slice(4)
  } else if (digits.startsWith('00')) {
    // Autre 00XX — retourner avec + sans reformatage
    return '+' + digits.slice(2)
  } else if (digits.startsWith('0')) {
    // Numéro local avec 0 initial
    local = digits.slice(1)
    // 076-079 = mobile suisse ; 02x-09x landline suisse ou mobile français
    const isFranceMobile = /^[67]/.test(local) && paysDefaut === 'France'
    const isSwissMobile  = /^7[6-9]/.test(local)
    if (isSwissMobile || paysDefaut !== 'France') {
      country = '41'
    } else if (isFranceMobile) {
      country = '33'
    } else {
      country = '41' // Suisse par défaut
    }
  } else {
    // Numéro sans 0 ni + — inférer pays
    local = digits
    country = paysDefaut === 'France' ? '33' : '41'
  }

  // Validation longueur locale
  if (country === '41' && local.length !== 9) return '+41' + local
  if (country === '33' && local.length !== 9) return '+33' + local

  // Formatage final
  if (country === '41') {
    // Suisse : +41 XX XXX XX XX
    return `+41 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5, 7)} ${local.slice(7, 9)}`
  }
  if (country === '33') {
    // France : +33 X XX XX XX XX
    return `+33 ${local.slice(0, 1)} ${local.slice(1, 3)} ${local.slice(3, 5)} ${local.slice(5, 7)} ${local.slice(7, 9)}`
  }

  return '+' + country + local
}

/**
 * Localisation : format strict "CP Ville, Pays" (CH/FR) ou "Ville, Pays" (autres).
 * Délègue à `lib/normalize-localisation.ts` (lookup CP via datasets geonames officiels).
 * Garde la valeur originale si normalisation impossible (pas de perte de données).
 *
 * Exemples (v1.9.108) :
 * - "Monthey, Suisse"          → "1870 Monthey, Suisse"
 * - "1870 Monthey, Suisse"     → inchangé (idempotent)
 * - "Sion, VS"                 → "1950 Sion, Suisse"
 * - "Rue X 12, 1873 Val d'Illiez" → "1873 Val-d'Illiez, Suisse"
 * - "74500 Évian-les-Bains"    → "74500 Évian-les-Bains, France"
 */
export function normalizeLocalisation(lieu: string): string {
  if (!lieu) return lieu
  const result = normalizeLocalisationCanonical(lieu)
  return result ?? lieu
}

// ─── WRAPPER D'INTÉGRATION ────────────────────────────────────────────────────

/**
 * Normalise les champs d'identité d'un objet analyse IA en place.
 * À appeler juste avant findExistingCandidat dans /api/cv/parse et /api/onedrive/sync.
 */
export function normalizeCandidat(analyse: {
  nom?: string | null
  prenom?: string | null
  email?: string | null
  telephone?: string | null
  localisation?: string | null
}): void {
  // Localisation en premier (sert à inférer le pays pour le téléphone)
  if (analyse.localisation) {
    analyse.localisation = normalizeLocalisation(analyse.localisation)
  }
  // Noms
  if (analyse.nom || analyse.prenom) {
    const result = normalizeName(analyse.nom ?? '', analyse.prenom ?? '')
    if (analyse.nom)    analyse.nom    = result.nom    || analyse.nom
    if (analyse.prenom) analyse.prenom = result.prenom || analyse.prenom
  }
  // Email
  if (analyse.email !== undefined) {
    analyse.email = normalizeEmail(analyse.email ?? '') ?? null
  }
  // Téléphone
  if (analyse.telephone) {
    const paysDefaut = inferPaysFromLocalisation(analyse.localisation)
    analyse.telephone = normalizeTelephone(analyse.telephone, paysDefaut) ?? analyse.telephone
  }
}
