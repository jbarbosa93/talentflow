// TalentFlow Sign — Assistant IA template (v2.8.0)
//
// Reçoit un message en langage naturel + le contexte du template courant,
// retourne soit une explication, soit une liste de changes structurés à
// appliquer côté client (avec confirmation user). Le client mute ensuite
// le state local via applyTemplateChanges et l'auto-save 800ms persiste.
//
// Sécurité : requireAuth + service role pour lire le template + valide
// que la cible appartient bien au template (anti-injection IA).

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import Anthropic from '@anthropic-ai/sdk'
import type { SignDocument, SignField } from '@/lib/sign/types'
import type { WizardStep } from '@/lib/sign/wizard-builder'

export const runtime = 'nodejs'
export const maxDuration = 60

// ─── Types des changes acceptés ─────────────────────────────────────
type TemplateChange =
  | { op: 'set_required'; fieldId: string; value: boolean }
  | { op: 'set_label'; fieldId: string; label: string }
  | { op: 'add_condition'; fieldId: string; condition: { triggerFieldId: string; operator: string; value?: string; action: string } }
  | { op: 'remove_condition'; fieldId: string; conditionIndex: number }
  | { op: 'set_help_text'; fieldId: string; helpText: string }
  | { op: 'set_section'; fieldId: string; section: string | null }
  | { op: 'set_section_description'; section: string; description: string }
  | { op: 'move_to_step'; fieldId: string; stepId: string }
  | { op: 'create_step'; title: string; fieldIds: string[]; recipientOrder?: number }
  | { op: 'set_default_checked'; fieldId: string; value: boolean }
  | { op: 'group_fields'; fieldIds: string[]; rule: 'SelectAtLeast' | 'SelectAtMost' | 'SelectExactly'; count: number; groupName?: string }

type AssistantResponse =
  | { type: 'action'; explanation: string; changes: TemplateChange[]; unsupported?: string }
  | { type: 'explanation'; text: string }
  | { type: 'unsupported'; text: string; suggestion?: string }

