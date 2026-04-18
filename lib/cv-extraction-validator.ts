// lib/cv-extraction-validator.ts
// Validation post-extraction IA pour détecter les erreurs courantes :
// - Nom extrait qui ressemble à une entreprise (SA, Sàrl, AG, GmbH, Ltd, etc.)
// - Nom tronqué (noms composés portugais/espagnols perdus)
// - Champs manquants critiques
//
// Usage : après analyserCV/analyserCVDepuisPDF/analyserCVDepuisImage,
// appeler validateAnalyse(analyse) pour détecter les problèmes avant insert DB.

import type { CVAnalyse } from './claude'

// ─── Suffixes et mots-clés d'entreprise ───────────────────────────────────────

/** Suffixes légaux d'entreprises (sensibles à la casse car souvent en fin de mot). */
const COMPANY_SUFFIXES = [
  // Suisse / France / Allemagne
  'SA', 'S.A.', 'S.A',
  'Sàrl', 'SARL', 'S.A.R.L.', 'S.A.R.L',
  'AG', 'A.G.',
  'GmbH', 'G.m.b.H',
  'SAS', 'S.A.S.', 'S.A.S',
  'SNC', 'S.N.C.',
  'EURL', 'E.U.R.L.',
  'SCA', 'S.C.A.',
  'SCS', 'S.C.S.',
  // UK / US / International
  'Ltd', 'Ltd.', 'Limited',
  'LLC', 'L.L.C.',
  'Inc', 'Inc.', 'Incorporated',
  'Corp', 'Corp.', 'Corporation',
  'Co', 'Co.',
  'PLC', 'P.L.C.',
  // Italie / Espagne / Portugal
  'SpA', 'S.p.A.',
  'Srl', 's.r.l.', 'S.r.l.',
  'SL', 'S.L.',
  'SRL', 'S.R.L.',
  'Lda', 'Lda.', 'LDA',
  // Belgique / Pays-Bas
  'BV', 'B.V.',
  'BVBA', 'B.V.B.A.',
  'NV', 'N.V.',
  // Autres marqueurs fréquents
  'GmbH & Co. KG', 'KG',
  'Holding', 'Group', 'Groupe', 'International',
]

/** Mots-clés fréquents dans les noms d'entreprise (matching mot entier, insensible à la casse). */
const COMPANY_KEYWORDS = [
  'services', 'technology', 'technologies', 'consulting', 'solutions',
  'systems', 'partners', 'associates', 'international', 'global',
  'entreprise', 'construction', 'transport', 'logistics',
  // Domaines industriels fréquents chez les candidats TalentFlow
  'metalcolor', 'quadrigis', 'favre', 'besson', 'cowork',
]

// ─── Helpers ───────────────────────────────────────────────────────────────────

const unaccent = (s: string): string =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/**
 * Vérifie si une chaîne ressemble à un nom d'entreprise.
 * Critères (tous sont des signaux) :
 * - Contient un suffixe légal (SA, Sàrl, AG, GmbH, Ltd...)
 * - Tout en MAJUSCULES sur 3+ mots (ex: "METALCOLOR BESSON")
 * - Contient mots-clés d'entreprise (services, consulting, etc.)
 * - Contient "&" ou "+" (fréquent dans les raisons sociales)
 */
