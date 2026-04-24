// Vérification finale via Vision IA (même pipeline que route /api/cv/parse quand texte natif vide)
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { analyserCVDepuisPDF } from '../../lib/claude'
import { classifyDocument } from '../../lib/document-classification'

const DIR = '/Users/joaobarbosa/Desktop/talentflow-test-fixtures/'
const FILES = [
  'test-od-nouveau-cv.pdf',
  'test-od-meme-cv.pdf',
  'test-od-update-v1.pdf',
  'test-od-update-v2.pdf',
  'test-od-certificat-existant.pdf',
  'test-od-certificat-inconnu.pdf',
]

async function main() {
  const hashes: Record<string, string> = {}
  for (const f of FILES) {
    const buf = fs.readFileSync(path.join(DIR, f))
    hashes[f] = createHash('sha256').update(buf).digest('hex')
  }

  console.log('━'.repeat(70))
  console.log('SHA256 par fichier')
  console.log('━'.repeat(70))
  for (const f of FILES) {
    console.log(`  ${f.padEnd(40)} ${hashes[f].slice(0, 16)}...`)
  }
  const sameSha = hashes['test-od-nouveau-cv.pdf'] === hashes['test-od-meme-cv.pdf']
  console.log(`\n  SHA256 O1/O2 identiques : ${sameSha ? '✅' : '❌'}`)

  // Vision IA sur les 6 fichiers en parallèle
  console.log('\n' + '━'.repeat(70))
  console.log('Vision IA — pipeline fallback (comme prod quand pdfjs retourne 0)')
  console.log('━'.repeat(70))
  const results = await Promise.all(FILES.map(async (f) => {
    const buf = fs.readFileSync(path.join(DIR, f))
    const a = await analyserCVDepuisPDF(buf)
    const cls = classifyDocument({ analyse: a, texteCV: '' })
    return { f, a, cls }
  }))
  for (const { f, a, cls } of results) {
    console.log(`\n📄 ${f}`)
    console.log(`   IA doc_type   : ${a.document_type}`)
    console.log(`   identité      : ${a.prenom || '—'} ${a.nom || '—'}`)
    console.log(`   email/tel     : ${a.email || '—'} | ${a.telephone || '—'}`)
    console.log(`   DDN           : ${a.date_naissance || '—'}`)
    console.log(`   titre         : ${a.titre_poste || '—'}`)
    console.log(`   exp/comp/form : ${(a.experiences || []).length}/${(a.competences || []).length}/${(a.formations_details || []).length}`)
    console.log(`   classifier    : ${cls.isNotCV ? 'NON-CV' : 'CV'} [${cls.docType}/${cls.reason}]`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
