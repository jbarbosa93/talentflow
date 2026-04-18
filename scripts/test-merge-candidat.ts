#!/usr/bin/env node
// Tests unitaires pour lib/merge-candidat.ts
// Vérifie les 5 scénarios critiques : immuables, merge, écrasement, ignoré, real-world

import { mergeCandidat, mergeReportToText } from '../lib/merge-candidat.ts'

let pass = 0, fail = 0
const run = (label, fn) => {
  try {
    fn()
    console.log(`  ✅ ${label}`)
    pass++
  } catch (e) {
    console.log(`  ❌ ${label}`)
    console.log(`     ${e.message}`)
    fail++
  }
}

const assertEq = (actual, expected, field) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a !== e) throw new Error(`${field} : attendu ${e}, reçu ${a}`)
}

console.log('═'.repeat(70))
console.log('[TEST] Scenario 1 — Champs immuables (email/tel/DDN)')
console.log('═'.repeat(70))

run('DB a email → pas d\'écrasement', () => {
  const existing = { email: 'old@test.com' }
  const analyse = { email: 'new@test.com' }
  const { payload, report } = mergeCandidat(existing, analyse)
  assertEq(payload.email, undefined, 'email') // pas dans payload = pas de modif
  assertEq(report.kept, ['email'], 'report.kept')
})

run('DB email vide → remplit depuis CV', () => {
  const existing = { email: null }
  const analyse = { email: 'new@test.com' }
  const { payload, report } = mergeCandidat(existing, analyse)
  assertEq(payload.email, 'new@test.com', 'email')
  assertEq(report.filledEmpty, ['email'], 'report.filledEmpty')
})

run('Telephone immuable', () => {
  const existing = { telephone: '+41 79 123 45 67' }
  const analyse = { telephone: '+41 79 999 99 99' }
  const { payload, report } = mergeCandidat(existing, analyse)
  assertEq(payload.telephone, undefined, 'telephone')
  assertEq(report.kept, ['telephone'], 'report.kept')
})

run('DDN et localisation immuables', () => {
  const existing = { date_naissance: '01/01/1990', localisation: 'Martigny' }
  const analyse = { date_naissance: '02/02/1991', localisation: 'Lausanne' }
  const { payload, report } = mergeCandidat(existing, analyse)
  assertEq(payload.date_naissance, undefined, 'date_naissance')
  assertEq(payload.localisation, undefined, 'localisation')
  if (!report.kept.includes('date_naissance')) throw new Error('DDN manquant kept')
  if (!report.kept.includes('localisation')) throw new Error('ville manquant kept')
})

console.log('\n' + '═'.repeat(70))
console.log('[TEST] Scenario 2 — Merge listes (competences, langues, experiences)')
console.log('═'.repeat(70))

run('Merge competences union avec dédup', () => {
  const existing = { competences: ['JavaScript', 'React'] }
  const analyse = { competences: ['React', 'TypeScript', 'Vue.js'] }
  const { payload, report } = mergeCandidat(existing, analyse)
  // Attendu : JavaScript + React + TypeScript + Vue.js (4, triés)
  if (!payload.competences || payload.competences.length !== 4) {
    throw new Error(`competences length: ${payload.competences?.length}`)
  }
  if (!payload.competences.includes('React')) throw new Error('React manquant')
  if (payload.competences.filter(c => c.toLowerCase() === 'react').length > 1) {
    throw new Error('React dupliqué')
  }
  assertEq(report.addedItems.competences, 2, 'addedItems.competences')
})

run('Merge langues avec dédup accent', () => {
  const existing = { langues: ['Français', 'Anglais'] }
  const analyse = { langues: ['francais', 'Allemand'] }  // sans accent
  const { payload } = mergeCandidat(existing, analyse)
  // Attendu : pas de dup Français/francais → 3 langues uniques
  if (!payload.langues || payload.langues.length !== 3) {
    throw new Error(`langues length: ${payload.langues?.length}`)
  }
})

run('Merge experiences par tuple entreprise+poste+periode', () => {
  const existing = {
    experiences: [
      { poste: 'Dev', entreprise: 'Acme', periode: '2020-2022', description: 'old' },
    ],
  }
  const analyse = {
    experiences: [
      { poste: 'Dev', entreprise: 'Acme', periode: '2020-2022', description: 'new' }, // dup
      { poste: 'Senior Dev', entreprise: 'BigCorp', periode: '2022-2024', description: 'new job' },
    ],
  }
  const { payload } = mergeCandidat(existing, analyse)
  if (!payload.experiences || payload.experiences.length !== 2) {
    throw new Error(`experiences length: ${payload.experiences?.length}`)
  }
  // L'existant (description 'old') doit être préservé (ajouté en premier)
  if (payload.experiences[0].description !== 'old') {
    throw new Error('Ordre experiences incorrect (existant doit être premier)')
  }
})

run('Merge formations_details par tuple', () => {
  const existing = {
    formations_details: [
      { diplome: 'Master', etablissement: 'EPFL', annee: '2020' },
    ],
  }
  const analyse = {
    formations_details: [
      { diplome: 'Master', etablissement: 'epfl', annee: '2020' }, // dup insensible casse
      { diplome: 'CFC', etablissement: 'École pro', annee: '2015' },
    ],
  }
  const { payload } = mergeCandidat(existing, analyse)
  if (!payload.formations_details || payload.formations_details.length !== 2) {
    throw new Error(`formations length: ${payload.formations_details?.length}`)
  }
})

