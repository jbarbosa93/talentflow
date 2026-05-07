#!/usr/bin/env node
// TalentFlow Sign — Enrichit les tooltips/labels des fields à partir du texte du PDF
// v2.2.0 — Phase 4a-bis-2
//
// Usage : node scripts/batch/enrich-fields-from-pdf.mjs
//
// Algo (déterministe, sans IA) :
//   1. Pour chaque template : pour chaque doc, télécharge le PDF depuis Storage
//   2. Extrait le textContent de chaque page via pdfjs (positions + texte)
//   3. Pour chaque field SANS tooltip :
//      - Cherche le texte le plus proche AU-DESSUS ou À GAUCHE du field
//      - Concatène les ~3 mots significatifs → field.tooltip
//   4. Pour chaque wizard_step (cluster) :
//      - Cherche un titre de section au-dessus du 1er field (texte court, finissant
//        souvent par ":" ou en majuscules — comme "Données personnelles", "Conjoint")
//      - Set wizard_steps[].title
//   5. Update sign_templates.documents + wizard_steps
//
// pdfjs-dist en Node : legacy build + polyfills DOMMatrix/Path2D pour fonctionner
// dans Node sans browser env.

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

// Polyfills minimaux pour pdfjs en Node (pas besoin de canvas pour getTextContent)
// pdfjs vérifie l'existence de DOMMatrix au load — stub minimal suffit pour getTextContent
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor(init) { Object.assign(this, init || {}) }
    multiply() { return this }
    translate() { return this }
    scale() { return this }
  }
}

const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
// Pointe le worker vers le fichier physique installé (pdfjs en Node + main thread = OK avec workerSrc valide)
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).href

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

// ─── Helpers extraction texte ─────────────────────────────────────────────

/**
 * Extrait pour 1 page : items texte avec coords TOP-LEFT origin (en pts).
 * pdfjs retourne en BOTTOM-LEFT → on convertit.
 */
async function extractTextItems(pdfDoc, pageNum) {
  const page = await pdfDoc.getPage(pageNum)
  const viewport = page.getViewport({ scale: 1 })
  const pageHeight = viewport.height
  const pageWidth = viewport.width
  const tc = await page.getTextContent()
  const items = []
  for (const it of tc.items) {
    if (!it.str || !it.str.trim()) continue
    const tr = it.transform // [a, b, c, d, e, f]
    const x = tr[4]
    const yBL = tr[5]
    // pdfjs height of text = it.height (or fontSize approximation)
    const height = it.height || (Math.abs(tr[3]) || 10)
    const yTL = pageHeight - yBL - height
    items.push({
      str: it.str,
      x, y: yTL, width: it.width || (it.str.length * 5), height,
    })
  }
  return { items, pageWidth, pageHeight }
}

/**
 * Trouve le texte "label" pour un field donné en cherchant :
 *   1. À GAUCHE sur la même ligne (priorité)
 *   2. AU-DESSUS proche (fallback)
 * Retourne string nettoyé (max 60 chars).
 */
function findFieldLabel(field, textItems, pageWidth, pageHeight) {
  // Coords field en pts TOP-LEFT
  const fx = field.x * pageWidth
  const fy = field.y * pageHeight
  const fw = field.width * pageWidth
  const fh = field.height * pageHeight

  // 1. À GAUCHE sur la même ligne (chevauchement vertical du field)
  const sameLineLeft = textItems.filter(t => {
    const overlapY = Math.min(fy + fh, t.y + t.height) - Math.max(fy, t.y)
    return overlapY > 0 && t.x + t.width <= fx + 2 && (fx - (t.x + t.width)) < 200
  })
  if (sameLineLeft.length > 0) {
    sameLineLeft.sort((a, b) => (a.x + a.width) - (b.x + b.width))
    // Prend les derniers items (les + proches du field)
    const close = sameLineLeft.slice(-4)
    const text = close.map(t => t.str).join('').trim()
    return cleanLabel(text)
  }

  // 2. AU-DESSUS dans une fenêtre verticale ≤ 25 pts
  const above = textItems.filter(t => {
    const dy = fy - (t.y + t.height)
    if (dy < 0 || dy > 25) return false
    // Doit être au moins partiellement au-dessus de la zone X du field
    const overlapX = Math.min(fx + fw, t.x + t.width) - Math.max(fx, t.x)
    return overlapX > -30 // tolérance
  })
  if (above.length > 0) {
    // Sort par y desc (le plus proche du field d'abord) puis x asc
    above.sort((a, b) => (b.y - a.y) || (a.x - b.x))
    // Prend la ligne la plus proche (regroupe les items à y similaire)
    const refY = above[0].y
    const sameLine = above.filter(t => Math.abs(t.y - refY) < 4)
    sameLine.sort((a, b) => a.x - b.x)
    const text = sameLine.map(t => t.str).join('').trim()
    return cleanLabel(text)
  }

  return null
}

