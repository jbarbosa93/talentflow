// TalentFlow Sign — Helpers utilitaires côté wizard
// v2.2.0 — Phase 4a-bis-2
//
// Helpers partagés entre le rendu wizard et l'éditeur.

import type { SignField, SignFieldType, SignFieldCondition } from './types'

/**
 * v2.2.4 — Mapping nom de jour → offset depuis lundi (0 = lundi, 6 = dimanche).
 * Utilisé pour auto-remplir un field type=date selon sa wizardSection ("Lundi", "Mardi"…).
 */
export const DAY_OFFSETS: Record<string, number> = {
  lundi: 0,
  mardi: 1,
  mercredi: 2,
  jeudi: 3,
  vendredi: 4,
  samedi: 5,
  dimanche: 6,
}

/**
 * v2.2.4 — Si la wizardSection est un nom de jour, retourne l'offset (0-6) depuis
 * le lundi. Sinon retourne null. Insensible à la casse, accepte "Lundi 04.05".
 */
export function getDayOffsetFromSection(section: string | undefined | null): number | null {
  if (!section) return null
  const key = section.trim().toLowerCase().split(/\s+/)[0]  // "Lundi 04.05" → "lundi"
  return key in DAY_OFFSETS ? DAY_OFFSETS[key] : null
}

/**
 * v2.2.4 — Calcule la date ISO (YYYY-MM-DD) du jour Lundi+offset à partir
 * de la weekStartDate (qui doit être un lundi en ISO).
 */
