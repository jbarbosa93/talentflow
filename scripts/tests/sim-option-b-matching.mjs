#!/usr/bin/env node
// Simulation Option B — bloquer auto-fusion OneDrive si aucune DDN des 2 côtés
//
// v1.9.104 proposé : étendre isUncertainBand() avec règle
//   if (score >= 11 && !ddnA && !ddnB && !(emailMatch && telMatch)) → uncertain
//
// Cible : paires strictExact dans la DB existante, sans DDN des 2 côtés.
// Mesure :
//   - Combien de paires basculeraient match → uncertain
//   - Combien de paires "vrais doublons probables" restent match grâce au garde-fou
//   - Estimation volume quotidien sur la base des 30 derniers jours d'imports
//
// Usage : set -a; source .env.local; set +a; node scripts/tests/sim-option-b-matching.mjs

import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ── Helpers miroir de lib/candidat-matching.ts ────────────────────────────
const unaccent = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
const normalizeTel = (t) => (t || '').replace(/\D/g, '')
const tel9 = (t) => { const d = normalizeTel(t); return d.length >= 9 ? d.slice(-9) : '' }
const tokensOfIdentity = (nom, prenom) => {
  const raw = `${nom || ''} ${prenom || ''}`
  return Array.from(new Set(unaccent(raw).split(/[^a-z0-9]+/).filter(w => w.length >= 3))).sort()
}
const normDdn = (d) => {
  if (!d) return null
  const s = String(d).trim()
  if (!s) return null
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dmy = s.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  return null
}
const normEmail = (e) => { if (!e) return null; const s = e.toLowerCase().trim(); return s.includes('@') ? s : null }
const normVille = (v) => {
  if (!v) return null
  let s = unaccent(String(v))
  s = s.replace(/\b\d{4}\b/g, ' ')
  const comma = s.indexOf(',')
  if (comma > 0) s = s.slice(0, comma)
  s = s.trim().replace(/\s+/g, ' ')
  return s.length > 1 ? s : null
}

// ── Règle Option B ───────────────────────────────────────────────────────
function optionBDecision({ strictExact, score, ddnA, ddnB, emailMatch, telMatch }) {
  // Règle v1.9.31 existante : strictExact + 8-10 = uncertain
  if (strictExact && score >= 8 && score <= 10) return { kind: 'uncertain_existing', why: 'strictExact_8_10' }
  // Règle v1.9.104 Option B
  if (score >= 11 && !ddnA && !ddnB) {
    if (emailMatch && telMatch) return { kind: 'match_guardrail', why: 'email+tel identiques = même personne' }
    return { kind: 'uncertain_new', why: 'Option B (score≥11 sans DDN)' }
  }
  if (score >= 8) return { kind: 'match', why: 'seuil normal' }
  return { kind: 'below_threshold', why: `score ${score} < seuil` }
}

async function fetchAll() {
  const pageSize = 1000
  let all = []
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('candidats')
      .select('id, nom, prenom, email, telephone, date_naissance, localisation, created_at')
      .range(offset, offset + pageSize - 1)
      .order('id', { ascending: true })
    if (error) throw error
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < pageSize) break
  }
  return all
}

function buildGroupsByTokens(all) {
  const map = new Map()
  for (const c of all) {
    const tokens = tokensOfIdentity(c.nom, c.prenom)
    if (tokens.length === 0) continue
    const key = tokens.join('|')
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(c)
  }
  return map
}

function scorePair(a, b) {
  const tokensA = tokensOfIdentity(a.nom, a.prenom)
  const tokensB = tokensOfIdentity(b.nom, b.prenom)
  const strictExact = tokensA.length > 0 && tokensA.length === tokensB.length
    && tokensA.every((t, i) => t === tokensB[i])

  const ddnA = normDdn(a.date_naissance)
  const ddnB = normDdn(b.date_naissance)
  if (ddnA && ddnB && ddnA !== ddnB) return null // DDN contradictoires → early reject

  const ddnMatch = !!(ddnA && ddnB && ddnA === ddnB)
  const telMatch = tel9(a.telephone).length === 9 && tel9(a.telephone) === tel9(b.telephone)
  const emailMatch = !!normEmail(a.email) && normEmail(a.email) === normEmail(b.email)
  const villeMatch = !!normVille(a.localisation) && normVille(a.localisation) === normVille(b.localisation)

  let score = 0
  if (ddnMatch) score += 10
  if (telMatch) score += 8
  if (emailMatch) score += 8
  if (strictExact) score += 5
  if (villeMatch) score += 3

  return { strictExact, score, ddnA, ddnB, ddnMatch, telMatch, emailMatch, villeMatch }
}

