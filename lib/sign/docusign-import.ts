// TalentFlow Sign — Parser DocuSign JSON → format TalentFlow
// v2.2.0 — Phase 2
//
// Pur (pas de réseau, pas d'I/O). Testable.
// Convertit un export DocuSign (JSON envelope) en :
//   - liste de PDFs (base64) à uploader
//   - recipients_schema (signers + carbonCopies)
//   - fields normalisés 0-1 par doc/page
//
// DocuSign coords : top-left origine, en POINTS (72 dpi). Page A4 = 595×842 pts.
// Width/height = 0 sur signHere/checkbox = "auto-size" → on applique défauts au rendu.

import type {
  SignField,
  SignFieldType,
  SignRecipientSchema,
  SignDocument,
} from './types'

// ─── Types DocuSign minimaux (juste ce qu'on lit) ──────────────────────────

interface DocusignDoc {
  documentId: string
  name: string
  order?: string
  pages?: string
  documentBase64: string
}

interface DocusignTabBase {
  tabId?: string
  tabLabel?: string
  documentId: string         // index logique du doc (1, 2, 3...) cf. order
  recipientId: string
  pageNumber: string
  xPosition: string
  yPosition: string
  width?: string
  height?: string
  required?: string
  tabType?: string
  name?: string
  tooltip?: string
  value?: string
}

interface DocusignListTab extends DocusignTabBase {
  listItems?: { text: string; value: string; selected?: string }[]
}

interface DocusignTabGroup extends DocusignTabBase {
  groupLabel: string
  minimumRequired?: string
  maximumAllowed?: string
  groupRule?: string
  validationMessage?: string
}

interface DocusignSignerTabs {
  signHereTabs?: DocusignTabBase[]
  initialHereTabs?: DocusignTabBase[]
  textTabs?: DocusignTabBase[]
  numberTabs?: DocusignTabBase[]
  checkboxTabs?: (DocusignTabBase & { selected?: string; tabGroupLabels?: string[] })[]
  dateSignedTabs?: DocusignTabBase[]
  listTabs?: DocusignListTab[]
  firstNameTabs?: DocusignTabBase[]
  lastNameTabs?: DocusignTabBase[]
  fullNameTabs?: DocusignTabBase[]
  emailAddressTabs?: DocusignTabBase[]
  companyTabs?: DocusignTabBase[]
  titleTabs?: DocusignTabBase[]
  formulaTabs?: (DocusignTabBase & { formula?: string; isPaymentAmount?: string })[]
  attachmentTabs?: DocusignTabBase[]
  noteTabs?: DocusignTabBase[]
  tabGroups?: DocusignTabGroup[]
}

interface DocusignSigner {
  recipientId: string
  recipientIdGuid?: string
  name?: string
  email?: string
  roleName?: string
  routingOrder?: string
  tabs?: DocusignSignerTabs
}

interface DocusignCC {
  recipientId: string
  name?: string
  email?: string
  roleName?: string
  routingOrder?: string
}

interface DocusignEnvelope {
  emailSubject?: string
  documents?: DocusignDoc[]
  recipients?: {
    signers?: DocusignSigner[]
    carbonCopies?: DocusignCC[]
  }
}

// ─── Sortie du parser ──────────────────────────────────────────────────────

export interface ParsedDocusignDocument {
  /** order DocuSign (1-based) — utilisé comme clé pour mapper les tabs */
  docOrderKey: string
  /** données pour upload + insert */
  name: string
  base64: string
  /** dimensions par défaut PDF DocuSign (A4 portrait) — affinées après lecture du PDF */
  defaultPageDimensions: { width: number; height: number }
  /** champs (sans coords pixel — on conserve les coords pts pour normalisation après) */
  fieldsRawByPage: Map<number, ParsedTabRaw[]>
}

interface ParsedTabRaw {
  type: SignFieldType
  // pts (top-left origin)
  x: number
  y: number
  w: number
  h: number
  page: number
  recipientOrder: number
  label: string
  /** Texte d'aide DocuSign (tab.tooltip) — utilisé par commonTooltip() pour titrer les étapes */
  tooltip?: string
  required: boolean
  source: 'docusign'
  metadata: Record<string, unknown>
  // v2.2.0 Phase 2.5 — Groupe de cases à cocher (issu des tabGroups DocuSign)
  groupId?: string
  groupName?: string
  groupRule?: 'SelectAtLeast' | 'SelectAtMost' | 'SelectExactly'
  groupMin?: number
  groupMax?: number
}