export function dateForDayOfWeek(weekStartDateIso: string, dayOffset: number): string | null {
  if (!weekStartDateIso || dayOffset < 0 || dayOffset > 6) return null
  const d = new Date(weekStartDateIso + 'T00:00:00')
  if (isNaN(d.getTime())) return null
  d.setDate(d.getDate() + dayOffset)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * v2.2.4 — Détecte si un field "ressemble" à un champ Société cliente.
 * Permet de pré-remplir avec context_data.companyName même si l'admin a configuré
 * le field en type=title (Fonction) ou text au lieu de type=company.
 * Heuristique : tooltip/label contient entreprise / société / raison sociale / nom du client.
 */
export function looksLikeCompanyField(field: SignField): boolean {
  if (field.type === 'company') return true
  if (field.type !== 'title' && field.type !== 'text') return false
  const txt = `${field.tooltip || ''} ${field.label || ''}`.toLowerCase()
  return /(entreprise|soci[ée]t[ée]|raison\s*sociale|nom\s*du\s*client|cliente)/.test(txt)
}

/**
 * Détecte si un field text devrait être rendu comme date picker.
 * Heuristique : tooltip / label contient "date" + (naissance|expiration|début|fin|...).
 */
export function looksLikeDateField(field: SignField): boolean {
  if (field.type !== 'text') return false
  const txt = `${field.tooltip || ''} ${field.label || ''}`.toLowerCase()
  if (!/\bdate\b/.test(txt)) return false
  // Filtre faux-positifs ("date de signature" est déjà type=date)
  return /(naissance|nation|expir|début|debut|fin\b|d['e]\s*entrée|emmenag|engag|d['e]\s*ent|terme|sortie|arriv)/i.test(txt)
}

/**
 * Détecte si un field select devrait être enrichi avec une liste pays Europe complète.
 * Heuristique : tooltip / label mentionne "nationalité" / "pays" / "permis" et listItems
 * existant ≤ 10 items (= liste DocuSign incomplète).
 */
export function looksLikeCountrySelect(field: SignField): boolean {
  if (field.type !== 'select') return false
  const txt = `${field.tooltip || ''} ${field.label || ''}`.toLowerCase()
  if (!/(nationalit|pays\b|country)/i.test(txt)) return false
  const items = (field.metadata?.listItems as unknown[] | undefined) || []
  return items.length <= 10
}

/**
 * Liste de pays Europe + monde priorisée (Suisse + UE + ressortissants fréquents).
 * Format DocuSign-compatible : { text, value }.
 */
export const EUROPEAN_COUNTRIES: { text: string; value: string }[] = [
  { text: 'Suisse', value: 'Suisse' },
  { text: 'France', value: 'France' },
  { text: 'Italie', value: 'Italie' },
  { text: 'Allemagne', value: 'Allemagne' },
  { text: 'Espagne', value: 'Espagne' },
  { text: 'Portugal', value: 'Portugal' },
  { text: 'Belgique', value: 'Belgique' },
  { text: 'Autriche', value: 'Autriche' },
  { text: 'Pays-Bas', value: 'Pays-Bas' },
  { text: 'Luxembourg', value: 'Luxembourg' },
  // Reste UE / EEE
  { text: 'Albanie', value: 'Albanie' },
  { text: 'Bulgarie', value: 'Bulgarie' },
  { text: 'Croatie', value: 'Croatie' },
  { text: 'Chypre', value: 'Chypre' },
  { text: 'Danemark', value: 'Danemark' },
  { text: 'Estonie', value: 'Estonie' },
  { text: 'Finlande', value: 'Finlande' },
  { text: 'Grèce', value: 'Grèce' },
  { text: 'Hongrie', value: 'Hongrie' },
  { text: 'Irlande', value: 'Irlande' },
  { text: 'Islande', value: 'Islande' },
  { text: 'Lettonie', value: 'Lettonie' },
  { text: 'Liechtenstein', value: 'Liechtenstein' },
  { text: 'Lituanie', value: 'Lituanie' },
  { text: 'Malte', value: 'Malte' },
  { text: 'Norvège', value: 'Norvège' },
  { text: 'Pologne', value: 'Pologne' },
  { text: 'République tchèque', value: 'République tchèque' },
  { text: 'Roumanie', value: 'Roumanie' },
  { text: 'Royaume-Uni', value: 'Royaume-Uni' },
  { text: 'Slovaquie', value: 'Slovaquie' },
  { text: 'Slovénie', value: 'Slovénie' },
  { text: 'Suède', value: 'Suède' },
  // Balkans / Europe orientale
  { text: 'Bosnie-Herzégovine', value: 'Bosnie-Herzégovine' },
  { text: 'Kosovo', value: 'Kosovo' },
  { text: 'Macédoine du Nord', value: 'Macédoine du Nord' },
  { text: 'Moldavie', value: 'Moldavie' },
  { text: 'Monténégro', value: 'Monténégro' },
  { text: 'Serbie', value: 'Serbie' },
  { text: 'Turquie', value: 'Turquie' },
  { text: 'Ukraine', value: 'Ukraine' },
  // Amériques + Afrique fréquents (à L-Agence)
  { text: 'Brésil', value: 'Brésil' },
  { text: 'Cap-Vert', value: 'Cap-Vert' },
  { text: 'Maroc', value: 'Maroc' },
  { text: 'Tunisie', value: 'Tunisie' },
  { text: 'Algérie', value: 'Algérie' },
  { text: 'Sénégal', value: 'Sénégal' },
  { text: 'Côte d\'Ivoire', value: 'Côte d\'Ivoire' },
  { text: 'États-Unis', value: 'États-Unis' },
  { text: 'Canada', value: 'Canada' },
  // Autre
  { text: 'Autre', value: 'Autre' },
]

/**
 * Évalue une SignFieldCondition au runtime contre les valeurs courantes.
 * Retourne true si la condition est satisfaite (= action s'applique).
 */
export function evaluateCondition(
  cond: SignFieldCondition,
  fieldValues: Record<string, unknown>,
): boolean {
  const triggerVal = fieldValues[cond.triggerFieldId]
  const op = cond.operator
  const cmp = cond.value

  const triggerStr = triggerVal === undefined || triggerVal === null ? '' : String(triggerVal).trim()
  const cmpStr = cmp === undefined || cmp === null ? '' : String(cmp).trim()

  switch (op) {
    case 'equals':
      // Pour checkbox : true === "true"
      if (typeof triggerVal === 'boolean') return triggerVal === (cmpStr === 'true')
      return triggerStr === cmpStr
    case 'notEquals':
      if (typeof triggerVal === 'boolean') return triggerVal !== (cmpStr === 'true')
      return triggerStr !== cmpStr
    case 'gte':  return Number(triggerStr) >= Number(cmpStr)
    case 'lte':  return Number(triggerStr) <= Number(cmpStr)
    case 'gt':   return Number(triggerStr) >  Number(cmpStr)
    case 'lt':   return Number(triggerStr) <  Number(cmpStr)
    case 'isEmpty':
      if (typeof triggerVal === 'boolean') return !triggerVal
      return !triggerStr
    case 'isNotEmpty':
      if (typeof triggerVal === 'boolean') return triggerVal
      return !!triggerStr
    default:
      return false
  }
}

/**
 * v2.2.1 — Calcule la valeur d'un champ formula à partir des valeurs courantes.
 * Si pas de sources ou résultat invalide → null.
 */
export function computeFormulaValue(
  field: SignField,
  fieldValues: Record<string, unknown>,
): number | null {
  if (field.type !== 'formula') return null
  const sources = field.formulaSourceIds || []
  if (sources.length === 0) return null
  const op = field.formulaOp || 'sum'

  const nums: number[] = []
  for (const id of sources) {
    const v = fieldValues[id]
    if (v === undefined || v === null || v === '') continue
    // v2.2.2 — Support checkbox : true=1, false=0 (permet "Nombre de cases cochées" via sum)
    if (typeof v === 'boolean') { nums.push(v ? 1 : 0); continue }
    // String "true"/"false" (sérialisations diverses) → idem
    if (v === 'true')  { nums.push(1); continue }
    if (v === 'false') { nums.push(0); continue }
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
    if (Number.isFinite(n)) nums.push(n)
  }
  if (nums.length === 0) return 0  // 0 plutôt que null pour afficher "0" au lieu de vide

  switch (op) {
    case 'sum': return nums.reduce((a, b) => a + b, 0)
    case 'avg': return nums.reduce((a, b) => a + b, 0) / nums.length
    case 'mul': return nums.reduce((a, b) => a * b, 1)
    case 'min': return Math.min(...nums)
    case 'max': return Math.max(...nums)
    case 'sub': {
      // a - b - c... : 1er - somme des suivants
      const [first, ...rest] = nums
      return rest.reduce((acc, n) => acc - n, first)
    }
    default: return null
  }
}

/** Format une valeur calculée selon le nombre de décimales du field. */
export function formatFormulaValue(field: SignField, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return ''
  const dec = field.formulaDecimals ?? 2
  // Sans décimales si entier exact et dec=2 par défaut
  if (Math.abs(value % 1) < 1e-9) return value.toFixed(0)
  return value.toFixed(dec)
}

/**
 * Calcule l'état effectif d'un field au runtime (visible/required) en fonction
 * de ses conditions et des valeurs courantes.
 */
export function effectiveFieldState(
  field: SignField,
  fieldValues: Record<string, unknown>,
): { visible: boolean; required: boolean } {
  let visible = true
  let required = !!field.required
  if (!field.conditions || field.conditions.length === 0) return { visible, required }
  for (const cond of field.conditions) {
    const met = evaluateCondition(cond, fieldValues)
    if (!met) continue
    switch (cond.action) {
      case 'hide':       visible = false; break
      case 'show':       visible = true; break
      case 'require':    required = true; break
      case 'unrequire':  required = false; break
    }
  }
  return { visible, required }
}
