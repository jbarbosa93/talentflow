// TalentFlow Sign — Auto-détection des étapes du Wizard candidat
// v2.2.0 — Phase 4a-bis-2
//
// À partir d'un SignDocument[] (avec fields DocuSign normalisés), génère un
// WizardStep[] groupant les fields en étapes logiques pour un formulaire
// mobile-first step-by-step.
//
// ALGORITHME :
// 1. Filtre les fields du recipient courant (signer/cc), exclut les annotations
//    cachées et les tabgroups parent.
// 2. Étape "Vos informations" en tête : auto-fill (firstname/lastname/email/etc).
// 3. Pour chaque doc → cluster les fields par (page, y proche → bande de ~50 pts).
//    Chaque cluster = 1 étape.
// 4. Le titre de l'étape est déduit dans cet ordre :
//    - tooltip commun majoritaire des fields du cluster (ex: "À remplir si enfants à charge")
//    - sinon le 1er texte d'annotation (note) à proximité immédiate (au-dessus du cluster)
//    - sinon "Page N — étape M"
// 5. Description = concat des annotations (note) du cluster.
// 6. Étape finale "Signature" : signHere/initialHere + datesigned.
//
// L'admin peut ensuite éditer (futur : drag&drop, fusion, renommage) — la struct
// est sérialisée dans sign_templates.wizard_steps (jsonb).

import type { SignDocument, SignField, SignFieldType } from './types'

export interface WizardStep {
  id: string                   // uuid local (stable)
  title: string
  description?: string         // affiché sous le titre (annotations DocuSign)
  fieldIds: string[]           // ids des fields à afficher dans cette étape
  docOrder: number             // ordre du doc concerné (1-based)
  /**
   * v2.2.1 — Rôle (recipientOrder) de cette étape. Chaque destinataire ne voit
   * que les steps avec son recipientOrder lors de la signature.
   * Default 1 (legacy single-recipient).
   */
  recipientOrder?: number
  /** Si true, étape spéciale signature (rendue avec SignaturePad côté client) */
  isSignatureStep?: boolean
  /** Si true, étape spéciale "Vos informations" (auto-fill) en tête */
  isAutoFillStep?: boolean
  /**
   * v2.9.45 — Si true, étape d'INTRODUCTION : aucun champ à remplir, juste du
   * contenu informatif (logo + titre + sous-titre + texte + image). Le signataire
   * clique « Continuer » pour passer à l'étape suivante.
   */
  isIntroStep?: boolean
  /**
   * v2.9.45 — Contenu d'une étape d'introduction. Tous les champs sont optionnels :
   * tu mets ce que tu veux afficher.
   *   - showLogo : affiche le logo L-Agence en tête
   *   - title / subtitle : titres en gros (Instrument Serif)
   *   - body : paragraphe libre (multi-lignes, conservées)
   *   - imageUrl : data URL (base64) d'une image optionnelle, max ~400 Ko
   */
  introContent?: {
    showLogo?: boolean
    title?: string
    subtitle?: string
    body?: string
    imageUrl?: string | null
  }
  /**
   * v2.2.0 — Documents à consulter dans cette étape.
   * Le candidat clique → modal viewer avec Télécharger + Imprimer.
   * Pas un "field" au sens DocuSign (pas de coords PDF).
   */
  attachments?: WizardStepAttachment[]
  /**
   * v2.2.1 — Mode d'affichage des fields dans cette étape :
   *   - 'list' (default) : empilage vertical, sous-titres si wizardSection présent
   *   - 'cards' : 1 carte par wizardSection, fields à l'intérieur en grid 2 cols
   *     (idéal pour rapport heures : 1 carte = 1 jour)
   */
  displayMode?: 'list' | 'cards'
}

export interface WizardStepAttachment {
  id: string                   // uuid local
  label: string                // ex: "Calendrier des paiements 2026"
  description?: string         // "Consultez ce document avant de choisir"
  /** Référence à un document du template (par doc.order, 1-based). Soit ça, soit externalUrl. */
  docOrder?: number
  /** Si fourni, URL externe (pas un doc du template). */
  externalUrl?: string
}

/** Types qui sont auto-fill (pré-remplis depuis le recipient) */
const AUTO_FILL_TYPES: SignFieldType[] = ['firstname', 'lastname', 'fullname', 'email', 'company', 'title']

/** Retourne true si le field appartient à l'étape signature finale.
 *  'date' est inclus UNIQUEMENT si c'est un datesigned auto-fill (tabType='datesigned'),
 *  pas pour les dates saisies manuellement par le candidat (ex : jours de la semaine). */
function isSignatureType(field: SignField): boolean {
  if (field.type === 'signature' || field.type === 'initial') return true
  if (field.type === 'date' && field.metadata?.tabType === 'datesigned') return true
  return false
}

