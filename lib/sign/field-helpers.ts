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
 * v2.9.27 — Détecte si un champ `number` est un champ téléphone d'après son
 * libellé (« Tél. portable », « Téléphone », « Natel »…). Sert de FALLBACK
 * quand l'admin n'a pas réglé « Format du champ → Téléphone » (autoFillSource).
 * Vocabulaire phone très spécifique → quasi aucun faux positif.
 */
export function looksLikePhoneField(field: SignField): boolean {
  if (field.autoFillSource === 'phone') return true
  if (field.type !== 'number') return false
  const txt = `${field.tooltip || ''} ${field.label || ''}`
  return /(t[ée]l[ée]phone|t[ée]l\.|\bnatel\b|\bportable\b|\bgsm\b)/i.test(txt)
}

/**
 * v2.9.57 — Détecte si un champ téléphone DEVRAIT être pré-rempli avec le
 * téléphone du candidat lui-même (vs. téléphone d'urgence / conjoint / parent
 * qui ne sont PAS le numéro du candidat).
 *
 * v2.9.58 — Priorité au flag explicite `autoFillCandidatePhone` :
 *  - true  → toujours pré-remplir (l'admin a coché la case)
 *  - false → jamais pré-remplir (l'admin a explicitement décoché)
 *  - undefined → fallback heuristique mots-clés (rétrocompat templates existants)
 *
 * Heuristique fallback (si flag undefined) :
 *  - Doit ressembler à un champ téléphone (looksLikePhoneField).
 *  - NE doit PAS contenir de mots-clés "tiers" : urgence, conjoint, parent,
 *    proche, famille, maman, papa, employeur, contact, mère, père.
 */
