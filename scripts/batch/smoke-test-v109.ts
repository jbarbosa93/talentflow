/**
 * Smoke test post-déploiement v1.9.109.
 * Vérifie que normalizeLocalisation (utilisée par cv/parse + onedrive/sync) reconnaît
 * les nouveaux overrides et substitutions saint↔st.
 *
 * Usage : npx tsx scripts/batch/smoke-test-v109.ts
 */

import { normalizeLocalisation } from '../../lib/normalize-localisation'

const CASES: [string, string, string][] = [
  // [input, expected, comment]
  ['Monthey, Suisse', '1870 Monthey, Suisse', 'baseline v1.9.108'],
  ['Évian, France', '74500 Évian-les-Bains, France', 'baseline (Évian-les-Bains via Évian seul)'],
  ['Sion', '1950 Sion, Suisse', 'ville seule v1.9.108'],
  ['1870 Monthey, Suisse', '1870 Monthey, Suisse', 'idempotence'],

  // v1.9.109 — substitution saint↔st (lookupCP)
  ['Châtel-Saint-Denis, Suisse', '1618 Châtel-St-Denis, Suisse', 'saint→st partout'],
  ['Conflans-Sainte-Honorine, France', '78700 Conflans-Sainte-Honorine, France', 'sainte direct'],
  ['Villaz-Saint-Pierre, Suisse', '1690 Villaz-St-Pierre, Suisse', 'saint→st partout'],

  // v1.9.109 — overrides hameaux (cp_overrides.json)
  ['Aproz, Suisse', '1994 Aproz, Suisse', 'override Aproz'],
  ['Saxonne, Suisse', '1966 Saxonne, Suisse', 'override hameau Ayent'],
  ['Le Rosex, Suisse', '1864 Ormont-Dessus, Suisse', 'override hameau Ormont'],
  ['Mayens de la Zour', '1965 Savièse, Suisse', 'override hameau + ville seule'],
  ['Bourg-en-Lavaux, Suisse', '1071 Bourg-en-Lavaux, Suisse', 'override fusion communes'],
  ['Cergy-Pontoise, France', '95000 Cergy, France', 'override agglomération FR'],
]

let ok = 0
let fail = 0
const failures: string[] = []

for (const [input, expected, comment] of CASES) {
  const out = normalizeLocalisation(input)
  const pass = out === expected
  if (pass) {
    console.log(`✅ ${comment.padEnd(35)} | "${input}"`)
    ok++
  } else {
    console.log(`❌ ${comment.padEnd(35)} | "${input}"`)
    console.log(`   → "${out}"`)
    console.log(`   attendu : "${expected}"`)
    fail++
    failures.push(`${comment}: "${input}" → "${out}" (attendu "${expected}")`)
  }
}

console.log(`\n━━━━━━━━━━━━━━━━━━━━`)
console.log(`${ok}/${CASES.length} ✅ ${fail > 0 ? `, ${fail} ❌` : ''}`)
if (fail > 0) {
  console.log('\nÉCHECS :')
  failures.forEach(f => console.log(`  ${f}`))
  process.exit(1)
}
