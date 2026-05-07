#!/usr/bin/env node
// TalentFlow Sign — Backfill wizard_steps pour les templates existants
// v2.2.0 — Phase 4a-bis-2
//
// Usage : node scripts/batch/backfill-wizard-steps.mjs
//
// Pour chaque template avec wizard_steps vide ou manquant, génère les étapes
// auto via buildWizardSteps() à partir des documents[].fields[].

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

// ─── Réimplémentation locale du builder (simple, pas d'import TS depuis .mjs) ─

const AUTO_FILL_TYPES = ['firstname', 'lastname', 'fullname', 'email', 'company', 'title']
const SIGNATURE_TYPES = ['signature', 'initial', 'date']

function genStepId() { return 'wstep_' + Math.random().toString(36).slice(2, 11) }

function commonTooltip(fields) {
  const counts = new Map()
  for (const f of fields) {
    const tip = (f.tooltip || '').trim()
    if (!tip) continue
    counts.set(tip, (counts.get(tip) || 0) + 1)
  }
  if (counts.size === 0) return null
  let best = null
  for (const [k, v] of counts) {
    if (!best || v > best[1]) best = [k, v]
  }
  if (!best) return null
  if (best[1] >= Math.ceil(fields.length * 0.5)) return best[0]
  return null
}

function clusterFieldsByPage(fields, gapThreshold = 0.025, maxFieldsPerCluster = 8) {
  if (fields.length === 0) return []
  const sorted = fields.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x))
  const clusters = []
  let current = [sorted[0]]
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

  const refined = []
  for (const c of clusters) {
    if (c.length <= maxFieldsPerCluster) { refined.push(c); continue }
    const sortedC = c.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x))
    const targetParts = Math.ceil(sortedC.length / maxFieldsPerCluster)
    const gaps = []
    for (let i = 1; i < sortedC.length; i++) gaps.push({ idx: i, gap: sortedC[i].y - sortedC[i - 1].y })
    gaps.sort((a, b) => b.gap - a.gap)
    const cutPoints = new Set(gaps.slice(0, targetParts - 1).map(g => g.idx))
    let part = [sortedC[0]]
    for (let i = 1; i < sortedC.length; i++) {
      if (cutPoints.has(i)) { refined.push(part); part = [sortedC[i]] }
      else part.push(sortedC[i])
    }
    if (part.length > 0) refined.push(part)
  }
  return refined
}

function clusterTitle(cluster, stepIndex) {
  const tip = commonTooltip(cluster.filter(f => f.type !== 'annotation'))
  if (tip) return tip
  const note = cluster.find(f => f.type === 'annotation')
  if (note?.label && note.label.length < 80 && note.label.length > 2) return note.label
  return `Étape ${stepIndex}`
}

function clusterDescription(cluster, usedTitle) {
  const notes = cluster
    .filter(f => f.type === 'annotation')
    .map(f => (f.label || '').trim())
    .filter(s => s && s !== usedTitle && s.length > 2 && s.length < 240)
  if (notes.length === 0) return undefined
  return Array.from(new Set(notes)).join(' · ')
}

function buildWizardSteps(documents, recipientOrder) {
  const steps = []
  const allFields = []
  documents.forEach((doc, idx) => {
    const docOrder = doc.order ?? (idx + 1)
    for (const f of (doc.fields || [])) {
      if (f.recipientOrder !== recipientOrder) continue
      if (f.metadata?.hidden === true) continue
      allFields.push({ field: f, docOrder })
    }
  })

  const autoFillFields = allFields.filter(({ field }) => AUTO_FILL_TYPES.includes(field.type))
  if (autoFillFields.length > 0) {
    steps.push({
      id: genStepId(),
      title: 'Vos informations',
      description: 'Vérifiez vos coordonnées pré-remplies depuis votre dossier.',
      fieldIds: autoFillFields.map(({ field }) => field.id),
      docOrder: autoFillFields[0].docOrder,
      isAutoFillStep: true,
    })
  }

  const fillFields = allFields.filter(({ field }) =>
    !AUTO_FILL_TYPES.includes(field.type) && !SIGNATURE_TYPES.includes(field.type),
  )
  const byDoc = new Map()
  for (const { field, docOrder } of fillFields) {
    if (!byDoc.has(docOrder)) byDoc.set(docOrder, [])
    byDoc.get(docOrder).push(field)
  }
  const sortedDocs = Array.from(byDoc.keys()).sort((a, b) => a - b)
  let stepIdxCounter = 1
  for (const docOrder of sortedDocs) {
    const docFields = byDoc.get(docOrder)
    const byPage = new Map()
    for (const f of docFields) {
      if (!byPage.has(f.page)) byPage.set(f.page, [])
      byPage.get(f.page).push(f)
    }
    const sortedPages = Array.from(byPage.keys()).sort((a, b) => a - b)
    for (const page of sortedPages) {
      const pageFields = byPage.get(page)
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
        })
        stepIdxCounter += 1
      }
    }
  }

  const sigFields = allFields.filter(({ field }) => SIGNATURE_TYPES.includes(field.type))
  if (sigFields.length > 0) {
    steps.push({
      id: genStepId(),
      title: 'Signature',
      description: 'Signez électroniquement pour finaliser votre dossier.',
      fieldIds: sigFields.map(({ field }) => field.id),
      docOrder: sigFields[0].docOrder,
      isSignatureStep: true,
    })
  }

  return steps
}

// ─── Main ─────────────────────────────────────────────────────────────────

const { data: tpls, error } = await supabase
  .from('sign_templates')
  .select('id, name, documents, wizard_steps, wizard_enabled')

if (error) {
  console.error('Erreur fetch:', error)
  process.exit(1)
}

console.log(`📋 ${tpls.length} templates trouvés`)

let updated = 0
let skipped = 0

for (const t of tpls) {
  const hasSteps = Array.isArray(t.wizard_steps) && t.wizard_steps.length > 0
  if (hasSteps) {
    skipped += 1
    console.log(`  ⏭️  ${t.name} — déjà ${t.wizard_steps.length} étapes (skip)`)
    continue
  }
  const steps = buildWizardSteps(t.documents || [], 1)
  console.log(`  🛠️  ${t.name} — ${steps.length} étapes générées`)
  for (const s of steps.slice(0, 5)) {
    console.log(`      - ${s.title} (${s.fieldIds.length} champs)${s.isSignatureStep ? ' [SIGNATURE]' : ''}${s.isAutoFillStep ? ' [AUTO-FILL]' : ''}`)
  }
  if (steps.length > 5) console.log(`      ... +${steps.length - 5} étapes`)

  const { error: upErr } = await supabase
    .from('sign_templates')
    .update({ wizard_steps: steps })
    .eq('id', t.id)
  if (upErr) {
    console.error(`      ❌ erreur update:`, upErr.message)
  } else {
    updated += 1
  }
}

console.log(`\n✅ ${updated} templates mis à jour, ${skipped} ignorés`)
