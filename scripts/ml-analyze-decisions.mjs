#!/usr/bin/env node
// Analyse des décisions humaines accumulées dans decisions_matching.
// Objectif : identifier quels signaux discriminent le mieux un vrai match
// vs un faux match, afin d'ajuster les seuils de findExistingCandidat.
//
// Usage :
//   node --env-file=.env.local scripts/ml-analyze-decisions.mjs
//
// Output :
//   - Distribution par type de décision (confirmed/rejected/ignored)
//   - Taux de faux positifs par bande de score
//   - Top signaux associés aux matches confirmés vs rejetés
//   - Recommandation de seuil basée sur l'historique

import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

console.log('[ML Analyze] Chargement des décisions...')

const { data: decisions, error } = await supabase
  .from('decisions_matching')
  .select('id, fichier_id, candidat_id, decision, score, signals, decided_at, note')
  .order('decided_at', { ascending: false })
  .limit(5000)

if (error) {
  console.error('Erreur :', error.message)
  process.exit(1)
}

if (!decisions || decisions.length === 0) {
  console.log('\n⚠️  Aucune décision enregistrée dans decisions_matching.')
  console.log('    La table est vide — le dataset commencera à se construire')
  console.log('    quand les utilisateurs valideront les pending_validation.')
  console.log('')
  console.log('    Volume actuel : 0 décisions.')
  console.log('    Revenir dans quelques semaines pour analyser les patterns.')
  process.exit(0)
}

console.log(`\n[ML Analyze] ${decisions.length} décisions chargées\n`)
console.log('═'.repeat(80))
console.log('[DISTRIBUTION] Par type de décision')
console.log('═'.repeat(80))

const byDecision = new Map()
for (const d of decisions) {
  byDecision.set(d.decision, (byDecision.get(d.decision) || 0) + 1)
}
for (const [k, v] of byDecision) {
  const pct = ((v / decisions.length) * 100).toFixed(1)
  console.log(`  ${k.padEnd(20)} : ${v} (${pct}%)`)
}

// ─── Distribution des scores par décision ────────────────────────────────────
console.log('\n' + '═'.repeat(80))
console.log('[SCORES] Distribution par bande et par décision')
console.log('═'.repeat(80))

const bands = [
  { label: '0-4',   min: 0,  max: 4 },
  { label: '5-7',   min: 5,  max: 7 },
  { label: '8-10',  min: 8,  max: 10 },
  { label: '11-15', min: 11, max: 15 },
  { label: '16-20', min: 16, max: 20 },
  { label: '21+',   min: 21, max: 999 },
]

const matrix = bands.map(b => ({ band: b.label, confirmed: 0, rejected: 0, ignored: 0 }))
for (const d of decisions) {
  const score = d.score || 0
  const band = bands.findIndex(b => score >= b.min && score <= b.max)
  if (band === -1) continue
  if (d.decision === 'confirmed_match') matrix[band].confirmed++
  else if (d.decision === 'rejected_match') matrix[band].rejected++
  else if (d.decision === 'ignored') matrix[band].ignored++
}

console.log(`  ${'Bande'.padEnd(8)}${'Confirmed'.padStart(12)}${'Rejected'.padStart(12)}${'Ignored'.padStart(10)}  Taux faux`)
console.log(`  ${'-'.repeat(50)}`)
for (const row of matrix) {
  const total = row.confirmed + row.rejected + row.ignored
  const fpRate = total > 0 ? ((row.rejected / total) * 100).toFixed(1) + '%' : '—'
  console.log(`  ${row.band.padEnd(8)}${String(row.confirmed).padStart(12)}${String(row.rejected).padStart(12)}${String(row.ignored).padStart(10)}  ${fpRate}`)
}

// ─── Top signaux par décision ────────────────────────────────────────────────
console.log('\n' + '═'.repeat(80))
console.log('[SIGNAUX] Fréquence par type de décision')
console.log('═'.repeat(80))

const signalCounts = {
  confirmed_match: { ddnMatch: 0, telMatch: 0, emailMatch: 0, villeMatch: 0, strictExact: 0, strictSubset: 0 },
  rejected_match: { ddnMatch: 0, telMatch: 0, emailMatch: 0, villeMatch: 0, strictExact: 0, strictSubset: 0 },
  ignored: { ddnMatch: 0, telMatch: 0, emailMatch: 0, villeMatch: 0, strictExact: 0, strictSubset: 0 },
}

const decisionTotals = { confirmed_match: 0, rejected_match: 0, ignored: 0 }

for (const d of decisions) {
  if (!d.signals || typeof d.signals !== 'object') continue
  decisionTotals[d.decision] = (decisionTotals[d.decision] || 0) + 1
  const sigs = d.signals
  for (const key of ['ddnMatch', 'telMatch', 'emailMatch', 'villeMatch', 'strictExact', 'strictSubset']) {
    if (sigs[key] === true) signalCounts[d.decision][key]++
  }
}

for (const decision of Object.keys(signalCounts)) {
  const total = decisionTotals[decision] || 0
  if (total === 0) continue
  console.log(`\n  ${decision} (n=${total}) :`)
  for (const [sig, count] of Object.entries(signalCounts[decision])) {
    const pct = ((count / total) * 100).toFixed(1)
    const bar = '█'.repeat(Math.round(count / total * 20))
    console.log(`    ${sig.padEnd(14)} ${String(count).padStart(4)}/${total} ${pct.padStart(5)}%  ${bar}`)
  }
}

// ─── Recommandation seuil ────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(80))
console.log('[RECOMMANDATION] Ajustement des seuils basé sur l\'historique')
console.log('═'.repeat(80))

// Trouve la bande où le taux de faux positifs (rejected) est < 5%
// Au-dessus de cette bande → auto-match sûr
let safeThreshold = 999
for (let i = bands.length - 1; i >= 0; i--) {
  const row = matrix[i]
  const total = row.confirmed + row.rejected
  if (total < 5) continue  // pas assez de données
  const fpRate = row.rejected / total
  if (fpRate < 0.05) {
    safeThreshold = bands[i].min
  } else {
    break
  }
}

if (safeThreshold === 999) {
  console.log('  Pas assez de données pour recommander un seuil.')
  console.log(`  Minimum 5 décisions par bande requis. État actuel : ${decisions.length} total.`)
} else {
  console.log(`  Seuil recommandé (auto-match < 5% faux positifs) : score >= ${safeThreshold}`)
  console.log(`  Seuil actuel dans le code : 11 (match) / 8 (uncertain)`)
  if (safeThreshold < 11) {
    console.log(`  💡 On pourrait abaisser le seuil match de 11 à ${safeThreshold}`)
  } else if (safeThreshold > 11) {
    console.log(`  ⚠️  Le seuil actuel (11) est trop permissif — devrait être à ${safeThreshold}`)
  } else {
    console.log(`  ✅ Le seuil actuel (11) correspond à la réalité du dataset.`)
  }
}

console.log('\n[ML Analyze] Terminé.')
