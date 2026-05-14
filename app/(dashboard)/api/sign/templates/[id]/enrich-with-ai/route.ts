// TalentFlow Sign — Enrichissement IA d'un template (Claude vision sur PDF)
// v2.7.4 — Prompt enrichi spécifique L-Agence SA + bump modèle Sonnet 4.6
//
// Pour chaque doc du template, télécharge le PDF + envoie à Claude vision avec
// la liste des fields (id + position normalisée + tooltip actuel). Claude retourne
// une structure wizard_steps optimisée + des field_updates (tooltip, required,
// conditions, listItems). On applique tout en DB.
//
// v2.7.4 — System prompt enrichi avec les conventions L-Agence SA :
//   - Signature collaborateur GAUCHE / L-Agence DROITE
//   - Format date suisse jj.mm.aaaa
//   - Vocabulaire CH (NPA, AVS, CCT, Helsana, SUVA, etc.)
//   - Pattern "Oui/Non" séparé en 2 checkboxes
//   - recipientOrder=1 candidat vs recipientOrder=2 consultant
//   - Champs conditionnels (Si oui → required=false + helpText)
//   - NE PAS halluciner sur les pages de texte légal SECO
//
// Modèle utilisé : claude-sonnet-4-6 (vision PDF natif, plus précis que 4-5).
// Prompt cache : système prompt cachable pour réduire coûts si appelé plusieurs fois.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import Anthropic from '@anthropic-ai/sdk'
import type { SignDocument, SignField } from '@/lib/sign/types'
import type { WizardStep } from '@/lib/sign/wizard-builder'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'
export const maxDuration = 120  // Claude vision peut prendre 30-60s