async function main() {
  console.log('━'.repeat(75))
  console.log('Simulation Option B — matching sans DDN')
  console.log('━'.repeat(75))

  const all = await fetchAll()
  console.log(`\nCandidats récupérés : ${all.length}`)

  const groups = buildGroupsByTokens(all)
  const multiGroups = [...groups.values()].filter(g => g.length >= 2)
  console.log(`Groupes strictExact (≥2 candidats même tokens) : ${multiGroups.length}`)

  const stats = {
    pairs_examined: 0,
    pairs_ddn_contradictoire: 0,
    pairs_strict_exact: 0,
    pairs_below_8: 0,
    pairs_uncertain_existing: 0,  // déjà en uncertain avant v1.9.104
    pairs_match_current: 0,         // match aujourd'hui
    pairs_switching_to_uncertain: 0, // basculent match → uncertain avec Option B
    pairs_kept_match_guardrail: 0,  // garde-fou email+tel
    pairs_no_ddn_both: 0,
  }

  const samples = {
    switching: [],
    guardrail: [],
  }

  for (const group of multiGroups) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j]
        const r = scorePair(a, b)
        if (!r) { stats.pairs_ddn_contradictoire++; continue }
        stats.pairs_examined++
        if (r.strictExact) stats.pairs_strict_exact++
        if (!r.ddnA && !r.ddnB) stats.pairs_no_ddn_both++
        const decision = optionBDecision(r)
        switch (decision.kind) {
          case 'below_threshold': stats.pairs_below_8++; break
          case 'uncertain_existing': stats.pairs_uncertain_existing++; break
          case 'uncertain_new':
            stats.pairs_switching_to_uncertain++
            if (samples.switching.length < 10) {
              samples.switching.push({
                a: `${a.prenom} ${a.nom} (${a.email || '—'} | ${a.telephone || '—'})`,
                b: `${b.prenom} ${b.nom} (${b.email || '—'} | ${b.telephone || '—'})`,
                score: r.score, ville: r.villeMatch ? 'V' : '-', tel: r.telMatch ? 'T' : '-', email: r.emailMatch ? 'E' : '-',
              })
            }
            break
          case 'match_guardrail':
            stats.pairs_kept_match_guardrail++
            if (samples.guardrail.length < 10) {
              samples.guardrail.push({
                a: `${a.prenom} ${a.nom} (${a.email})`,
                b: `${b.prenom} ${b.nom} (${b.email})`,
                score: r.score,
              })
            }
            break
          case 'match': stats.pairs_match_current++; break
        }
      }
    }
  }

  console.log('\n' + '━'.repeat(75))
  console.log('Statistiques paires (toutes les combinaisons 2-à-2 dans chaque groupe)')
  console.log('━'.repeat(75))
  console.log(`  Paires examinées                        : ${stats.pairs_examined}`)
  console.log(`  Paires DDN contradictoire (early reject): ${stats.pairs_ddn_contradictoire}`)
  console.log(`  Paires strictExact                      : ${stats.pairs_strict_exact}`)
  console.log(`  Paires sans DDN des 2 côtés             : ${stats.pairs_no_ddn_both}`)
  console.log(`  Paires sous seuil 8 (below_threshold)   : ${stats.pairs_below_8}`)
  console.log(`  Paires uncertain EXISTANT (v1.9.31)     : ${stats.pairs_uncertain_existing}`)
  console.log(`  Paires match actuel (≥11 sans nouveau)  : ${stats.pairs_match_current}`)
  console.log(`  ─────────────────────────────────────────────────────────────`)
  console.log(`  🆕 Paires basculant match → uncertain (Option B) : ${stats.pairs_switching_to_uncertain}`)
  console.log(`  🛡️  Paires GARDE-FOU (email+tel = même personne)  : ${stats.pairs_kept_match_guardrail}`)

  if (samples.switching.length > 0) {
    console.log('\n━ Exemples paires basculant en uncertain (max 10) ━')
    for (const s of samples.switching) {
      console.log(`  [score ${s.score} ${s.tel}${s.email}${s.ville}]`)
      console.log(`    A: ${s.a}`)
      console.log(`    B: ${s.b}`)
    }
  }
  if (samples.guardrail.length > 0) {
    console.log('\n━ Exemples paires garde-fou (restent match) ━')
    for (const s of samples.guardrail) {
      console.log(`  [score ${s.score}] A: ${s.a}  ≡  B: ${s.b}`)
    }
  }

  // ── Estimation volume quotidien ────────────────────────────────────────
  // Heuristique : combien de candidats des 30 derniers jours auraient déclenché
  // un "match → uncertain" s'ils avaient été importés via OneDrive auto ?
  // Proxy : pour chaque candidat créé récemment, vérifier s'il existe un homonyme
  // en DB (excluding self) avec score ≥ 11 sans DDN des 2 côtés.
  console.log('\n' + '━'.repeat(75))
  console.log('Estimation volume quotidien pending_validation Option B (proxy 30j)')
  console.log('━'.repeat(75))

  const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  const recent = all.filter(c => c.created_at && c.created_at > cutoff)
  console.log(`  Candidats créés dans les 30 derniers jours : ${recent.length}`)

  let triggerCount = 0
  for (const c of recent) {
    const tokens = tokensOfIdentity(c.nom, c.prenom)
    if (tokens.length === 0) continue
    const key = tokens.join('|')
    const group = groups.get(key) || []
    for (const other of group) {
      if (other.id === c.id) continue
      const r = scorePair(c, other)
      if (!r) continue
      const d = optionBDecision(r)
      if (d.kind === 'uncertain_new') { triggerCount++; break }
    }
  }
  console.log(`  Candidats récents qui auraient déclenché Option B : ${triggerCount}`)
  const perDay = (triggerCount / 30).toFixed(2)
  console.log(`  → Volume estimé : ${perDay} pending_validation / jour`)
  if (triggerCount / 30 < 5) console.log('  ✅ < 5/jour — déploiement OK')
  else if (triggerCount / 30 < 20) console.log('  ⚠️ 5-20/jour — acceptable, à monitorer')
  else console.log('  ❌ > 20/jour — volume trop élevé, affiner la règle')

  // ── Tests synthétiques — vérifier que l'algo attrape les cas attendus ──
  console.log('\n' + '━'.repeat(75))
  console.log('Tests synthétiques — cas attendus')
  console.log('━'.repeat(75))

  const cases = [
    {
      label: 'Romain Goetz Genève vs St-Julien (tel identique, pas de DDN)',
      a: { nom: 'Goetz', prenom: 'Romain', email: 'r2020_goetz@hotmail.fr', telephone: '+41 78 234 56 78', date_naissance: null, localisation: 'Genève, Suisse' },
      b: { nom: 'Goetz', prenom: 'Romain', email: 'r_goetz@orange.fr', telephone: '+41 78 234 56 78', date_naissance: null, localisation: 'Saint-Julien-en-Genevois, France' },
      expected: 'uncertain_new',
    },
    {
      label: 'Vrai update (même email + même tel + même nom + pas de DDN)',
      a: { nom: 'Martin', prenom: 'Jean', email: 'jean.martin@x.ch', telephone: '+41 79 111 22 33', date_naissance: null, localisation: 'Sion' },
      b: { nom: 'Martin', prenom: 'Jean', email: 'jean.martin@x.ch', telephone: '+41 79 111 22 33', date_naissance: null, localisation: 'Sion' },
      expected: 'match_guardrail',
    },
    {
      label: '2 homonymes avec DDN différentes (doit rester déjà rejeté)',
      a: { nom: 'Costa', prenom: 'Daniel', email: 'a@x.ch', telephone: '+41 79 111 11 11', date_naissance: '01/01/1990', localisation: 'Sion' },
      b: { nom: 'Costa', prenom: 'Daniel', email: 'b@x.ch', telephone: '+41 79 222 22 22', date_naissance: '15/06/1985', localisation: 'Sion' },
      expected: null, // early reject DDN contradictoire
    },
    {
      label: 'Update avec DDN identique renseignée (doit rester match)',
      a: { nom: 'Silva', prenom: 'Pedro', email: 'a@x.ch', telephone: '+41 79 111 11 11', date_naissance: '10/03/1985', localisation: 'Sion' },
      b: { nom: 'Silva', prenom: 'Pedro', email: 'b@x.ch', telephone: '+41 79 222 22 22', date_naissance: '10/03/1985', localisation: 'Monthey' },
      expected: 'match',
    },
    {
      label: '1 DDN renseignée, 1 pas — comportement actuel conservé',
      a: { nom: 'Mendes', prenom: 'Ana', email: 'a@x.ch', telephone: '+41 79 333 33 33', date_naissance: '05/07/1992', localisation: 'Sion' },
      b: { nom: 'Mendes', prenom: 'Ana', email: 'b@x.ch', telephone: '+41 79 333 33 33', date_naissance: null, localisation: 'Sion' },
      expected: 'match', // une DDN présente = pas Option B
    },
  ]
  for (const t of cases) {
    const r = scorePair(t.a, t.b)
    const d = r ? optionBDecision(r) : { kind: null, why: 'DDN contradictoire early reject' }
    const ok = d.kind === t.expected
    console.log(`\n  ${ok ? '✅' : '❌'} ${t.label}`)
    console.log(`     attendu: ${t.expected || 'null (reject)'}  |  obtenu: ${d.kind || 'null'} — ${d.why}`)
    if (r) console.log(`     score=${r.score}, strictExact=${r.strictExact}, ddnA=${r.ddnA}, ddnB=${r.ddnB}, tel=${r.telMatch}, email=${r.emailMatch}, ville=${r.villeMatch}`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