// ─── SYSTEM PROMPT ──────────────────────────────────────────────────
const SYSTEM_PROMPT = `Tu es l'assistant IA de TalentFlow Sign, intégré dans l'éditeur de templates de signature de L-Agence SA (agence de placement, Monthey, Suisse).

Tu aides João (admin, non-développeur) à configurer ses templates par commande naturelle. Tu réponds TOUJOURS en français, tutoiement, concis et direct.

## Contexte
À chaque message tu reçois :
- La liste complète des fields du template (id, type, label, tooltip, page, wizardSection, required, conditions, groupId, metadata)
- Les étapes wizard actuelles (id, title, recipientOrder, fieldIds)
- Le mode courant ('document' ou 'wizard')
- Le champ sélectionné si applicable (selectedFieldId)

Tu dois RAISONNER sur les ids des champs concernés en lisant leurs tooltip / label / wizardSection. Les noms parlent : "Permis de conduire — Oui" = field tooltip "Oui" dans wizardSection "Permis de conduire".

## Capacités

Tu peux retourner ces opérations (op) :
- set_required : { fieldId, value: boolean } — rend obligatoire/facultatif
- set_label : { fieldId, label } — modifie le label affiché (synchronise aussi tooltip)
- add_condition : { fieldId, condition: { triggerFieldId, operator, value?, action } }
  Opérateurs : equals, notEquals, gte, lte, gt, lt, isEmpty, isNotEmpty
  Actions : require, unrequire, show, hide, check, uncheck
- remove_condition : { fieldId, conditionIndex } — par index (0-based)
- set_help_text : { fieldId, helpText } — annotation visible inline (italique gris)
- set_section : { fieldId, section: string | null } — wizardSection pour groupage
- set_section_description : { section, description } — annotation italique à côté du titre de section
- move_to_step : { fieldId, stepId } — déplace vers une étape wizard
- create_step : { title, fieldIds, recipientOrder? } — nouvelle étape wizard
- set_default_checked : { fieldId, value: boolean } — pré-coche/décoche par défaut (metadata.selected)
- group_fields : { fieldIds, rule: SelectAtLeast|SelectAtMost|SelectExactly, count, groupName? } — groupe checkboxes type radio

## Limites (réponds 'unsupported' si demandé)
- Créer un NOUVEAU champ sur le PDF (impossible sans coords)
- Modifier les coordonnées (x, y, width, height) d'un champ
- Logique AND entre conditions (uniquement OR séquentiel)
- Formules conditionnelles complexes
- Modifier le PDF source du template
- Supprimer des champs (trop destructeur, refuse pour sécurité)

## Format de réponse
RÉPONDS UNIQUEMENT EN JSON, AUCUN TEXTE AUTOUR.

Si tu peux agir :
{
  "type": "action",
  "explanation": "Je rends le champ Email obligatoire.",
  "changes": [
    { "op": "set_required", "fieldId": "abc-123", "value": true }
  ]
}

Si tu peux ajouter une partie + signaler le manquant :
{
  "type": "action",
  "explanation": "J'ai ajouté la condition demandée sur Email.",
  "changes": [...],
  "unsupported": "Je ne peux pas créer un nouveau champ Téléphone : place-le manuellement sur le PDF d'abord."
}

Si juste expliquer :
{ "type": "explanation", "text": "Une condition permet de..." }

Si hors capacités :
{
  "type": "unsupported",
  "text": "Je ne peux pas créer de nouveaux champs sur le PDF.",
  "suggestion": "Utilise la palette d'outils à droite (double-clic sur l'outil = placement au centre)."
}

## Règles dures
- N'invente JAMAIS un fieldId qui n'existe pas dans le contexte
- N'invente JAMAIS un stepId : utilise ceux fournis
- Pour create_step, génère un id type "wstep_" + 8 caractères hex
- Sois prudent : refuse les demandes destructrices ambiguës ("supprime tous les champs")
- Si la commande peut tout casser, propose 'explanation' avec demande de précision
- Maximum 5 changes par réponse pour limiter le risque`

// ─── Compact context pour Claude (limite tokens) ────────────────────
interface CompactField {
  id: string
  type: string
  page: number
  label?: string
  tooltip?: string
  required?: boolean
  wizardSection?: string
  helpText?: string
  recipientOrder?: number
  hasConditions?: number  // count
  groupId?: string
  groupRule?: string
  groupName?: string
  defaultChecked?: boolean
}

interface CompactStep {
  id: string
  title: string
  recipientOrder?: number
  fieldCount: number
}

function compactField(f: SignField): CompactField {
  const c: CompactField = { id: f.id, type: f.type, page: f.page }
  if (f.label) c.label = f.label.slice(0, 60)
  if (f.tooltip) c.tooltip = f.tooltip.slice(0, 60)
  if (f.required) c.required = true
  if (f.wizardSection) c.wizardSection = f.wizardSection
  if (f.helpText) c.helpText = f.helpText.slice(0, 80)
  if (f.recipientOrder && f.recipientOrder !== 1) c.recipientOrder = f.recipientOrder
  if (f.conditions && f.conditions.length > 0) c.hasConditions = f.conditions.length
  if (f.groupId) {
    c.groupId = f.groupId
    if (f.groupRule) c.groupRule = f.groupRule
    if (f.groupName) c.groupName = f.groupName
  }
  if (f.metadata?.selected === true) c.defaultChecked = true
  return c
}