const SYSTEM_PROMPT = `Tu es un expert en UX de formulaires administratifs ET en documents RH suisses (agences de placement). Tu analyses un PDF de formulaire et tu génères / structures les champs en un wizard step-by-step parfait pour mobile.

━━━ CONTEXTE L-AGENCE SA (Monthey, Valais, Suisse) ━━━
Tu analyses typiquement des documents de l'agence de placement L-Agence SA :
- Fiche d'inscription candidat (~85 champs sur 2 pages dense en colonnes)
- Contrat cadre de travail (8 pages dont 7 de texte légal SECO et 1 page de signature à la fin)
- Information perte de gains / sécurité au travail (1 page chacun, lettre + checkboxes + signature)

CONVENTIONS L-AGENCE (très important) :
1. SIGNATURES en bas de page :
   - Signature COLLABORATEUR/EMPLOYÉ/CANDIDAT = bas à GAUCHE → recipientOrder=1
   - Signature L-AGENCE SA / Conseiller(ère) = bas à DROITE → recipientOrder=2
   - Sur les documents purement informatifs (perte de gain, sécurité), SEULE la signature collaborateur est présente
   - Toujours précédé de "Lieu, le ___" (souvent pré-imprimé "Monthey, le ___")
2. NOM + PRÉNOM = TOUJOURS DEUX CHAMPS SÉPARÉS (lastname + firstname). JAMAIS de type='fullname'.
3. DATES format suisse strict : dateFormat='dd.MM.yyyy' (et pas 'yyyy-MM-dd' ni 'MM/dd/yyyy').
4. VOCABULAIRE SUISSE :
   - NPA (= code postal CH 4 chiffres) jamais "CP" ni "ZIP"
   - N° AVS (756.xxxx.xxxx.xx)
   - Permis de séjour : B/C/G/L/Ci/F/N
   - Permis de conduire : B/BE/C/CE/D/D1/etc.
   - Monnaie : CHF uniquement
   - Assureurs : Helsana (maladie), SUVA (accidents)
   - Lois : LSE, CO, LTr, LPGA, LAA, LAPG, LAFam, CCT LS

5. PATTERN "Oui / Non" (extrêmement fréquent dans les docs L-Agence) :
   - Toujours 2 checkboxes séparées côte à côte
   - Labels descriptifs : "Permis conduire - Oui" et "Permis conduire - Non" (pour faciliter le wizard)
6. RECIPIENT ORDER :
   - recipientOrder=1 → fields à remplir par le CANDIDAT/COLLABORATEUR (la majorité)
   - recipientOrder=2 → fields à remplir par L-AGENCE/CONSULTANT(E) :
     * Section "à compléter par le consultant/e" (fiche d'inscription page 2)
     * Section "Documents" avec 8 checkboxes "OK" (= vérif consultant)
     * Signature L-Agence à droite
7. CHAMPS CONDITIONNELS ("Si oui → ___") :
   - required=false
   - helpText="Remplir uniquement si la case précédente est Oui"
8. NE PAS HALLUCINER sur les pages de texte légal :
   - Le contrat cadre a 7 pages de texte SECO + 1 page de signature (la dernière). N'invente pas de fields sur les pages 1-7 si tu vois juste du texte juridique continu sans zone vide.
   - Si une page contient surtout du texte sans ligne "___" / case ☐ / espace blanc après label → renvoie 0 field pour cette page.
9. AUTO-FILL pour 'firstname','lastname','email','company','title' → autoFill=true

━━━ FIN CONTEXTE L-AGENCE ━━━

DEUX MODES selon l'input :

MODE A — TEMPLATE EXISTANT AVEC FIELDS (existing_fields fourni non-vide) :
- Préserve TOUS les fieldIds existants (immutables)
- Améliore : tooltip (label affiché), required, metadata.listItems (pour selects), conditions (if/then)
- Regroupe en wizard_steps logiques

MODE B — TEMPLATE VIDE OU PARTIEL (existing_fields vide ou incomplet) :
- Analyse VISUELLEMENT le PDF (tu le reçois en input)
- DÉTECTE chaque zone à remplir (champs texte, cases à cocher, signatures, dates, listes…)
- GÉNÈRE les nouveaux fields avec :
  * un id placeholder unique de la forme "new_1", "new_2", "new_3"…
  * type pertinent : text / number / date / checkbox / select / signature / firstname / lastname / fullname / email / company / title
  * coords NORMALISÉES 0-1 origine TOP-LEFT (x = horizontale depuis gauche, y = depuis haut, width/height = dimensions de la box)
  * page : numéro 1-based
  * recipientOrder : 1 par défaut (ou selon contexte)
  * tooltip : label humain naturel en français (ex: "Date de naissance", "N° AVS")
  * required : true par défaut sauf cases marquées optionnelles
  * metadata.listItems pour les selects
- Tu peux mixer : compléter les fields manquants si certains existaient déjà

CONTRAINTES :
1. CHAQUE field interactif (non-annotation, non-signature) doit appartenir à exactement UNE étape.
2. Les fields signature/initial/date(datesigned) → étape finale "Signature"
3. Les fields auto-fill (firstname/lastname/email/etc.) → étape "Vos informations"
4. Les annotations (descriptions sans champ) → utilise leur texte en description d'étape parent
5. **CRUCIAL — recipientOrder par étape** : chaque field a un \`recipientOrder\` (1, 2, …) qui désigne le rôle
   du destinataire qui doit le remplir. Une étape ne peut contenir QUE des fields du MÊME recipientOrder.
   Donc :
   - Si le template a plusieurs rôles (ex: Candidat + Client), génère des étapes SÉPARÉES par rôle
   - Chaque étape a son propre \`recipientOrder\` correspondant aux fields qu'elle contient
   - Ex: 5 étapes pour le Candidat (recipientOrder=1) + 2 étapes pour le Client (recipientOrder=2)
   - L'étape "Signature" du Candidat = recipientOrder=1, celle du Client = recipientOrder=2

GROUPAGE VISUEL VIA wizardSection (CRUCIAL pour les rapports répétitifs) :
Si tu détectes un PATTERN RÉPÉTITIF dans le PDF (ex: 7 jours × 4 colonnes pour un rapport
d'heures, ou Conjoint/Enfants distincts dans une fiche d'inscription), assigne à chaque
field un \`wizardSection\` qui le groupe visuellement.

Exemples :
- Rapport heures : "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"
- Fiche d'inscription : "Conjoint" (sur tous les fields liés au conjoint), "Enfants à charge",
  "Permis de travail", "Coordonnées de l'employeur"
- Contrat : "Salaire et avantages", "Période d'essai"…

⚠️ RÈGLE FONDAMENTALE pour les rapports répétitifs (rapport d'heures, planning, etc.) :
**METS TOUT DANS UNE SEULE ÉTAPE** "Heures de la semaine" (ou nom équivalent) AVEC :
- \`displayMode: 'cards'\`
- chaque field a sa wizardSection correspondante (ex: "Lundi" pour les fields du lundi)

NE FAIS PAS 7 étapes séparées (Lundi / Mardi / Mercredi / ...) — c'est lourd pour
le candidat qui devra cliquer "Suivant" 7 fois. Le mode Cartes affiche déjà les jours
empilés visuellement dans la même étape.

Pour les autres patterns (ex: Conjoint vs Enfants dans une fiche d'inscription), tu peux
laisser \`displayMode: 'list'\` (défaut) qui fait des sous-titres au lieu de cartes.

FORMAT DE SORTIE OBLIGATOIRE — JSON strict, RIEN d'autre :
{
  "wizard_steps": [
    {
      "title": "Titre court en français (ex: 'Données personnelles', 'Conjoint')",
      "description": "Aide optionnelle (1-2 phrases)",
      "fieldIds": ["uuid1-existant-ou-new_X", ...],
      "docOrder": 1,
      "recipientOrder": 1,
      "isAutoFillStep": false,
      "isSignatureStep": false,
      "displayMode": "list" | "cards"
    }
  ],
  "field_updates": [
    {
      "id": "uuid-existant",
      "tooltip": "...", "required": true,
      "wizardSection": "Lundi" (optionnel — groupage visuel),
      "metadata_listItems": [{"text": "...", "value": "..."}],
      "conditions": [...]
    }
  ],
  "new_fields": [
    {
      "_id": "new_1",
      "type": "text",
      "page": 1,
      "x": 0.12, "y": 0.18, "width": 0.40, "height": 0.025,
      "recipientOrder": 1,
      "tooltip": "Nom",
      "required": true,
      "wizardSection": "Lundi" (optionnel),
      "metadata_listItems": [...] (optionnel)
    }
  ]
}

LISTES RECOMMANDÉES :
- État civil : Célibataire, Marié(e), Pacsé(e), Veuf/Veuve, Divorcé(e), Séparé(e)
- Permis de séjour : B, C, CH (citoyen), G (frontalier), L, F, N, En attente, Aucun
- Moyen de transport : Voiture, Train/Transport public, Vélo, À pied, Scooter/Moto
- Nationalité : Suisse, France, Italie, Allemagne, Espagne, Portugal, Belgique, Autriche, Pays-Bas, Albanie, Bosnie-Herzégovine, Kosovo, Macédoine du Nord, Monténégro, Serbie, Turquie, Ukraine, Brésil, Cap-Vert, Maroc, Tunisie, Algérie, Sénégal, Côte d'Ivoire, États-Unis, Canada, Autre

CONDITIONS INTELLIGENTES :
- Si "État civil" = "Marié(e)" / "Pacsé(e)" → SHOW les fields conjoint
- Si "Permis de conduire" = false → HIDE "Moyen de transport" éventuel
- Si "Nombre d'enfants" > 0 → SHOW section Allocations familiales
- Si "Conjoint travaille" = false → HIDE "Employeur du conjoint"

ESTIMATION DES COORDS pour MODE B — PRÉCISION CRUCIALE :
- Origine (0, 0) = COIN HAUT-GAUCHE de la page (pas bas-gauche). y croît vers le bas.
- Coords NORMALISÉES 0-1 = fraction de la page entière (x = pixel_x / page_width).
- Pour un A4 portrait (595×842 pts) : marges typiques 0.08-0.12 gauche/droite, 0.06-0.08 haut/bas.
- Hauteur typique d'un input ligne dans un formulaire : 0.020-0.030 (≈ 17-25 pts).
- Hauteur typique d'une checkbox : 0.012-0.018 carrée (≈ 10-15 pts).
- Largeur typique d'une signature : 0.25-0.40 (≈ 150-240 pts).

⚠️ ÉTAPE CRITIQUE pour les formulaires en TABLEAU (rapport heures, etc.) :
1. Repère D'ABORD les bords visuels du tableau (lignes horizontales/verticales)
2. Mesure la HAUTEUR D'UNE LIGNE en y % de la page (ex: ligne fait 0.025)
3. Mesure la LARGEUR D'UNE COLONNE en x % de la page (ex: colonne fait 0.07)
4. Place chaque field PILE DANS sa cellule, avec :
   - x = bord_gauche_colonne + petit_padding (ex: +0.005)
   - y = bord_haut_ligne + petit_padding (ex: +0.005)
   - width = largeur_colonne - 2 × padding
   - height = hauteur_ligne - 2 × padding
5. Si tu vois plusieurs cellules de même taille (jours de la semaine), elles DOIVENT toutes
   avoir le même width et height, et leur x doit être espacé régulièrement.

NE JAMAIS placer un field hors page (0 < x+width ≤ 1, 0 < y+height ≤ 1).
Pour les signatures en bas de page : y typique 0.88-0.94 (8-12% de la hauteur depuis le bas).

Renvoie UNIQUEMENT le JSON, sans markdown wrapping, sans commentaire.`

