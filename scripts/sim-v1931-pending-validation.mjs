#!/usr/bin/env node
// Simulation v1.9.31 — estimation volume pending_validation (uncertain 8-10)
// Objectif :
//   1. Compter les paires de candidats actuelles qui tomberaient en uncertain (score 8-10)
//   2. Estimer le volume quotidien attendu en pending_validation

import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// ─── Helpers copiés depuis lib/candidat-matching.ts ──────────────────────────
const unaccent = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
const normalizeTel = (t) => (t || '').replace(/\D/g, '')
const tel9 = (t) => { const d = normalizeTel(t); return d.length >= 9 ? d.slice(-9) : '' }
const tokensOfIdentity = (nom, prenom) => {
  const raw = `${nom || ''} ${prenom || ''}`
  return Array.from(new Set(unaccent(raw).split(/[^a-z0-9]+/).filter(w => w.length >= 3))).sort()
}
const normDdn = (d) => {
  if (!d) return null
  const s = String(d).trim(); if (!s) return null
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dmy = s.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`
  return null
}
const normEmail = (e) => { if (!e) return null; const s = e.toLowerCase().trim(); return s.includes('@') ? s : null }
const normVille = (v) => {
  if (!v) return null
  let s = unaccent(String(v)).replace(/\b\d{4}\b/g, ' ')
  const c = s.indexOf(','); if (c > 0) s = s.slice(0, c)
  s = s.trim().replace(/\s+/g, ' ')
  return s.length > 1 ? s : null
}

// ─── Fetch candidats ─────────────────────────────────────────────────────────
console.log('[SIM] Fetching candidats...')
const all = []
let from = 0
while (true) {
  const { data, error } = await supabase.from('candidats')
    .select('id, nom, prenom, email, telephone, date_naissance, localisation')
    .range(from, from + 999)
  if (error) { console.error(error); process.exit(1) }
  if (!data || data.length === 0) break
  all.push(...data)
  from += 1000
  if (data.length < 1000) break
}
console.log(`[SIM] ${all.length} candidats récupérés\n`)

// ─── Group by sorted tokens ──────────────────────────────────────────────────
const groups = new Map()
for (const c of all) {
  const toks = tokensOfIdentity(c.nom, c.prenom)
  if (toks.length === 0) continue
  const key = toks.join('|')
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(c)
}

// ─── Analyse paires par bande ───────────────────────────────────────────────
const bands = { certain: [], uncertain: [], none: [] }
let earlyReject = 0

for (const g of groups.values()) {
  if (g.length < 2) continue
  for (let i = 0; i < g.length; i++) {
    for (let j = i + 1; j < g.length; j++) {
      const a = g[i], b = g[j]
      const ddnA = normDdn(a.date_naissance), ddnB = normDdn(b.date_naissance)
      if (ddnA && ddnB && ddnA !== ddnB) { earlyReject++; continue }
      const ddnMatch = ddnA && ddnB && ddnA === ddnB
      const telMatch = tel9(a.telephone).length === 9 && tel9(a.telephone) === tel9(b.telephone)
      const emailMatch = !!normEmail(a.email) && normEmail(a.email) === normEmail(b.email)
      const villeMatch = !!normVille(a.localisation) && normVille(a.localisation) === normVille(b.localisation)

      let score = 5 // strictExact (garanti par grouping)
      if (ddnMatch) score += 10
      if (telMatch) score += 8
      if (emailMatch) score += 8
      if (villeMatch) score += 3

      const entry = { a, b, score, ddnMatch, telMatch, emailMatch, villeMatch }
      if (score >= 11) bands.certain.push(entry)
      else if (score >= 8) bands.uncertain.push(entry)
      else bands.none.push(entry)
    }
  }
}

console.log('═'.repeat(80))
console.log('[RESULTS] Distribution des paires homonymes (tokens identiques)')
console.log('═'.repeat(80))
console.log(`Paires avec DDN contradictoire (early reject)      : ${earlyReject}`)
console.log(`Paires score ≥ 11 (match auto)                     : ${bands.certain.length}`)
console.log(`Paires score 8-10 (uncertain → pending_validation) : ${bands.uncertain.length}`)
console.log(`Paires score < 8 (none → création nouvelle fiche)  : ${bands.none.length}`)
console.log('')

// ─── Détail uncertain ────────────────────────────────────────────────────────
console.log('─── Paires UNCERTAIN (8-10) — cas nécessitant validation manuelle ───')
for (const p of bands.uncertain) {
  console.log(`  [${p.score}] ${p.a.prenom} ${p.a.nom} (${p.a.email || '∅'}) vs ${p.b.prenom} ${p.b.nom} (${p.b.email || '∅'}) — ville=${p.villeMatch}`)
}

// ─── Query volume OneDrive imports par jour ──────────────────────────────────
console.log('\n═'.repeat(80))
console.log('[ONEDRIVE] Volume imports OneDrive par jour (7 derniers jours)')
console.log('═'.repeat(80))
const { data: recent, error: errOD } = await supabase.from('onedrive_fichiers')
  .select('traite_le, statut_action, candidat_id')
  .gte('traite_le', new Date(Date.now() - 7 * 86400 * 1000).toISOString())
  .order('traite_le', { ascending: false })
  .limit(2000)

if (errOD) { console.error(errOD) }
else {
  const byDay = new Map()
  const byStatut = new Map()
  for (const r of recent || []) {
    const day = r.traite_le?.slice(0, 10) || 'unknown'
    byDay.set(day, (byDay.get(day) || 0) + 1)
    byStatut.set(r.statut_action, (byStatut.get(r.statut_action) || 0) + 1)
  }
  console.log(`Total imports 7j : ${(recent || []).length}`)
  console.log('Par jour :')
  for (const [day, n] of [...byDay.entries()].sort()) {
    console.log(`  ${day} : ${n}`)
  }
  console.log('Par statut :')
  for (const [s, n] of [...byStatut.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${s || 'null'} : ${n}`)
  }
  const avgPerDay = Math.round((recent || []).length / 7)
  console.log(`\n[EXTRAPOLATION] Moyenne ~${avgPerDay} imports/jour`)

  // Taux d'uncertain estimé : paires uncertain / (paires certain+uncertain) × imports matchés
  const matched = (recent || []).filter(r => r.candidat_id && (r.statut_action === 'updated' || r.statut_action === 'reactivated'))
  const matchRate = matched.length / Math.max((recent || []).length, 1)
  const uncertainRate = bands.uncertain.length / Math.max(bands.certain.length + bands.uncertain.length, 1)
  const estimatedUncertainPerDay = avgPerDay * matchRate * uncertainRate
  console.log(`Matches (updated+reactivated) sur 7j : ${matched.length} (${(matchRate * 100).toFixed(1)}%)`)
  console.log(`Taux uncertain dans la bande match (stock DB) : ${(uncertainRate * 100).toFixed(1)}%`)
  console.log(`Estimation pending_validation par jour : ~${estimatedUncertainPerDay.toFixed(2)}`)
}