// ─── POST handler ───────────────────────────────────────────────────
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth()
  if (authError) return authError

  const { id } = await ctx.params
  const body = await req.json().catch(() => null) as null | {
    message?: string
    selectedFieldId?: string
    currentMode?: 'document' | 'wizard'
  }
  if (!body?.message || typeof body.message !== 'string') {
    return NextResponse.json({ error: 'message manquant' }, { status: 400 })
  }
  if (body.message.length > 2000) {
    return NextResponse.json({ error: 'message trop long (max 2000 caractères)' }, { status: 400 })
  }

  // Workaround Claude Desktop empty env
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

  // Charge le template (source de vérité)
  const supabase = createAdminClient()
  const { data: tpl, error: tplErr } = await supabase
    .from('sign_templates' as any)
    .select('id, name, documents, wizard_steps')
    .eq('id', id)
    .maybeSingle()
  if (tplErr || !tpl) {
    return NextResponse.json({ error: 'Template introuvable' }, { status: 404 })
  }
  const template = tpl as unknown as { name: string; documents: SignDocument[]; wizard_steps: WizardStep[] }

  // Construit le contexte compact
  const allFields: SignField[] = (template.documents || []).flatMap(d => d.fields || [])
  const compactFields: CompactField[] = allFields.map(compactField)
  const compactSteps: CompactStep[] = (template.wizard_steps || []).map(s => ({
    id: s.id,
    title: s.title,
    recipientOrder: s.recipientOrder,
    fieldCount: s.fieldIds.length,
  }))

  const userPrompt = `Template: "${template.name}"
Mode courant: ${body.currentMode || 'document'}
${body.selectedFieldId ? `Champ sélectionné: ${body.selectedFieldId}` : 'Aucun champ sélectionné'}

Fields (${compactFields.length}):
${JSON.stringify(compactFields, null, 0)}

Étapes wizard (${compactSteps.length}):
${JSON.stringify(compactSteps, null, 0)}

Demande de l'admin : "${body.message}"

Réponds en JSON pur, sans markdown.`

  const anthropic = new Anthropic({ apiKey })
  let parsed: AssistantResponse
  try {
    const resp = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })
    const block = resp.content.find(b => b.type === 'text')
    if (!block || block.type !== 'text') {
      return NextResponse.json({ error: 'Pas de réponse texte de Claude' }, { status: 502 })
    }
    let raw = block.text.trim()
    // Strip markdown code fences si présents
    if (raw.startsWith('```')) {
      raw = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
    }
    parsed = JSON.parse(raw) as AssistantResponse
  } catch (e) {
    console.error('[sign/assistant] parse error', e)
    return NextResponse.json({
      error: 'Réponse Claude invalide',
      details: e instanceof Error ? e.message : 'Unknown',
    }, { status: 502 })
  }

  // Validation : si action, vérifier que les fieldIds existent réellement
  if (parsed.type === 'action' && Array.isArray(parsed.changes)) {
    const validFieldIds = new Set(allFields.map(f => f.id))
    const validStepIds = new Set((template.wizard_steps || []).map(s => s.id))
    const filtered: TemplateChange[] = []
    const rejected: string[] = []
    for (const ch of parsed.changes) {
      // Validation par op
      if ('fieldId' in ch && !validFieldIds.has(ch.fieldId)) {
        rejected.push(`Field id inconnu : ${ch.fieldId} (${ch.op})`)
        continue
      }
      if ('fieldIds' in ch) {
        const allValid = ch.fieldIds.every(fid => validFieldIds.has(fid))
        if (!allValid) {
          rejected.push(`Field ids inconnus dans ${ch.op}`)
          continue
        }
      }
      if (ch.op === 'move_to_step' && !validStepIds.has(ch.stepId)) {
        rejected.push(`Step id inconnu : ${ch.stepId}`)
        continue
      }
      filtered.push(ch)
    }
    if (rejected.length > 0) {
      const merged = parsed.unsupported
        ? `${parsed.unsupported}\nÉgalement rejetés : ${rejected.join('; ')}`
        : `Changes rejetés (anti-hallucination) : ${rejected.join('; ')}`
      parsed = { ...parsed, changes: filtered, unsupported: merged }
    }
  }

  return NextResponse.json(parsed)
}