interface FieldUpdate {
  id: string
  tooltip?: string
  required?: boolean
  wizardSection?: string
  metadata_listItems?: { text: string; value: string }[]
  conditions?: unknown[]
}

interface NewField {
  _id: string                                  // placeholder Claude (ex "new_1")
  type: SignField['type']
  page: number
  x: number; y: number; width: number; height: number
  recipientOrder: number
  tooltip?: string
  required?: boolean
  wizardSection?: string
  metadata_listItems?: { text: string; value: string }[]
  conditions?: unknown[]
}

interface AIResult {
  wizard_steps: WizardStep[]
  field_updates?: FieldUpdate[]
  new_fields?: NewField[]
}

// v2.7.6 — Pagination IA : si plus de 5 docs, on traite par batch de 3.
// Le client appelle en boucle avec batchStart jusqu'à recevoir status='complete'.
const PAGINATION_THRESHOLD = 5
const BATCH_SIZE = 3

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth()
  if (authError) return authError

  const { id } = await ctx.params
  const { searchParams } = new URL(req.url)
  const batchStart = Math.max(0, Number(searchParams.get('batchStart') || 0))

  // Workaround : Claude Desktop pose ANTHROPIC_API_KEY="" dans l'env système, ce qui
  // empêche Next.js de charger la valeur depuis .env.local. On reload .env.local en
  // override si la clé est vide.
  let apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    try {
      const dotenv = await import('dotenv')
      const path = await import('path')
      const result = dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true })
      apiKey = result.parsed?.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
    } catch { /* ignore */ }
  }
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY manquant' }, { status: 500 })
  }

  const supabase = createAdminClient()

  // 1. Charger template
  const { data: tpl, error: tplErr } = await supabase
    .from('sign_templates' as any)
    .select('id, name, documents, wizard_steps')
    .eq('id', id)
    .maybeSingle()
  if (tplErr || !tpl) return NextResponse.json({ error: 'Template introuvable' }, { status: 404 })
  const template = tpl as unknown as { documents: SignDocument[]; wizard_steps: WizardStep[] }

  // 2. Pour chaque doc, télécharger le PDF + appeler Claude
  const anthropic = new Anthropic({ apiKey })

  // v2.7.4 — Traitement EN PARALLÈLE des documents (Promise.allSettled).
  // Avant : séquentiel → 5 docs × 25s = 125s (risque timeout Vercel 120s).
  // Après : parallèle → max(25s) = ~30s indépendamment du nombre de docs.
  // allSettled : si 1 doc plante, les autres continuent + on agrège les erreurs.

  interface DocResult {
    docIdx: number
    docName: string
    newFields: SignField[]
    stepsWithIds: WizardStep[]
    fieldUpdates: FieldUpdate[]
    error?: string
  }

  const processDoc = async (doc: SignDocument, docIdx: number): Promise<DocResult> => {
    const result: DocResult = {
      docIdx,
      docName: doc.name,
      newFields: [],
      stepsWithIds: [],
      fieldUpdates: [],
    }
    if (!doc.storage_path) return result

    // v2.2.1 — On envoie TOUS les fields (tous rôles) à Claude, pas juste le rôle 1.
    const recipientFields = (doc.fields || [])

    // Download PDF
    const { data: blob, error: dlErr } = await supabase.storage
      .from('talentflow-sign')
      .download(doc.storage_path)
    if (dlErr || !blob) {
      result.error = `download failed (${dlErr?.message})`
      return result
    }
    const buf = Buffer.from(await blob.arrayBuffer())
    const pdfBase64 = buf.toString('base64')

    // Liste compacte des fields à passer à Claude
    const fieldsList = recipientFields.map(f => ({
      id: f.id,
      type: f.type,
      page: f.page,
      x: Math.round(f.x * 1000) / 1000,
      y: Math.round(f.y * 1000) / 1000,
      tooltip: f.tooltip || null,
      label: f.label,
      listItems: f.metadata?.listItems || null,
      required: !!f.required,
    }))

    const isEmpty = recipientFields.length === 0
    const userPrompt = isEmpty
      ? `Document : "${doc.name}" (docOrder = ${doc.order ?? docIdx + 1})

Fields existants : AUCUN.

Le PDF est joint. MODE B : analyse visuellement le PDF, détecte TOUTES les zones à remplir, génère :
- des "new_fields" avec coords précises (origine top-left, normalisées 0-1) et placeholders "_id" (new_1, new_2, …)
- des "wizard_steps" structurées par section logique référençant ces placeholders dans fieldIds[]

Sois minutieux : chaque ligne à remplir, chaque case à cocher, chaque liste déroulante, signature, paraphe doit avoir son field. Place les coords précisément en analysant le rendu visuel.`
      : `Document : "${doc.name}" (docOrder = ${doc.order ?? docIdx + 1})

Fields existants (${recipientFields.length}) — JSON :
${JSON.stringify(fieldsList, null, 2)}

Le PDF est joint. MODE A : préserve les fieldIds existants, regroupe-les en wizard_steps + enrichis tooltips/conditions/listItems via field_updates.`

    let parsed: AIResult
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 16000,
        system: [
          { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        ],
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBase64,
              },
            },
            { type: 'text', text: userPrompt },
          ],
        }],
      })

      const textBlock = response.content.find(c => c.type === 'text')
      if (!textBlock || textBlock.type !== 'text') {
        result.error = 'pas de réponse text'
        return result
      }
      let raw = textBlock.text.trim()
      raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
      try {
        parsed = JSON.parse(raw)
      } catch (e) {
        result.error = `JSON parse failed (${(e as Error).message})`
        return result
      }
    } catch (e) {
      result.error = `API error (${(e as Error).message})`
      return result
    }

    // 1. Traite les new_fields : génère UUIDs réels + map placeholder → uuid (LOCAL au doc)
    // Avant on partageait placeholderToUuid entre docs (risque de collision new_1 du doc A
    // qui matche new_1 du doc B). Maintenant : 1 map par doc, sûr en parallèle.
    const placeholderToUuid = new Map<string, string>()
    for (const nf of (parsed.new_fields || [])) {
      const realId = randomUUID()
      if (nf._id) placeholderToUuid.set(nf._id, realId)
      const field: SignField = {
        id: realId,
        type: nf.type,
        page: Math.max(1, Math.round(nf.page || 1)),
        x: clamp01(nf.x), y: clamp01(nf.y),
        width: clamp01(nf.width), height: clamp01(nf.height),
        recipientOrder: nf.recipientOrder || 1,
        label: nf.tooltip || nf.type,
        tooltip: nf.tooltip || undefined,
        required: !!nf.required,
        source: 'manual',
        wizardSection: nf.wizardSection || undefined,
        conditions: Array.isArray(nf.conditions) && nf.conditions.length > 0
          ? (nf.conditions as SignField['conditions'])
          : undefined,
        metadata: Array.isArray(nf.metadata_listItems) && nf.metadata_listItems.length > 0
          ? { listItems: nf.metadata_listItems }
          : undefined,
      }
      result.newFields.push(field)
    }

    // 2. Steps : remplace les placeholders par UUIDs + assigne recipientOrder
    const fieldRecipientOrderMap = new Map<string, number>()
    for (const f of doc.fields || []) {
      fieldRecipientOrderMap.set(f.id, f.recipientOrder || 1)
    }
    for (const nf of result.newFields) {
      fieldRecipientOrderMap.set(nf.id, nf.recipientOrder || 1)
    }

    result.stepsWithIds = (parsed.wizard_steps || []).map(s => {
      const resolvedFieldIds = (s.fieldIds || []).map(fid =>
        placeholderToUuid.get(fid) || fid,
      )
      let recipientOrder = (s as { recipientOrder?: number }).recipientOrder
      if (!recipientOrder) {
        const orders = resolvedFieldIds
          .map(fid => fieldRecipientOrderMap.get(fid))
          .filter((o): o is number => typeof o === 'number')
        if (orders.length > 0) {
          const counts = new Map<number, number>()
          for (const o of orders) counts.set(o, (counts.get(o) || 0) + 1)
          recipientOrder = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0]
        } else {
          recipientOrder = 1
        }
      }
      return {
        ...s,
        id: 'wstep_' + Math.random().toString(36).slice(2, 11),
        docOrder: s.docOrder || (doc.order ?? docIdx + 1),
        recipientOrder,
        fieldIds: resolvedFieldIds,
      }
    })
    result.fieldUpdates = parsed.field_updates || []
    return result
  }

  // v2.7.6 — Pagination : si template > 5 docs, on traite par batch de 3.
  // Sinon (≤ 5 docs), on traite tout en parallèle comme avant (perf optimale).
  const totalDocs = template.documents.length
  const needsPagination = totalDocs > PAGINATION_THRESHOLD
  const batchEnd = needsPagination ? Math.min(batchStart + BATCH_SIZE, totalDocs) : totalDocs
  const docsToProcess = template.documents
    .map((doc, idx) => ({ doc, idx }))
    .slice(batchStart, batchEnd)

  // Lance le batch en parallèle. allSettled garantit qu'un échec n'interrompt pas les autres.
  const settled = await Promise.allSettled(
    docsToProcess.map(({ doc, idx }) => processDoc(doc, idx)),
  )

  // Agrégation des résultats — ordre préservé via docIdx pour reconstruire updatedDocs
  const allSteps: WizardStep[] = []
  const allUpdates: FieldUpdate[] = []
  const newFieldsByDocIdx = new Map<number, SignField[]>()
  const errors: string[] = []

  for (const r of settled) {
    if (r.status === 'rejected') {
      errors.push(`Doc inconnu: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`)
      continue
    }
    const v = r.value
    if (v.error) errors.push(`${v.docName}: ${v.error}`)
    if (v.newFields.length > 0) newFieldsByDocIdx.set(v.docIdx, v.newFields)
    allSteps.push(...v.stepsWithIds)
    allUpdates.push(...v.fieldUpdates)
  }

  // v2.7.6 — En mode pagination, on n'exige pas que CHAQUE batch produise des steps
  // (un batch peut tomber sur des docs vides). On bloque uniquement si batchStart=0
  // et qu'AUCUN step n'a été généré du tout.
  if (allSteps.length === 0 && batchStart === 0 && !needsPagination) {
    return NextResponse.json({
      error: 'Aucun step généré',
      details: errors,
    }, { status: 500 })
  }

  // 3. Apply field_updates + new_fields aux documents de CE BATCH uniquement.
  // Les autres docs restent intacts (préservés depuis template.documents).
  const batchDocIdxSet = new Set(docsToProcess.map(({ idx }) => idx))
  const updatedDocs: SignDocument[] = template.documents.map((d, idx) => {
    if (!batchDocIdxSet.has(idx)) return d  // doc hors batch → préservé tel quel
    const updatedFields = (d.fields || []).map(f => {
      const upd = allUpdates.find(u => u.id === f.id)
      if (!upd) return f
      const next: SignField = { ...f }
      if (upd.tooltip !== undefined) next.tooltip = upd.tooltip
      if (upd.required !== undefined) next.required = upd.required
      if (upd.wizardSection !== undefined) next.wizardSection = upd.wizardSection || undefined
      if (Array.isArray(upd.metadata_listItems)) {
        next.metadata = { ...next.metadata, listItems: upd.metadata_listItems }
      }
      if (Array.isArray(upd.conditions)) {
        next.conditions = upd.conditions as SignField['conditions']
      }
      return next
    })
    const newFields = newFieldsByDocIdx.get(idx) || []
    return { ...d, fields: [...updatedFields, ...newFields] }
  })

  // v2.7.6 — Merge incrémental des wizard_steps : on retire les steps des docs de
  // CE batch (par docOrder) et on les remplace par les nouveaux. Les steps des
  // autres docs sont préservés (batchs précédents).
  const batchDocOrders = new Set(
    docsToProcess.map(({ doc, idx }) => doc.order ?? idx + 1),
  )
  const existingStepsToKeep = batchStart > 0
    ? (template.wizard_steps || []).filter(s => !batchDocOrders.has(s.docOrder))
    : []
  const mergedSteps = [...existingStepsToKeep, ...allSteps]

  // 4. Persist
  const { error: upErr } = await supabase
    .from('sign_templates' as any)
    .update({
      documents: updatedDocs,
      wizard_steps: mergedSteps,
    })
    .eq('id', id)

  if (upErr) {
    return NextResponse.json({ error: 'Erreur sauvegarde DB', details: upErr.message }, { status: 500 })
  }

  let newFieldsCount = 0
  for (const arr of newFieldsByDocIdx.values()) newFieldsCount += arr.length

  // v2.7.6 — Réponse : 'partial' si reste à traiter, 'complete' sinon
  const isPartial = needsPagination && batchEnd < totalDocs
  return NextResponse.json({
    ok: true,
    status: isPartial ? 'partial' : 'complete',
    processedDocs: batchEnd,
    totalDocs,
    nextBatchIndex: isPartial ? batchEnd : null,
    stepsCount: allSteps.length,
    fieldUpdatesCount: allUpdates.length,
    newFieldsCount,
    errors: errors.length > 0 ? errors : undefined,
  })
}

function clamp01(n: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}
