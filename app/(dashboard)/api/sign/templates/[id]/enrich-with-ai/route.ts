// TalentFlow Sign — Enrichissement IA d'un template (Claude vision sur PDF)
// v2.2.0 — Phase 4a-bis-4
//
// Pour chaque doc du template, télécharge le PDF + envoie à Claude vision avec
// la liste des fields (id + position normalisée + tooltip actuel). Claude retourne
// une structure wizard_steps optimisée + des field_updates (tooltip, required,
// conditions, listItems). On applique tout en DB.
//
// Modèle utilisé : claude-sonnet-4-5 (vision PDF natif).
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

const SYSTEM_PROMPT = `Tu es un expert en UX de formulaires administratifs. Tu analyses un PDF de formulaire et tu génères / structures les champs en un wizard step-by-step parfait pour mobile.

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

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth()
  if (authError) return authError

  const { id } = await ctx.params

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

  // 2. Pour chaque doc, télécharger le PDF
  const anthropic = new Anthropic({ apiKey })

  // On enrichit document par document pour ne pas dépasser les limites de contexte.
  // Aggrégation finale : steps fusionnés dans l'ordre des docs.
  const allSteps: WizardStep[] = []
  const allUpdates: FieldUpdate[] = []
  // Pour les fields créés par Claude (mode B) : map docIdx → list of new fields with real UUIDs
  const newFieldsByDocIdx = new Map<number, SignField[]>()
  // Map placeholder ("new_1") → vrai UUID pour résoudre les fieldIds dans wizard_steps
  const placeholderToUuid = new Map<string, string>()
  const errors: string[] = []

  for (const [docIdx, doc] of template.documents.entries()) {
    if (!doc.storage_path) continue
    // v2.2.1 — On envoie TOUS les fields (tous rôles) à Claude, pas juste le rôle 1.
    // Sinon dans un template multi-rôles (Candidat + Client), les fields du Client
    // sont ignorés et l'IA n'a pas le contexte pour structurer son wizard.
    const recipientFields = (doc.fields || [])
    // ⚠️ On ne SKIP plus si recipientFields.length === 0 — Claude doit pouvoir
    // générer les fields depuis zéro (mode B).

    // Download PDF
    const { data: blob, error: dlErr } = await supabase.storage
      .from('talentflow-sign')
      .download(doc.storage_path)
    if (dlErr || !blob) {
      errors.push(`${doc.name}: download failed (${dlErr?.message})`)
      continue
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

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
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

      // Récup le texte
      const textBlock = response.content.find(c => c.type === 'text')
      if (!textBlock || textBlock.type !== 'text') {
        errors.push(`${doc.name}: pas de réponse text`)
        continue
      }
      let raw = textBlock.text.trim()
      // Strip ```json wrapping si présent
      raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

      let parsed: AIResult
      try {
        parsed = JSON.parse(raw)
      } catch (e) {
        errors.push(`${doc.name}: JSON parse failed (${(e as Error).message})`)
        continue
      }

      // 1. Traite les new_fields : génère UUIDs réels + map placeholder → uuid
      const newFieldsForDoc: SignField[] = []
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
        newFieldsForDoc.push(field)
      }
      if (newFieldsForDoc.length > 0) newFieldsByDocIdx.set(docIdx, newFieldsForDoc)

      // 2. Steps : remplace les placeholders par UUIDs + assigne recipientOrder
      // (déduit depuis les fields référencés par le step).
      // Map fieldId → recipientOrder pour résoudre vite (existing + new fields)
      const fieldRecipientOrderMap = new Map<string, number>()
      for (const f of doc.fields || []) {
        fieldRecipientOrderMap.set(f.id, f.recipientOrder || 1)
      }
      for (const nf of newFieldsForDoc) {
        fieldRecipientOrderMap.set(nf.id, nf.recipientOrder || 1)
      }

      const stepsWithIds = (parsed.wizard_steps || []).map(s => {
        const resolvedFieldIds = (s.fieldIds || []).map(fid =>
          placeholderToUuid.get(fid) || fid,
        )
        // v2.2.1 — Déduit recipientOrder du step depuis le 1er field qu'il référence.
        // Si Claude a fourni s.recipientOrder explicitement, on le respecte.
        // Sinon majoritaire des fields, fallback 1.
        let recipientOrder = (s as { recipientOrder?: number }).recipientOrder
        if (!recipientOrder) {
          const orders = resolvedFieldIds
            .map(fid => fieldRecipientOrderMap.get(fid))
            .filter((o): o is number => typeof o === 'number')
          if (orders.length > 0) {
            // Majoritaire (mode statistique)
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

      allSteps.push(...stepsWithIds)
      allUpdates.push(...(parsed.field_updates || []))
    } catch (e) {
      errors.push(`${doc.name}: API error (${(e as Error).message})`)
    }
  }

  if (allSteps.length === 0) {
    return NextResponse.json({
      error: 'Aucun step généré',
      details: errors,
    }, { status: 500 })
  }

  // 3. Apply field_updates + new_fields aux documents
  const updatedDocs: SignDocument[] = template.documents.map((d, idx) => {
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
    // Ajoute les new_fields générés par Claude pour ce doc
    const newFields = newFieldsByDocIdx.get(idx) || []
    return {
      ...d,
      fields: [...updatedFields, ...newFields],
    }
  })

  // 4. Persist
  const { error: upErr } = await supabase
    .from('sign_templates' as any)
    .update({
      documents: updatedDocs,
      wizard_steps: allSteps,
    })
    .eq('id', id)

  if (upErr) {
    return NextResponse.json({ error: 'Erreur sauvegarde DB', details: upErr.message }, { status: 500 })
  }

  // Compte total des new_fields ajoutés
  let newFieldsCount = 0
  for (const arr of newFieldsByDocIdx.values()) newFieldsCount += arr.length

  return NextResponse.json({
    ok: true,
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
