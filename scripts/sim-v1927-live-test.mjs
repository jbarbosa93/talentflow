#!/usr/bin/env node
// Test LIVE — est-ce que findExistingCandidat match fiche A (Costa Daniel Martigny)
// avec input CV Fragoso (tokens [costa,daniel] tronqués par l'IA) ?

import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Import de lib/candidat-matching.ts (compilé via tsx)
const { findExistingCandidat } = await import('../lib/candidat-matching.ts').catch(() => {
  console.log('[HINT] utiliser : npx tsx scripts/sim-v1927-live-test.mjs')
  process.exit(1)
})

// Scénario A : IA tronque et donne nom="Costa" prenom="Daniel" (les 2 CVs donnent la même chose)
console.log('\n─── Scenario A : IA tronque nom="Costa" prenom="Daniel" ───')
const inputA = {
  nom: 'Costa', prenom: 'Daniel',
  email: 'danielfragoso173@gmail.com',
  telephone: '+41 79 673 74 64',
  date_naissance: null,
  localisation: 'Montpréveyres, Suisse',
}
const resA = await findExistingCandidat(supabase, inputA, { selectColumns: 'id, nom, prenom, email, telephone, date_naissance, localisation' })
console.log('Result:', resA.kind, resA.reason || '', resA.kind === 'match' ? `→ candidate ${resA.candidat.id} (${resA.candidat.prenom} ${resA.candidat.nom} / ${resA.candidat.email})` : '')
if (resA.kind === 'match') console.log('Score breakdown:', resA.scoreBreakdown)

// Scénario B : IA extrait nom complet "Fragoso Costa" prenom="Daniel" (3 tokens)
console.log('\n─── Scenario B : IA extrait nom="Fragoso Costa" prenom="Daniel" ───')
const inputB = {
  nom: 'Fragoso Costa', prenom: 'Daniel',
  email: 'danielfragoso173@gmail.com',
  telephone: '+41 79 673 74 64',
  date_naissance: null,
  localisation: 'Montpréveyres, Suisse',
}
const resB = await findExistingCandidat(supabase, inputB, { selectColumns: 'id, nom, prenom, email, telephone, date_naissance, localisation' })
console.log('Result:', resB.kind, resB.reason || '', resB.kind === 'match' ? `→ candidate ${resB.candidat.id} (${resB.candidat.prenom} ${resB.candidat.nom} / ${resB.candidat.email})` : '')
if (resB.kind === 'match') console.log('Score breakdown:', resB.scoreBreakdown)

// Scénario C : IA donne nom="Daniel Fragoso Costa" prenom="" (tout dans nom)
console.log('\n─── Scenario C : IA donne nom="Daniel Fragoso Costa" prenom="" ───')
const inputC = {
  nom: 'Daniel Fragoso Costa', prenom: '',
  email: 'danielfragoso173@gmail.com',
  telephone: '+41 79 673 74 64',
  date_naissance: null,
  localisation: 'Montpréveyres, Suisse',
}
const resC = await findExistingCandidat(supabase, inputC, { selectColumns: 'id, nom, prenom, email, telephone, date_naissance, localisation' })
console.log('Result:', resC.kind, resC.reason || '')