/**
 * Pour un cluster (wizard_step) : trouve un titre de section.
 * Heuristique : on remonte jusqu'à 80 pts au-dessus du field le plus haut,
 * et on cherche un texte qui ne soit pas juste un label de field
 * (typiquement plus court, en début de ligne, finissant par ":" ou en majuscules).
 */
function findStepTitle(stepFields, allTextItems, pageWidth, pageHeight) {
  if (stepFields.length === 0) return null
  // Field le plus haut du cluster
  const topField = stepFields.reduce((min, f) => (f.y < min.y ? f : min), stepFields[0])
  const fy = topField.y * pageHeight
  const fx = topField.x * pageWidth

  // Cherche dans une fenêtre 0-80 pts au-dessus
  const candidates = allTextItems.filter(t => {
    const dy = fy - (t.y + t.height)
    if (dy < 5 || dy > 80) return false
    // Pas trop loin horizontalement
    return t.x < fx + 200 && t.x > fx - 200
  })
  if (candidates.length === 0) return null

  // Group par ligne (y similaire)
  const lines = []
  for (const t of candidates) {
    let line = lines.find(l => Math.abs(l.y - t.y) < 4)
    if (!line) {
      line = { y: t.y, items: [] }
      lines.push(line)
    }
    line.items.push(t)
  }
  lines.sort((a, b) => b.y - a.y) // desc = plus proche du field en premier

  // Heuristiques : on cherche une ligne qui ressemble à un titre de section
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x)
    const text = line.items.map(t => t.str).join('').trim()
    if (!text || text.length < 3) continue
    // Ignore si c'est juste un label de field (label trop générique)
    if (text.length > 80) continue
    // Bonus si :
    //  - finit par ":"
    //  - est en majuscules / Title Case sans deux-points (titre type "Données personnelles")
    //  - 1-5 mots
    const words = text.split(/\s+/)
    if (words.length > 6) continue
    // Skip si commence par chiffre (numéro de ligne genre "1-2-3")
    if (/^[\d]/.test(text)) continue
    return cleanLabel(text)
  }
  return null
}

function cleanLabel(s) {
  if (!s) return null
  // Nettoie : trim, supprime ":" final, espaces multiples
  let cleaned = s.replace(/\s+/g, ' ').trim()
  cleaned = cleaned.replace(/[:：]\s*$/, '').trim()
  // Limite longueur
  if (cleaned.length > 60) cleaned = cleaned.slice(0, 60).trim() + '…'
  if (cleaned.length < 2) return null
  return cleaned
}

// ─── Main ─────────────────────────────────────────────────────────────────

const { data: tpls, error } = await supabase
  .from('sign_templates')
  .select('id, name, documents, wizard_steps')

if (error) {
  console.error('Erreur fetch:', error)
  process.exit(1)
}

console.log(`📋 ${tpls.length} templates trouvés\n`)

