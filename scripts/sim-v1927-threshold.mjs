#!/usr/bin/env node
// Simulation v1.9.27 — impact du durcissement strictExact (score ≥ 5 → ≥ 8)
// Objectif : identifier les paires qui matchent uniquement via strictExact seul (score=5)
// et qui seraient PERDUES avec seuil 8.
//
// Usage : node scripts/sim-v1927-threshold.mjs

import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('SUPABASE env missing'); process.exit(1) }
const supabase = createClient(url, key)

// ─── Helpers (copie de lib/candidat-matching.ts) ─────────────────────────────
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

// ─── Fetch all candidates ─────────────────────────────────────────────────────
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
console.log(`[SIM] ${all.length} candidats récupérés`)

// ─── Group by sorted tokens ───────────────────────────────────────────────────
const groups = new Map()
for (const c of all) {
  const toks = tokensOfIdentity(c.nom, c.prenom)
  if (toks.length === 0) continue
  const key = toks.join('|')
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(c)
}

const multi = [...groups.entries()].filter(([_, g]) => g.length >= 2)
console.log(`[SIM] ${multi.length} groupes de tokens identiques (≥2 candidats)`)

// ─── Analyse pairs per group ──────────────────────────────────────────────────
let totalPairs = 0
let matchCurrent = 0        // paires qui matchent avec threshold=5
let matchThr7 = 0           // paires qui matcheraient avec threshold=7
let matchThr8 = 0           // paires qui matcheraient avec threshold=8
let lost7 = []              // paires perdues avec threshold=7
let lost8 = []              // paires perdues avec threshold=8

for (const [key, g] of multi) {
  for (let i = 0; i < g.length; i++) {
    for (let j = i + 1; j < g.length; j++) {
      const a = g[i], b = g[j]
      totalPairs++

      const ddnA = normDdn(a.date_naissance), ddnB = normDdn(b.date_naissance)
      const ddnMatch = ddnA && ddnB && ddnA === ddnB
      const ddnContradict = ddnA && ddnB && ddnA !== ddnB
      if (ddnContradict) continue  // early reject

      const telMatch = tel9(a.telephone).length === 9 && tel9(a.telephone) === tel9(b.telephone)
      const emailMatch = !!normEmail(a.email) && normEmail(a.email) === normEmail(b.email)
      const villeMatch = !!normVille(a.localisation) && normVille(a.localisation) === normVille(b.localisation)

      // strictExact = tokens identiques (garanti par le grouping)
      let score = 5  // strictExact
      if (ddnMatch) score += 10
      if (telMatch) score += 8
      if (emailMatch) score += 8
      if (villeMatch) score += 3

      // current threshold : strictExact ≥ 5 → toujours match (score min = 5)
      matchCurrent++

      // threshold 7 : exige score ≥ 7 (strictExact + au moins quelque chose donnant +2)
      if (score >= 7) matchThr7++
      else lost7.push({ a, b, score, ddnMatch, telMatch, emailMatch, villeMatch })

      // threshold 8 : exige score ≥ 8 (strictExact + ville ou signal fort)
      if (score >= 8) matchThr8++
      else lost8.push({ a, b, score, ddnMatch, telMatch, emailMatch, villeMatch })
    }
  }
}

console.log('\n' + '─'.repeat(80))
console.log(`[RESULTS]`)
console.log(`Total paires analysées (groupes tokens identiques, hors early reject DDN) : ${totalPairs}`)
console.log(`Matches actuels (threshold=5, strictExact seul) : ${matchCurrent}`)
console.log(`Matches avec threshold=7 : ${matchThr7} (perdu : ${lost7.length})`)
console.log(`Matches avec threshold=8 : ${matchThr8} (perdu : ${lost8.length})`)
console.log('─'.repeat(80))

// ─── Échantillons perdus ──────────────────────────────────────────────────────
console.log(`\n[ÉCHANTILLON] Paires perdues avec threshold=8 (${lost8.length} total) :`)
console.log('(ces paires sont strictExact score=5 SANS aucun signal fort ni ville — probables faux positifs)')
console.log('')
for (const p of lost8.slice(0, 30)) {
  const a = p.a, b = p.b
  console.log(`  ${a.id.slice(0, 8)} ${a.prenom} ${a.nom} | email=${a.email || '∅'} tel=${a.telephone || '∅'} ddn=${a.date_naissance || '∅'} ville=${a.localisation || '∅'}`)
  console.log(`  ${b.id.slice(0, 8)} ${b.prenom} ${b.nom} | email=${b.email || '∅'} tel=${b.telephone || '∅'} ddn=${b.date_naissance || '∅'} ville=${b.localisation || '∅'}`)
  console.log(`  → score=${p.score} (ddn=${p.ddnMatch} tel=${p.telMatch} email=${p.emailMatch} ville=${p.villeMatch})`)
  console.log('')
}

console.log(`\n[ÉCHANTILLON] Paires perdues avec threshold=7 (${lost7.length} total) — extra par rapport à thr=8 :`)
const extraLost7 = lost7.filter(p => p.score === 5 || p.score === 6)
for (const p of extraLost7.slice(0, 20)) {
  const a = p.a, b = p.b
  console.log(`  ${a.prenom} ${a.nom} vs ${b.prenom} ${b.nom} | score=${p.score}`)
}
