#!/usr/bin/env node
// Tests unitaires pour lib/cv-extraction-validator.ts
// Vérifie que les cas connus sont bien détectés comme entreprise

import { createRequire } from 'module'
const require = createRequire(import.meta.url)

// Import via tsx compilation (on passe par l'API node)
process.env.TS_NODE = '1'
const { isCompanyLikeName, isFullNameCompanyLike, validateAnalyse } = await import('../lib/cv-extraction-validator.ts')

// ─── Cas entreprise (attendu : suspect = true) ───────────────────────────────
const COMPANY_CASES = [
  { nom: 'Metalcolor', prenom: 'SA', expected: true, label: 'Metalcolor SA' },
  { nom: 'Besson', prenom: 'SA', expected: true, label: 'Besson SA' },
  { nom: 'Quadrigis', prenom: 'Sàrl', expected: true, label: 'Quadrigis Sàrl' },
  { nom: 'TechCorp Ltd', prenom: '', expected: true, label: 'TechCorp Ltd' },
  { nom: 'Favre Transport', prenom: 'SA', expected: true, label: 'Favre Transport SA' },
  { nom: 'Solutions Consulting', prenom: 'Partners', expected: true, label: 'Solutions Consulting Partners' },
  { nom: 'Smith & Jones', prenom: '', expected: true, label: 'Smith & Jones (raison sociale)' },
  { nom: 'ABC Inc', prenom: '', expected: true, label: 'ABC Inc' },
]

// ─── Cas noms réels (attendu : suspect = false) ──────────────────────────────
const PERSON_CASES = [
  { nom: 'Fragoso Costa', prenom: 'Daniel', expected: false, label: 'Daniel Fragoso Costa' },
  { nom: 'Costa', prenom: 'Daniel', expected: false, label: 'Daniel Costa' },
  { nom: 'García López', prenom: 'María José', expected: false, label: 'María José García López' },
  { nom: 'Rodrigues', prenom: 'André', expected: false, label: 'André Rodrigues' },
  { nom: 'Mendes', prenom: 'Fábio', expected: false, label: 'Fábio Mendes' },
  { nom: 'Silva', prenom: 'Pedro Miguel', expected: false, label: 'Pedro Miguel Silva' },
  { nom: 'dos Santos', prenom: 'João', expected: false, label: 'João dos Santos' },
  { nom: 'Ferreira Da Costa', prenom: 'Daniel', expected: false, label: 'Daniel Ferreira Da Costa' },
]

console.log('═'.repeat(70))
console.log('[TEST] Détection noms d\'entreprise (attendu: suspect = true)')
console.log('═'.repeat(70))
let passCompany = 0
let failCompany = 0
for (const c of COMPANY_CASES) {
  const r = isFullNameCompanyLike(c.nom, c.prenom)
  const ok = r.suspect === c.expected
  console.log(`  ${ok ? '✅' : '❌'} ${c.label.padEnd(40)} suspect=${r.suspect} (${r.reason || 'none'})`)
  if (ok) passCompany++; else failCompany++
}

console.log('')
console.log('═'.repeat(70))
console.log('[TEST] Vraies personnes (attendu: suspect = false)')
console.log('═'.repeat(70))
let passPerson = 0
let failPerson = 0
for (const c of PERSON_CASES) {
  const r = isFullNameCompanyLike(c.nom, c.prenom)
  const ok = r.suspect === c.expected
  console.log(`  ${ok ? '✅' : '❌'} ${c.label.padEnd(40)} suspect=${r.suspect} (${r.reason || 'none'})`)
  if (ok) passPerson++; else failPerson++
}

console.log('')
console.log('═'.repeat(70))
console.log('[TEST] validateAnalyse — scenarios complets')
console.log('═'.repeat(70))

const SCENARIOS = [
  {
    label: 'Fragoso Costa OK',
    analyse: { nom: 'Fragoso Costa', prenom: 'Daniel', email: 'daniel@test.com', telephone: '+41 79 123 45 67', date_naissance: '01/01/1990' },
    expectedErrors: 0,
  },
  {
    label: 'Metalcolor SA suspect',
    analyse: { nom: 'Metalcolor', prenom: 'SA' },
    expectedErrors: 1,
  },
  {
    label: 'Email malformé',
    analyse: { nom: 'Test', prenom: 'User', email: 'not-an-email' },
    expectedErrors: 0,  // warning, pas error
  },
  {
    label: 'Tel trop court',
    analyse: { nom: 'Test', prenom: 'User', telephone: '12345' },
    expectedErrors: 0,
  },
  {
    label: 'DDN format bizarre',
    analyse: { nom: 'Test', prenom: 'User', date_naissance: 'Xans' },
    expectedErrors: 0,
  },
]

let passScenario = 0
let failScenario = 0
for (const s of SCENARIOS) {
  const warnings = validateAnalyse(s.analyse)
  const errors = warnings.filter(w => w.severity === 'error').length
  const ok = errors === s.expectedErrors
  console.log(`  ${ok ? '✅' : '❌'} ${s.label.padEnd(40)} errors=${errors} (attendu ${s.expectedErrors})`)
  if (warnings.length > 0) {
    for (const w of warnings) console.log(`       [${w.severity}] ${w.field}: ${w.message}`)
  }
  if (ok) passScenario++; else failScenario++
}

console.log('')
console.log('═'.repeat(70))
console.log('[RESULTS]')
console.log('═'.repeat(70))
console.log(`Entreprises détectées : ${passCompany}/${COMPANY_CASES.length}`)
console.log(`Personnes préservées : ${passPerson}/${PERSON_CASES.length}`)
console.log(`Scénarios validateAnalyse : ${passScenario}/${SCENARIOS.length}`)

const total = passCompany + passPerson + passScenario
const totalExpected = COMPANY_CASES.length + PERSON_CASES.length + SCENARIOS.length
const exitCode = total === totalExpected ? 0 : 1
console.log(`\nTotal : ${total}/${totalExpected}`)
process.exit(exitCode)
