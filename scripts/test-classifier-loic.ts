// Test E2E classifier sur le vrai fichier "Loïc Arluna cv.docx"
// Usage : npx tsx --env-file=.env.local scripts/test-classifier-loic.ts

import fs from 'node:fs'
import mammoth from 'mammoth'
import { analyserCV } from '../lib/claude'
import { classifyDocument } from '../lib/document-classification'

const FILE_PATH = '/Users/joaobarbosa/Desktop/BUG TALENTFLOW/Loïc Arluna cv.docx'

async function main() {
  console.log('━'.repeat(80))
  console.log('TEST E2E — classifier sur "Loïc Arluna cv.docx" (fichier réel prod)')
  console.log('━'.repeat(80))

  const buffer = fs.readFileSync(FILE_PATH)
  console.log(`\n📄 Fichier : ${FILE_PATH.split('/').pop()} (${buffer.length} bytes)`)
  const { value: texteCV } = await mammoth.extractRawText({ buffer })
  console.log(`📝 Texte extrait : ${texteCV.length} chars`)

  const lower = texteCV.toLowerCase().slice(0, 2000).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const patterns = [
    { name: 'contrat de travail', found: /contrat de travail/.test(lower) },
    { name: 'permis de travail', found: /permis de travail/.test(lower) },
    { name: 'permis de sejour', found: /permis de sejour/.test(lower) },
    { name: 'lettre de motivation', found: /lettre de motivation/.test(lower) },
  ]
  const matched = patterns.filter(p => p.found)
  if (matched.length > 0) {
    console.log(`\n⚠️ Patterns non-CV détectés : ${matched.map(p => p.name).join(', ')}`)
    console.log('   (OLD classifier aurait rejeté ce CV)')
  }

  console.log('\n🤖 Appel Claude analyserCV...')
  const analyse = await analyserCV(texteCV)
  console.log('   nom:', analyse.nom)
  console.log('   prenom:', analyse.prenom)
  console.log('   email:', analyse.email)
  console.log('   titre_poste:', analyse.titre_poste)
  console.log('   document_type IA:', analyse.document_type)
  console.log('   experiences:', analyse.experiences?.length || 0)
  console.log('   competences:', analyse.competences?.length || 0)
  console.log('   formations_details:', analyse.formations_details?.length || 0)

  const result = classifyDocument({ analyse, texteCV })
  console.log('\n🎯 Classification NEW :')
  console.log('   docType:', result.docType)
  console.log('   isNotCV:', result.isNotCV)
  console.log('   reason:', result.reason)

  console.log('\n' + '━'.repeat(80))
  const ok = result.docType === 'cv' && result.isNotCV === false
  console.log(ok ? '✅ SUCCESS — bug Loïc Arluna fixé' : `❌ FAIL — docType=${result.docType}`)
  console.log('━'.repeat(80))
  process.exit(ok ? 0 : 1)
}

main().catch(err => { console.error('\n❌ ERROR:', err.message); process.exit(1) })