/** Genre id court (pas besoin d'uuid lib) */
function genStepId(): string {
  return 'wstep_' + Math.random().toString(36).slice(2, 11)
}

/**
 * Retourne le tooltip "majoritaire" partagé par les fields d'un cluster.
 * Si ≥60% des fields ont le même tooltip → on l'utilise comme titre.
 */
function commonTooltip(fields: SignField[]): string | null {
  const counts = new Map<string, number>()
  for (const f of fields) {
    const tip = (f.tooltip || '').trim()
    if (!tip) continue
    counts.set(tip, (counts.get(tip) || 0) + 1)
  }
  if (counts.size === 0) return null
  let best: [string, number] | null = null
  for (const [k, v] of counts) {
    if (!best || v > best[1]) best = [k, v]
  }
  if (!best) return null
  // ≥ 50% → suffisant pour un cluster homogène
  if (best[1] >= Math.ceil(fields.length * 0.5)) return best[0]
  return null
}

/**
 * Cluster les fields d'une page par proximité Y.
 * 2 fields sont dans le même cluster si leur distance Y < `yThreshold` (en %)
 * ET qu'aucun gap > `gapThreshold` ne les sépare.
 */
/**
 * Cluster les fields d'une page en groupes "section logique".
 *
 * Stratégie en 2 passes :
 *  1. Cluster brut par GAP : un nouveau cluster commence quand l'écart Y entre 2
 *     fields successifs dépasse `gapThreshold` (= ~ ligne vide).
 *  2. Limite la taille max d'un cluster : si plus de `maxFieldsPerCluster` fields,
 *     on coupe au gap le plus grand interne pour produire des étapes
 *     digestibles sur mobile.
 */
function clusterFieldsByPage(
  fields: SignField[],
  gapThreshold = 0.025,        // 0.025 × 842 ≈ 21 pts ≈ 1 ligne de form
  maxFieldsPerCluster = 8,     // sur mobile, ~8 champs max par étape (digestible)
): SignField[][] {
  if (fields.length === 0) return []
  const sorted = fields.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x))
  const clusters: SignField[][] = []
  let current: SignField[] = [sorted[0]]
  let lastY = sorted[0].y + sorted[0].height

  for (let i = 1; i < sorted.length; i++) {
    const f = sorted[i]
    const gap = f.y - lastY
    if (gap < gapThreshold) {
      current.push(f)
    } else {
      clusters.push(current)
      current = [f]
    }
    lastY = Math.max(lastY, f.y + f.height)
  }
  if (current.length > 0) clusters.push(current)

  // 2ème passe : split les clusters trop gros en sous-clusters au plus gros gap
  const refined: SignField[][] = []
  for (const c of clusters) {
    if (c.length <= maxFieldsPerCluster) {
      refined.push(c)
      continue
    }
    // Trouve les plus gros gaps internes pour scinder
    const sortedC = c.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x))
    const targetParts = Math.ceil(sortedC.length / maxFieldsPerCluster)
    // Calcule tous les gaps Y entre fields successifs
    const gaps: { idx: number; gap: number }[] = []
    for (let i = 1; i < sortedC.length; i++) {
      gaps.push({ idx: i, gap: sortedC[i].y - sortedC[i - 1].y })
    }
    // Garde les (targetParts-1) plus gros gaps comme points de coupure
    gaps.sort((a, b) => b.gap - a.gap)
    const cutPoints = new Set(gaps.slice(0, targetParts - 1).map(g => g.idx))
    let part: SignField[] = [sortedC[0]]
    for (let i = 1; i < sortedC.length; i++) {
      if (cutPoints.has(i)) {
        refined.push(part)
        part = [sortedC[i]]
      } else {
        part.push(sortedC[i])
      }
    }
    if (part.length > 0) refined.push(part)
  }
  return refined
}

/**
 * Génère le titre d'un cluster.
 * Priorités :
 *   1. tooltip majoritaire (si ≥50% des fields le partagent)
 *   2. 1ère annotation note du cluster (label de la note)
 *   3. fallback "Section N"
 */
function clusterTitle(cluster: SignField[], stepIndex: number): string {
  const tip = commonTooltip(cluster.filter(f => f.type !== 'annotation'))
  if (tip) return tip
  const note = cluster.find(f => f.type === 'annotation')
  if (note?.label && note.label.length < 80 && note.label.length > 2) return note.label
  return `Étape ${stepIndex}`
}

/**
 * Concat des descriptions issues des annotations d'un cluster (sauf si déjà
 * utilisé comme titre).
 */
function clusterDescription(cluster: SignField[], usedTitle: string): string | undefined {
  const notes = cluster
    .filter(f => f.type === 'annotation')
    .map(f => (f.label || '').trim())
    .filter(s => s && s !== usedTitle && s.length > 2 && s.length < 240)
  if (notes.length === 0) return undefined
  // Dédup
  return Array.from(new Set(notes)).join(' · ')
}