for (const tpl of tpls) {
  console.log(`━━━ ${tpl.name} ━━━`)
  const documents = tpl.documents || []
  const wizardSteps = tpl.wizard_steps || []
  let totalEnriched = 0
  let totalStepsRenamed = 0

  // Cache textContent par doc/page pour réutilisation entre fields/steps
  const textByDocPage = new Map()

  for (const doc of documents) {
    if (!doc.storage_path) continue
    console.log(`  📄 ${doc.name}`)

    // Download PDF
    const { data: blob, error: dlErr } = await supabase.storage
      .from('talentflow-sign')
      .download(doc.storage_path)
    if (dlErr || !blob) {
      console.log(`    ⚠️  Download failed:`, dlErr?.message)
      continue
    }
    const buf = new Uint8Array(await blob.arrayBuffer())

    let pdfDoc
    try {
      pdfDoc = await pdfjsLib.getDocument({ data: buf, useWorkerFetch: false }).promise
    } catch (e) {
      console.log(`    ⚠️  pdfjs load failed:`, e.message)
      continue
    }

    // Extract text par page (lazy)
    async function getPageText(pageNum) {
      const key = doc.storage_path + ':' + pageNum
      if (textByDocPage.has(key)) return textByDocPage.get(key)
      const t = await extractTextItems(pdfDoc, pageNum)
      textByDocPage.set(key, t)
      return t
    }

    // Pour chaque field sans tooltip → cherche label
    for (const field of (doc.fields || [])) {
      if (field.tooltip && field.tooltip.trim()) continue
      // Skip annotations (descriptive only)
      if (field.type === 'annotation') continue
      // Skip auto-fill (déjà labelisés)
      if (['firstname','lastname','fullname','email','company','title'].includes(field.type)) continue

      const { items, pageWidth, pageHeight } = await getPageText(field.page)
      const label = findFieldLabel(field, items, pageWidth, pageHeight)
      if (label) {
        field.tooltip = label
        totalEnriched += 1
      }
    }
  }

  // Pour chaque wizard step : cherche un titre de section
  // (basé sur le 1er field du step + son docOrder + page)
  const fieldById = new Map()
  for (const d of documents) {
    for (const f of (d.fields || [])) fieldById.set(f.id, f)
  }
  for (const step of wizardSteps) {
    if (step.isSignatureStep || step.isAutoFillStep) continue
    if (!step.title || !/^Étape /.test(step.title)) {
      // Si déjà un vrai titre (issu de tooltip ou d'annotation), garde
      continue
    }
    const stepFields = step.fieldIds.map(id => fieldById.get(id)).filter(Boolean)
    if (stepFields.length === 0) continue
    // Trouve le doc + page du step
    const doc = documents.find(d => (d.order ?? documents.indexOf(d) + 1) === step.docOrder)
    if (!doc) continue
    const firstField = stepFields[0]
    const page = firstField.page
    const key = doc.storage_path + ':' + page
    const cached = textByDocPage.get(key)
    if (!cached) continue
    const title = findStepTitle(stepFields, cached.items, cached.pageWidth, cached.pageHeight)
    if (title) {
      step.title = title
      totalStepsRenamed += 1
    } else {
      // Fallback : utilise le 1er tooltip enrichi du cluster
      const f0 = stepFields.find(f => f.tooltip)
      if (f0?.tooltip) {
        // Génère titre à partir du tooltip (1ers 3 mots)
        const w = f0.tooltip.split(/\s+/).slice(0, 4).join(' ')
        step.title = w.replace(/[.:]\s*$/, '')
        totalStepsRenamed += 1
      }
    }
  }

  console.log(`  ✨ ${totalEnriched} fields enrichis avec tooltip, ${totalStepsRenamed} étapes renommées`)

  // Update DB
  const { error: upErr } = await supabase
    .from('sign_templates')
    .update({ documents, wizard_steps: wizardSteps })
    .eq('id', tpl.id)
  if (upErr) {
    console.error(`  ❌ erreur update:`, upErr.message)
  } else {
    console.log(`  ✅ Template mis à jour\n`)
  }
}

console.log('Done.')