export function isCompanyLikeName(str: string): {
  suspect: boolean
  reason: string | null
} {
  if (!str || typeof str !== 'string') return { suspect: false, reason: null }
  const trimmed = str.trim()
  if (trimmed.length === 0) return { suspect: false, reason: null }

  // 1. Suffixe légal exact ou en fin de chaîne (délimité par espace ou ponctuation)
  for (const suffix of COMPANY_SUFFIXES) {
    const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`(^|\\s|,|/)${escaped}($|\\s|,|\\.|\\)|/)`, 'i')
    if (pattern.test(trimmed)) {
      return { suspect: true, reason: `suffixe entreprise "${suffix}" détecté` }
    }
  }

  // 2. Mots-clés d'entreprise fréquents (comparaison insensible casse/accents)
  const words = unaccent(trimmed.toLowerCase()).split(/[\s\-,.'"]+/).filter(Boolean)
  for (const keyword of COMPANY_KEYWORDS) {
    if (words.includes(keyword.toLowerCase())) {
      return { suspect: true, reason: `mot-clé entreprise "${keyword}" détecté` }
    }
  }

  // 3. "&" ou "+" typique des raisons sociales
  if (/[&+]/.test(trimmed)) {
    return { suspect: true, reason: 'caractère & ou + (raison sociale)' }
  }

  return { suspect: false, reason: null }
}

/** Retourne true si un prénom+nom combinés ressemblent à une entreprise. */
export function isFullNameCompanyLike(nom: string, prenom: string): {
  suspect: boolean
  reason: string | null
} {
  const full = `${prenom || ''} ${nom || ''}`.trim()
  return isCompanyLikeName(full)
}

// ─── Validation des champs critiques ──────────────────────────────────────────

export type ValidationWarning = {
  field: string
  severity: 'info' | 'warning' | 'error'
  message: string
}

/**
 * Valide une analyse CV extraite par l'IA et retourne les warnings détectés.
 * Ne modifie PAS l'analyse — retourne juste les problèmes.
 *
 * Utilisation type :
 *   const warnings = validateAnalyse(analyse)
 *   if (warnings.some(w => w.severity === 'error')) {
 *     // bloquer l'import ou déclencher une re-analyse
 *   }
 */
export function validateAnalyse(analyse: Partial<CVAnalyse>): ValidationWarning[] {
  const warnings: ValidationWarning[] = []

  // Check nom+prenom = entreprise
  if (analyse.nom || analyse.prenom) {
    const companyCheck = isFullNameCompanyLike(analyse.nom || '', analyse.prenom || '')
    if (companyCheck.suspect) {
      warnings.push({
        field: 'nom',
        severity: 'error',
        message: `Nom extrait ressemble à une entreprise : ${companyCheck.reason}`,
      })
    }
  }

  // Check nom isolé = entreprise
  if (analyse.nom && !analyse.prenom) {
    const companyCheck = isCompanyLikeName(analyse.nom)
    if (companyCheck.suspect) {
      warnings.push({
        field: 'nom',
        severity: 'error',
        message: `Nom seul ressemble à une entreprise : ${companyCheck.reason}`,
      })
    }
  }

  // Check nom placeholder "Candidat"
  if (analyse.nom === 'Candidat' && !analyse.prenom) {
    warnings.push({
      field: 'nom',
      severity: 'warning',
      message: 'Nom placeholder "Candidat" — extraction a probablement échoué',
    })
  }

  // Check email format basique
  if (analyse.email && typeof analyse.email === 'string') {
    const email = analyse.email.trim()
    if (email && (!email.includes('@') || !email.includes('.'))) {
      warnings.push({
        field: 'email',
        severity: 'warning',
        message: `Email mal formaté : "${email}"`,
      })
    }
  }

  // Check téléphone : au moins 8 chiffres
  if (analyse.telephone && typeof analyse.telephone === 'string') {
    const digits = analyse.telephone.replace(/\D/g, '')
    if (digits.length > 0 && digits.length < 8) {
      warnings.push({
        field: 'telephone',
        severity: 'warning',
        message: `Téléphone trop court (${digits.length} chiffres) : "${analyse.telephone}"`,
      })
    }
  }

  // Check DDN : si présente, doit être interprétable
  if (analyse.date_naissance && typeof analyse.date_naissance === 'string') {
    const ddn = analyse.date_naissance.trim()
    if (ddn && ddn !== '') {
      // Formats acceptés : DD/MM/YYYY, YYYY-MM-DD, YYYY seule, "XX ans", "XXans"
      const validFormat =
        /^\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{4}$/.test(ddn) ||
        /^\d{4}-\d{2}-\d{2}/.test(ddn) ||
        /^\d{4}$/.test(ddn) ||
        /^\d{1,2}\s?ans?$/i.test(ddn)
      if (!validFormat) {
        warnings.push({
          field: 'date_naissance',
          severity: 'warning',
          message: `DDN format non standard : "${ddn}"`,
        })
      }
    }
  }

  return warnings
}

/**
 * Classe les warnings en catégories pour un usage pratique.
 */
export function summarizeWarnings(warnings: ValidationWarning[]): {
  hasErrors: boolean
  hasWarnings: boolean
  errorFields: string[]
  warningFields: string[]
  summary: string
} {
  const errors = warnings.filter(w => w.severity === 'error')
  const warns = warnings.filter(w => w.severity === 'warning')
  return {
    hasErrors: errors.length > 0,
    hasWarnings: warns.length > 0,
    errorFields: errors.map(e => e.field),
    warningFields: warns.map(w => w.field),
    summary: warnings.map(w => `[${w.severity.toUpperCase()}] ${w.field}: ${w.message}`).join(' | '),
  }
}