/**
 * MAIN : construit les WizardStep[] pour un template / recipient donné.
 *
 * @param documents Tous les documents du template (avec fields normalisés)
 * @param recipientOrder L'ordre du recipient pour qui on construit (1-based)
 * @returns Étapes ordonnées : auto-fill → clusters par doc/page → signature
 */
export function buildWizardSteps(
  documents: SignDocument[],
  recipientOrder: number,
): WizardStep[] {
  const steps: WizardStep[] = []

  // ─── Récolte tous les fields du recipient ─────────────────────────────
  const allFields: { field: SignField; docOrder: number }[] = []
  documents.forEach((doc, idx) => {
    const docOrder = doc.order ?? (idx + 1)
    for (const f of (doc.fields || [])) {
      if (f.recipientOrder !== recipientOrder) continue
      if (f.metadata?.hidden === true) continue
      allFields.push({ field: f, docOrder })
    }
  })

  // ─── Étape 1 : Vos informations (auto-fill) ───────────────────────────
  const autoFillFields = allFields.filter(({ field }) => AUTO_FILL_TYPES.includes(field.type))
  if (autoFillFields.length > 0) {
    steps.push({
      id: genStepId(),
      title: 'Vos informations',
      description: 'Vérifiez vos coordonnées pré-remplies depuis votre dossier.',
      fieldIds: autoFillFields.map(({ field }) => field.id),
      docOrder: autoFillFields[0].docOrder,
      recipientOrder,
      isAutoFillStep: true,
    })
  }

  // ─── Étapes 2..N : Clusters par doc/page ──────────────────────────────
  const fillFields = allFields.filter(({ field }) =>
    !AUTO_FILL_TYPES.includes(field.type) && !isSignatureType(field),
  )
  const byDoc = new Map<number, SignField[]>()
  for (const { field, docOrder } of fillFields) {
    if (!byDoc.has(docOrder)) byDoc.set(docOrder, [])
    byDoc.get(docOrder)!.push(field)
  }
  const sortedDocs = Array.from(byDoc.keys()).sort((a, b) => a - b)
  let stepIdxCounter = 1
  for (const docOrder of sortedDocs) {
    const docFields = byDoc.get(docOrder)!
    const byPage = new Map<number, SignField[]>()
    for (const f of docFields) {
      if (!byPage.has(f.page)) byPage.set(f.page, [])
      byPage.get(f.page)!.push(f)
    }
    const sortedPages = Array.from(byPage.keys()).sort((a, b) => a - b)
    for (const page of sortedPages) {
      const pageFields = byPage.get(page)!
      const clusters = clusterFieldsByPage(pageFields)
      for (const cluster of clusters) {
        const title = clusterTitle(cluster, stepIdxCounter)
        const description = clusterDescription(cluster, title)
        const interactiveFields = cluster.filter(f => f.type !== 'annotation')
        if (interactiveFields.length === 0) continue
        steps.push({
          id: genStepId(),
          title,
          description,
          fieldIds: interactiveFields.map(f => f.id),
          docOrder,
          recipientOrder,
        })
        stepIdxCounter += 1
      }
    }
  }

  // ─── Étape finale : Signature ─────────────────────────────────────────
  const sigFields = allFields.filter(({ field }) => isSignatureType(field))
  if (sigFields.length > 0) {
    steps.push({
      id: genStepId(),
      title: 'Signature',
      description: 'Signez électroniquement pour finaliser votre dossier.',
      fieldIds: sigFields.map(({ field }) => field.id),
      docOrder: sigFields[0].docOrder,
      recipientOrder,
      isSignatureStep: true,
    })
  }

  return steps
}

/**
 * v2.2.1 — Construit les steps pour TOUS les rôles d'un template.
 * Concatène les steps de chaque recipientOrder (1, 2, 3...).
 * Chaque step a son `recipientOrder` propre → on filtre ensuite côté wizard.
 */
export function buildWizardStepsForAllRoles(
  documents: SignDocument[],
  recipientOrders: number[],
): WizardStep[] {
  const all: WizardStep[] = []
  for (const order of recipientOrders) {
    all.push(...buildWizardSteps(documents, order))
  }
  return all
}

/**
 * Helper : retourne tous les fields référencés par les wizard_steps,
 * groupés par stepId. Utile côté client pour résoudre vite.
 */
export function fieldsByStep(
  steps: WizardStep[],
  documents: SignDocument[],
): Map<string, SignField[]> {
  const fieldById = new Map<string, SignField>()
  for (const d of documents) {
    for (const f of (d.fields || [])) fieldById.set(f.id, f)
  }
  const result = new Map<string, SignField[]>()
  for (const s of steps) {
    const fields: SignField[] = []
    for (const fid of s.fieldIds) {
      const f = fieldById.get(fid)
      if (f) fields.push(f)
    }
    result.set(s.id, fields)
  }
  return result
}