console.log('\n' + '═'.repeat(70))
console.log('[TEST] Scenario 3 — Champs écrasés (titre_poste, resume_ia, annees_exp)')
console.log('═'.repeat(70))

run('titre_poste écrasé si nouvelle valeur', () => {
  const existing = { titre_poste: 'Dev Junior' }
  const analyse = { titre_poste: 'Senior Developer' }
  const { payload, report } = mergeCandidat(existing, analyse)
  assertEq(payload.titre_poste, 'Senior Developer', 'titre_poste')
  if (!report.replaced.includes('titre_poste')) throw new Error('titre_poste manquant replaced')
})

run('titre_poste inchangé si CV vide', () => {
  const existing = { titre_poste: 'Dev Junior' }
  const analyse = { titre_poste: '' }
  const { payload } = mergeCandidat(existing, analyse)
  assertEq(payload.titre_poste, undefined, 'titre_poste')
})

run('resume_ia re-généré même si identique (regen voulue)', () => {
  const existing = { resume_ia: 'Ancien résumé' }
  const analyse = { resume: 'Nouveau résumé plus riche' }
  const { payload } = mergeCandidat(existing, analyse)
  assertEq(payload.resume_ia, 'Nouveau résumé plus riche', 'resume_ia')
})

run('annees_exp écrasé si valeur supérieure', () => {
  const existing = { annees_exp: 3 }
  const analyse = { annees_exp: 5 }
  const { payload } = mergeCandidat(existing, analyse)
  assertEq(payload.annees_exp, 5, 'annees_exp')
})

console.log('\n' + '═'.repeat(70))
console.log('[TEST] Scenario 4 — Real-world : candidat enrichi avec nouveau CV')
console.log('═'.repeat(70))

run('Scénario complet Daniel Fragoso Costa', () => {
  const existing = {
    email: 'daniel@old.com',        // immuable — préservé
    telephone: '+41 79 111 11 11',  // immuable — préservé
    date_naissance: '01/01/1990',   // immuable — préservé
    localisation: null,              // vide → remplir
    titre_poste: 'Ouvrier',
    competences: ['Manutention', 'Conduite chariot élévateur'],
    langues: ['Français'],
    experiences: [
      { poste: 'Magasinier', entreprise: 'Besson SA', periode: '2018-2020', description: '' },
    ],
    annees_exp: 3,
  }
  const analyse = {
    email: 'daniel@new.com',         // ignoré
    telephone: '+41 79 999 99 99',   // ignoré
    date_naissance: '02/02/1991',    // ignoré
    localisation: 'Martigny, Suisse', // remplit (était null)
    titre_poste: 'Magasinier senior', // écrase
    competences: ['Manutention', 'Inventaire', 'Préparation commandes'], // merge (+2)
    langues: ['Français', 'Portugais'], // merge (+1)
    experiences: [
      { poste: 'Magasinier', entreprise: 'Besson SA', periode: '2018-2020', description: '' }, // dup
      { poste: 'Magasinier chef', entreprise: 'Favre Transport', periode: '2020-2024', description: 'Nouveau' }, // nouveau
    ],
    annees_exp: 6,  // écrase
    resume: 'Nouveau résumé',
  }
  const { payload, report } = mergeCandidat(existing, analyse)

  // Vérifications
  assertEq(payload.email, undefined, 'email devrait être ignoré')
  assertEq(payload.telephone, undefined, 'tel devrait être ignoré')
  assertEq(payload.date_naissance, undefined, 'DDN devrait être ignoré')
  assertEq(payload.localisation, 'Martigny, Suisse', 'ville remplie')
  assertEq(payload.titre_poste, 'Magasinier senior', 'titre écrasé')
  assertEq(payload.annees_exp, 6, 'annees_exp écrasé')

  if (!payload.competences || payload.competences.length !== 4) {
    throw new Error(`competences devraient être 4, reçu ${payload.competences?.length}`)
  }
  if (!payload.experiences || payload.experiences.length !== 2) {
    throw new Error(`experiences devraient être 2, reçu ${payload.experiences?.length}`)
  }
  if (report.kept.length !== 3) {
    throw new Error(`kept devrait contenir email/tel/DDN (3), reçu ${report.kept}`)
  }

  console.log(`     Report : ${mergeReportToText(report)}`)
})

console.log('\n' + '═'.repeat(70))
console.log('[TEST] Scenario 5 — Edge cases')
console.log('═'.repeat(70))

run('Tout vide côté analyse = no-op', () => {
  const existing = { email: 'a@b.com', titre_poste: 'Dev' }
  const analyse = {}
  const { payload } = mergeCandidat(existing, analyse)
  // Aucun champ dans payload
  if (Object.keys(payload).length !== 0) {
    throw new Error(`payload devrait être vide, reçu ${JSON.stringify(payload)}`)
  }
})

run('Listes null → treat as empty', () => {
  const existing = { competences: null }
  const analyse = { competences: ['React', 'Vue'] }
  const { payload } = mergeCandidat(existing, analyse)
  assertEq(payload.competences, ['React', 'Vue'], 'competences')
})

run('Arrays vides côté analyse = no merge', () => {
  const existing = { competences: ['Python'] }
  const analyse = { competences: [] }
  const { payload } = mergeCandidat(existing, analyse)
  assertEq(payload.competences, undefined, 'competences')
})

console.log('\n' + '═'.repeat(70))
console.log(`[RESULTS] Tests passés : ${pass}/${pass + fail}`)
console.log('═'.repeat(70))
process.exit(fail === 0 ? 0 : 1)