export function isCandidatePhoneField(field: SignField): boolean {
  // v2.9.58 — Flag explicite gagne TOUJOURS sur l'heuristique
  if (typeof field.autoFillCandidatePhone === 'boolean') {
    return field.autoFillCandidatePhone
  }
  if (!looksLikePhoneField(field)) return false
  const txt = `${field.tooltip || ''} ${field.label || ''}`.toLowerCase()
  // Mots-clés EXCLUSIFS (= n'est PAS le téléphone du candidat)
  const isThirdParty = /(urgence|conjoint|m[èe]re\b|p[èe]re\b|maman|papa|parent|proche|famille|employeur|contact\b|enfant)/i.test(txt)
  return !isThirdParty
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

// ─────────────────────────────────────────────────────────────────────
// v2.9.18 — Listes prédéfinies pour les champs `select` (liste déroulante).
// L'admin peut charger une liste d'un clic dans l'éditeur de template au
// lieu de saisir chaque option à la main.
// ─────────────────────────────────────────────────────────────────────
type ListItem = { text: string; value: string }
const li = (...labels: string[]): ListItem[] => labels.map(l => ({ text: l, value: l }))

/** Permis de conduire CH + UE (catégories officielles OFROU/SECO). */
export const PERMIS_CONDUIRE: ListItem[] = li(
  'A', 'A1', 'A35kW', 'B', 'B1', 'BE', 'C', 'C1', 'C1E', 'CE',
  'D', 'D1', 'D1E', 'DE', 'F', 'G', 'M', 'Aucun',
)

/** Permis de séjour suisse (catégories officielles SEM). */
export const PERMIS_SEJOUR: ListItem[] = li(
  'Citoyen suisse', 'Permis C (établissement)', 'Permis B (séjour)',
  'Permis L (courte durée)', 'Permis G (frontalier)', 'Permis Ci',
  'Permis F (admission provisoire)', 'Permis N (requérant d\'asile)',
  'Permis S', 'En cours', 'Autre',
)

/** Cantons suisses (26). */
export const CANTONS_SUISSES: ListItem[] = li(
  'Argovie', 'Appenzell Rh.-Ext.', 'Appenzell Rh.-Int.', 'Bâle-Campagne',
  'Bâle-Ville', 'Berne', 'Fribourg', 'Genève', 'Glaris', 'Grisons', 'Jura',
  'Lucerne', 'Neuchâtel', 'Nidwald', 'Obwald', 'Schaffhouse', 'Schwytz',
  'Soleure', 'St-Gall', 'Tessin', 'Thurgovie', 'Uri', 'Valais', 'Vaud',
  'Zoug', 'Zurich',
)

/** État civil. */
export const ETAT_CIVIL: ListItem[] = li(
  'Célibataire', 'Marié(e)', 'Partenariat enregistré', 'Séparé(e)',
  'Divorcé(e)', 'Veuf/Veuve',
)

/** Oui / Non. */
export const OUI_NON: ListItem[] = li('Oui', 'Non')

/** Genre / civilité. */
export const CIVILITE: ListItem[] = li('Monsieur', 'Madame')

/** Taux d'occupation fréquents. */
export const TAUX_OCCUPATION: ListItem[] = li(
  '100%', '90%', '80%', '70%', '60%', '50%', '40%', '< 40%',
)

/** Caisses maladie suisses principales. */
export const CAISSES_MALADIE: ListItem[] = li(
  'Helsana', 'CSS', 'Swica', 'Groupe Mutuel', 'Visana', 'Concordia',
  'Sanitas', 'Assura', 'Sympany', 'KPT', 'Atupri', 'EGK', 'Autre',
)

/** Registre central des presets — utilisé par le sélecteur de l'éditeur. */
export const LIST_PRESETS: { key: string; label: string; items: ListItem[] }[] = [
  { key: 'countries',  label: '🌍 Nationalités / Pays (Europe + monde)', items: EUROPEAN_COUNTRIES },
  { key: 'permis_conduire', label: '🚗 Permis de conduire (A→G)',         items: PERMIS_CONDUIRE },
  { key: 'permis_sejour',   label: '🪪 Permis de séjour (B, C, L, G…)',   items: PERMIS_SEJOUR },
  { key: 'cantons',    label: '🏔️ Cantons suisses (26)',                  items: CANTONS_SUISSES },
  { key: 'etat_civil', label: '💍 État civil',                            items: ETAT_CIVIL },
  { key: 'civilite',   label: '👤 Civilité (M./Mme)',                     items: CIVILITE },
  { key: 'oui_non',    label: '✅ Oui / Non',                             items: OUI_NON },
  { key: 'taux',       label: '📊 Taux d\'occupation',                    items: TAUX_OCCUPATION },
  { key: 'caisses',    label: '🏥 Caisses maladie',                       items: CAISSES_MALADIE },
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
  if (!field.conditions || field.conditions.length === 0) {
    return { visible: true, required: !!field.required }
  }
  // v2.9.1 — Si une règle `show` est définie, défaut = caché (le show l'allume quand la cond est vraie).
  // Idem pour `require` : défaut = non obligatoire si une règle `require` existe.
  // Sinon les actions `show`/`require` ne servent à rien (visible/required déjà true par défaut).
  const hasShow    = field.conditions.some(c => c.action === 'show')
  const hasRequire = field.conditions.some(c => c.action === 'require')
  let visible  = hasShow    ? false : true
  let required = hasRequire ? false : !!field.required
  for (const cond of field.conditions) {
    const met = evaluateCondition(cond, fieldValues)
    if (!met) continue
    switch (cond.action) {
      case 'hide':       visible = false; break
      case 'show':       visible = true; break
      case 'require':    required = true; break
      case 'unrequire':  required = false; break
      // v2.7.7 — check/uncheck gérés par effectiveCheckedState (n'affectent pas visible/required)
    }
  }
  return { visible, required }
}

/**
 * v2.7.7 — État effectif "coché/décoché" d'une checkbox calculé depuis les conditions
 * `check` / `uncheck`. Retourne :
 *   - true  si une condition check a matché (et c'est la dernière action)
 *   - false si une condition uncheck a matché
 *   - undefined si aucune condition check/uncheck n'a matché → utiliser metadata.selected (default)
 *
 * Le candidat peut TOUJOURS override ce calcul en cliquant manuellement.
 * Le helper isCheckboxOverridden() détecte si l'utilisateur a fait une action explicite.
 */
export function effectiveCheckedState(
  field: SignField,
  fieldValues: Record<string, unknown>,
): boolean | undefined {
  if (field.type !== 'checkbox') return undefined
  if (!field.conditions || field.conditions.length === 0) return undefined
  let result: boolean | undefined = undefined
  for (const cond of field.conditions) {
    const met = evaluateCondition(cond, fieldValues)
    if (!met) continue
    if (cond.action === 'check') result = true
    else if (cond.action === 'uncheck') result = false
  }
  return result
}

/**
 * v2.7.8 — Détecte si une chaîne ressemble à un label DocuSign auto-généré
 * (ex: "Case à cocher d109a26e-ffbe-4d9c-9f6e-24f34c0ede36").
 * Ces labels viennent de l'import JSON DocuSign et sont illisibles.
 */
const UUID_LIKE_LABEL_RE = /^(?:Texte|Date|Liste|Signature|Case à cocher|Annotation|Liste déroulante|E.?mail|Prénom|Nom|Société|Fonction|Numéro)\s+[0-9a-fA-F-]{8,}/

/**
 * v2.7.8 — Retourne un nom lisible pour un field, utilisable dans les dropdowns
 * (éditeurs de conditions, sélecteurs de champ déclencheur, etc.).
 *
 * Priorité :
 *   1. tooltip (le nom humain, prioritaire)
 *   2. label s'il n'est pas UUID-like
 *   3. type label (Texte / Date / etc.) en fallback
 *
 * Si une `wizardSection` est définie, elle est préfixée pour disambigüer
 * (ex: "Permis de conduire — Oui" au lieu de juste "Oui").
 *
 * @example
 *   getFieldDisplayLabel({type:'checkbox', wizardSection:'Permis de conduire', tooltip:'Oui'})
 *   → "Permis de conduire — Oui"
 */
export function getFieldDisplayLabel(
  field: SignField,
  typeFallback?: string,
): string {
  const section = (field.wizardSection || '').trim()
  const tooltip = (field.tooltip || '').trim()
  const lbl = (field.label || '').trim()
  let name: string
  if (tooltip) name = tooltip
  else if (lbl && !UUID_LIKE_LABEL_RE.test(lbl)) name = lbl
  else name = typeFallback || field.type
  return section ? `${section} — ${name}` : name
}

/**
 * v2.7.8 — Groupe des fields par wizardSection pour afficher dans un dropdown
 * avec optgroups. Les fields sans section sont dans le bucket null.
 */
export function groupFieldsBySection(
  fields: SignField[],
): Array<{ section: string | null; fields: SignField[] }> {
  const map = new Map<string | null, SignField[]>()
  for (const f of fields) {
    const sec = (f.wizardSection || '').trim() || null
    const arr = map.get(sec) || []
    arr.push(f)
    map.set(sec, arr)
  }
  // Sections en premier (tri alpha FR), puis null à la fin
  const sections = Array.from(map.keys()).filter(s => s !== null).sort((a, b) => a!.localeCompare(b!, 'fr'))
  const result: Array<{ section: string | null; fields: SignField[] }> = []
  for (const s of sections) result.push({ section: s, fields: map.get(s)! })
  if (map.has(null)) result.push({ section: null, fields: map.get(null)! })
  return result
}