export interface ParsedDocusign {
  templateName: string
  templateDescription: string | null
  documents: ParsedDocusignDocument[]
  recipientsSchema: SignRecipientSchema[]
  /** total fields tous docs / pages (pour log) */
  fieldsCount: number
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const A4_W = 595
const A4_H = 842

/** Tailles par défaut quand DocuSign retourne 0×0 (auto-size côté DS). En pts. */
const DEFAULT_TAB_DIMS: Record<SignFieldType, { w: number; h: number }> = {
  // Signature
  signature:  { w: 200, h: 40 },
  initial:    { w: 80,  h: 40 },
  date:       { w: 100, h: 22 },
  // Coordonnées
  firstname:  { w: 120, h: 22 },
  lastname:   { w: 120, h: 22 },
  fullname:   { w: 180, h: 22 },
  email:      { w: 200, h: 22 },
  company:    { w: 180, h: 22 },
  title:      { w: 160, h: 22 },
  // Entrées
  text:       { w: 180, h: 22 },
  number:     { w: 100, h: 22 },
  time:       { w: 100, h: 22 },
  pointage:   { w: 100, h: 22 },
  zone:       { w: 180, h: 22 },
  checkbox:   { w: 16,  h: 16 },
  select:     { w: 180, h: 22 },
  annotation: { w: 220, h: 24 },
  // Autre
  formula:    { w: 140, h: 22 },
  attachment: { w: 160, h: 32 },
}

function num(s: string | number | undefined, fallback = 0): number {
  if (s === undefined || s === null) return fallback
  const n = typeof s === 'number' ? s : parseFloat(s)
  return Number.isFinite(n) ? n : fallback
}

function bool(s: string | boolean | undefined): boolean {
  if (typeof s === 'boolean') return s
  return s === 'true'
}

/** DocuSign tab → ParsedTabRaw */
function tabToRaw(
  type: SignFieldType,
  tab: DocusignTabBase,
  recipientOrderByDsId: Map<string, number>,
  origTabType: string,
): ParsedTabRaw | null {
  const recipOrder = recipientOrderByDsId.get(tab.recipientId)
  if (recipOrder === undefined) return null  // tab orphelin

  const x = num(tab.xPosition)
  const y = num(tab.yPosition)
  let w = num(tab.width)
  let h = num(tab.height)

  // 0×0 = auto-size DocuSign → défauts
  if (w <= 0) w = DEFAULT_TAB_DIMS[type].w
  if (h <= 0) h = DEFAULT_TAB_DIMS[type].h

  const page = Math.max(1, Math.round(num(tab.pageNumber, 1)))
  const label = (tab.tabLabel || tab.name || tab.tooltip || '').toString().trim() || `${type}_${tab.tabId || ''}`

  const metadata: Record<string, unknown> = {
    tabType: origTabType,
    tabId: tab.tabId,
  }
  // List items pour 'select'
  if (type === 'select' && Array.isArray((tab as DocusignListTab).listItems)) {
    metadata.listItems = (tab as DocusignListTab).listItems
  }
  // Checkbox group
  if (type === 'checkbox' && Array.isArray((tab as { tabGroupLabels?: string[] }).tabGroupLabels)) {
    metadata.tabGroupLabels = (tab as { tabGroupLabels?: string[] }).tabGroupLabels
  }
  // selected default pour checkbox
  if (type === 'checkbox' && (tab as { selected?: string }).selected !== undefined) {
    metadata.selected = bool((tab as { selected?: string }).selected)
  }

  // Formule pour 'formula' (DocuSign FormulaTab)
  // Ex: "[Salaire actuel] + [Salaire souhaité]" ou "[Quantité] * [Prix]"
  if (type === 'formula') {
    const formulaTab = tab as { formula?: string; isPaymentAmount?: string }
    if (formulaTab.formula) metadata.formula = formulaTab.formula
    if (formulaTab.isPaymentAmount) metadata.isPaymentAmount = bool(formulaTab.isPaymentAmount)
  }

  // Numéro : précision décimale, min/max (DocuSign NumberTab)
  if (type === 'number') {
    const numTab = tab as { numericalValue?: string; validationPattern?: string }
    if (numTab.numericalValue) metadata.numericalValue = numTab.numericalValue
    if (numTab.validationPattern) metadata.validationPattern = numTab.validationPattern
  }

  // value (defaultValue déduite côté DocuSign)
  if (typeof tab.value === 'string' && tab.value.length > 0) {
    metadata.docusignValue = tab.value
  }

  return {
    type,
    x, y, w, h,
    page,
    recipientOrder: recipOrder,
    label,
    tooltip: (tab.tooltip || '').trim() || undefined,
    required: bool(tab.required as string),
    source: 'docusign',
    metadata,
  }
}

// ─── Main parser ───────────────────────────────────────────────────────────

export function parseDocusignJson(input: unknown): ParsedDocusign {
  const env = input as DocusignEnvelope
  if (!env || typeof env !== 'object') {
    throw new Error('JSON invalide : objet attendu')
  }
  if (!Array.isArray(env.documents) || env.documents.length === 0) {
    throw new Error('JSON DocuSign : aucun document trouvé (documents[] vide ou absent)')
  }
  if (!env.recipients || (!Array.isArray(env.recipients.signers) && !Array.isArray(env.recipients.carbonCopies))) {
    throw new Error('JSON DocuSign : aucun destinataire trouvé')
  }

  // 1) Recipients schema (signers + carbonCopies, ordre = routingOrder ASC)
  const signers = (env.recipients.signers || []).slice()
  const ccs = (env.recipients.carbonCopies || []).slice()

  // Tri stable par routingOrder
  signers.sort((a, b) => num(a.routingOrder, 99) - num(b.routingOrder, 99))
  ccs.sort((a, b) => num(a.routingOrder, 99) - num(b.routingOrder, 99))

  const recipientsSchema: SignRecipientSchema[] = []
  const recipientOrderByDsId = new Map<string, number>()

  let order = 0
  signers.forEach(s => {
    order += 1
    recipientOrderByDsId.set(s.recipientId, order)
    recipientsSchema.push({
      role: 'signer',
      order,
      name: s.name?.trim() || undefined,
      email: s.email?.toLowerCase().trim() || undefined,
      roleName: s.roleName?.trim() || undefined,
    })
  })
  ccs.forEach(c => {
    order += 1
    recipientOrderByDsId.set(c.recipientId, order)
    recipientsSchema.push({
      role: 'cc',
      order,
      name: c.name?.trim() || undefined,
      email: c.email?.toLowerCase().trim() || undefined,
      roleName: c.roleName?.trim() || undefined,
    })
  })

  // 2) Documents — clé de mapping = `documentId` réel (et pas `order`) car
  // les tabs référencent le `documentId` de DocuSign, qui peut être :
  //   - "1" pour la Fiche d'inscription (order=2)
  //   - "97189104" pour le Contrat (order=3)
  //   - "18424791" pour le Calendrier (order=1, mais aucun tab ne le référence)
  // Donc utiliser `order` comme clé corrompait l'attribution :
  // tab.documentId="1" trouvait le document order=1 (Calendrier) à la place de
  // order=2 (Fiche d'inscription). Bug v2.2.0-Phase2 corrigé v2.2.0-Phase2.1.
  const documents: ParsedDocusignDocument[] = env.documents.map(d => ({
    docOrderKey: (d.documentId || d.order || '1').toString(),
    name: d.name || `Document ${d.documentId}`,
    base64: d.documentBase64 || '',
    defaultPageDimensions: { width: A4_W, height: A4_H },
    fieldsRawByPage: new Map(),
  }))
  const docByOrderKey = new Map<string, ParsedDocusignDocument>()
  documents.forEach(d => docByOrderKey.set(d.docOrderKey, d))

  // 3) Parcours des tabs de chaque signer — mapping aligné DocuSign tabs (v2.2.0 Phase 2.5)
  const TAB_MAP: { key: keyof DocusignSignerTabs; type: SignFieldType; tabType: string }[] = [
    // Signature
    { key: 'signHereTabs',     type: 'signature',  tabType: 'signhere' },
    { key: 'initialHereTabs',  type: 'initial',    tabType: 'initialhere' },
    { key: 'dateSignedTabs',   type: 'date',       tabType: 'datesigned' },
    // Coordonnées (auto-fill par DocuSign / TalentFlow Phase 4)
    { key: 'firstNameTabs',    type: 'firstname',  tabType: 'firstname' },
    { key: 'lastNameTabs',     type: 'lastname',   tabType: 'lastname' },
    { key: 'fullNameTabs',     type: 'fullname',   tabType: 'fullname' },
    { key: 'emailAddressTabs', type: 'email',      tabType: 'emailaddress' },
    { key: 'companyTabs',      type: 'company',    tabType: 'company' },
    { key: 'titleTabs',        type: 'title',      tabType: 'title' },
    // Entrées
    { key: 'textTabs',         type: 'text',       tabType: 'text' },
    { key: 'numberTabs',       type: 'number',     tabType: 'number' },
    { key: 'checkboxTabs',     type: 'checkbox',   tabType: 'checkbox' },
    { key: 'listTabs',         type: 'select',     tabType: 'list' },
    // noteTabs = annotations (aides contextuelles, pas un champ à remplir)
    { key: 'noteTabs',         type: 'annotation', tabType: 'note' },
    // Autre
    { key: 'formulaTabs',      type: 'formula',    tabType: 'formula' },
    { key: 'attachmentTabs',   type: 'attachment', tabType: 'attachment' },
  ]

  let fieldsCount = 0

  signers.forEach(signer => {
    const tabs = signer.tabs
    if (!tabs) return

    TAB_MAP.forEach(({ key, type, tabType }) => {
      const list = (tabs[key] as DocusignTabBase[] | undefined) || []
      list.forEach(t => {
        const raw = tabToRaw(type, t, recipientOrderByDsId, tabType)
        if (!raw) return
        const doc = docByOrderKey.get(t.documentId)
        if (!doc) return
        if (!doc.fieldsRawByPage.has(raw.page)) doc.fieldsRawByPage.set(raw.page, [])
        doc.fieldsRawByPage.get(raw.page)!.push(raw)
        fieldsCount += 1
      })
    })

    // v2.2.0 Phase 2.5 — tabGroups : on les transforme en VRAIS groupes
    // (groupId/groupName/groupRule/groupMin/groupMax sur les checkboxes membres),
    // au lieu d'un champ fantôme hidden comme en Phase 2.
    // Les checkboxes ont déjà metadata.tabGroupLabels (set lors du parsing) qui
    // pointe vers les groupLabel(s) du / des groupe(s) auxquels elles appartiennent.
    const groups = tabs.tabGroups || []
    groups.forEach(g => {
      const doc = docByOrderKey.get(g.documentId)
      if (!doc) return
      const recipOrder = recipientOrderByDsId.get(g.recipientId)
      if (recipOrder === undefined) return

      const groupId = `g_ds_${g.tabId || `${g.documentId}_${g.groupLabel.replace(/\s+/g, '_')}`}`
      // Nettoie le groupLabel pour un nom court lisible
      const cleanName = g.groupLabel
        .replace(/^Groupe de cases à cocher\s+/i, '')
        .replace(/^[a-f0-9-]+$/i, '')
        .trim() || `Groupe ${groups.indexOf(g) + 1}`
      const groupName = cleanName.slice(0, 40)
      const groupRule = (g.groupRule as 'SelectAtLeast' | 'SelectAtMost' | 'SelectExactly') || 'SelectAtLeast'
      const groupMin = g.minimumRequired !== undefined ? num(g.minimumRequired, 0) || undefined : undefined
      const groupMax = g.maximumAllowed !== undefined ? num(g.maximumAllowed, 0) || undefined : undefined

      // Cherche les checkboxes qui ont ce groupLabel dans leurs tabGroupLabels
      doc.fieldsRawByPage.forEach(rawList => {
        rawList.forEach(raw => {
          if (raw.type !== 'checkbox') return
          if (raw.recipientOrder !== recipOrder) return
          const labels = raw.metadata.tabGroupLabels as string[] | undefined
          if (!labels || !labels.includes(g.groupLabel)) return
          raw.groupId = groupId
          raw.groupName = groupName
          raw.groupRule = groupRule
          raw.groupMin = groupMin
          raw.groupMax = groupMax
        })
      })
    })
  })

  return {
    templateName: env.emailSubject?.trim() || 'Template DocuSign importé',
    templateDescription: null,
    documents,
    recipientsSchema,
    fieldsCount,
  }
}

// ─── Conversion coords pts → normalisé 0-1 ─────────────────────────────────

/**
 * Convertit les fields raw (pts DocuSign) en SignField[] avec coords normalisées 0-1.
 * Appelé après upload, quand on a les vraies dimensions PDF page par page.
 *
 * Système de coordonnées :
 * - DocuSign exporte ses tabs en origine **TOP-LEFT** (cf doc API officielle).
 *   xPosition/yPosition mesurent depuis le coin supérieur-gauche en pts (72 dpi).
 * - TalentFlow Sign stocke en normalisé 0-1 origine **TOP-LEFT** (idem Konva canvas).
 * - Conversion : x/pageWidth, y/pageHeight (pas de flip).
 *
 * Note historique v2.2.0-Phase2 : un flip Y avait été ajouté à tort en pensant
 * que DocuSign était bottom-left. C'était un faux diagnostic — le vrai bug
 * était le mapping `tab.documentId → documents[].order` au lieu de
 * `documents[].documentId`. Une fois ce mapping corrigé, le flip n'est plus
 * nécessaire et il faussait les positions (signatures en haut au lieu d'en bas).
 *
 * @param raws fields bruts DocuSign en pts (origine top-left)
 * @param dimsByPage dimensions réelles (pts) du PDF importé, par page
 */
export function normalizeFields(
  raws: ParsedTabRaw[],
  dimsByPage: Map<number, { width: number; height: number }>,
  genId: () => string,
): SignField[] {
  return raws.map(r => {
    const dims = dimsByPage.get(r.page) || { width: A4_W, height: A4_H }
    const w = dims.width || A4_W
    const h = dims.height || A4_H
    return {
      id: genId(),
      type: r.type,
      page: r.page,
      x: clamp01(r.x / w),
      y: clamp01(r.y / h),
      width: clamp01(r.w / w),
      height: clamp01(r.h / h),
      recipientOrder: r.recipientOrder,
      label: r.label,
      tooltip: r.tooltip,
      required: r.required,
      source: r.source,
      // v2.2.0 Phase 2.5 — propage les group fields issus des tabGroups DocuSign
      groupId: r.groupId,
      groupName: r.groupName,
      groupRule: r.groupRule,
      groupMin: r.groupMin,
      groupMax: r.groupMax,
      metadata: r.metadata,
    }
  })
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

// ─── Construction d'une liste SignDocument à partir d'un ParsedDocusign ───

/**
 * Construit la liste finale `SignDocument[]` (jsonb du template) après upload.
 * - storagePathByOrderKey : map docOrderKey → storage_path obtenu après upload
 * - dimsByDocAndPage      : map docOrderKey → Map(page → {w,h}) issue de la lecture PDF réelle
 */
export function buildSignDocuments(
  parsed: ParsedDocusign,
  storagePathByOrderKey: Map<string, string>,
  dimsByDocAndPage: Map<string, Map<number, { width: number; height: number }>>,
  genId: () => string,
): SignDocument[] {
  return parsed.documents.map((d, idx) => {
    const path = storagePathByOrderKey.get(d.docOrderKey)
    const dimsByPage = dimsByDocAndPage.get(d.docOrderKey) || new Map()
    const allRaws: ParsedTabRaw[] = []
    d.fieldsRawByPage.forEach(arr => allRaws.push(...arr))
    const fields = normalizeFields(allRaws, dimsByPage, genId)
    const dimsArr: { page: number; width: number; height: number }[] = []
    dimsByPage.forEach((v, page) => dimsArr.push({ page, width: v.width, height: v.height }))
    dimsArr.sort((a, b) => a.page - b.page)
    return {
      name: d.name,
      storage_path: path || '',
      order: idx + 1,
      page_count: dimsArr.length || undefined,
      pdf_dimensions: dimsArr.length > 0 ? dimsArr : undefined,
      fields,
    }
  })
}
