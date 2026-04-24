// Test E2E v1.9.102 — validation fix classifier + warning name_ambiguity
// Usage : set -a; source .env.local; set +a; npx tsx scripts/test-v19102-e2e.ts

import fs from 'node:fs'
import path from 'node:path'
import mammoth from 'mammoth'
import { extractTextFromCV } from '../../lib/cv-parser'
import { analyserCV, analyserCVDepuisPDF, analyserCVDepuisImage } from '../../lib/claude'
import { classifyDocument } from '../../lib/document-classification'
import { detectNameAmbiguity } from '../../lib/cv-extraction-validator'

const TESTS = [
  { file: 'Loïc Arluna cv.docx',                             folder: 'BUG TALENTFLOW',   expected: { cv: true,  reason: 'cv_markers' } },
  { file: '67oEClkJfvU3-Certificat-Manor.pdf',               folder: 'talentflow-test-fixtures', expected: { cv: false, reason: 'ia' } },
  { file: 'Ouvrière d\'usine à 100%.docx',                    folder: 'talentflow-test-fixtures', expected: { cv: false, reason: 'ia' } },
  { file: 'Scanné 6 janv. 2026 à 114000.pdf',                folder: 'talentflow-test-fixtures', expected: { cv: false, reason: 'ia' } },
  { file: '_CV Mr ZAHMOUL Chaouwki  France (3).pdf',         folder: 'talentflow-test-fixtures', expected: { cv: true,  warning: 'name_ambiguity' } },
]

async function runOne(filename: string, folder: string) {
  const full = `/Users/joaobarbosa/Desktop/${folder}/${filename}`
  const buffer = fs.readFileSync(full)
  const ext = path.extname(filename).toLowerCase().replace('.', '')

  let texteCV = ''
  let analyse: any = null

  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    analyse = await analyserCVDepuisImage(buffer, `image/${ext === 'jpg' ? 'jpeg' : ext}` as any)
  } else if (ext === 'pdf') {
    texteCV = await extractTextFromCV(buffer, filename).catch(() => '')
    if (texteCV.trim().length >= 30) {
      analyse = await analyserCV(texteCV)
    } else {
      analyse = await analyserCVDepuisPDF(buffer)
    }
  } else if (ext === 'docx') {
    const { value } = await mammoth.extractRawText({ buffer })
    texteCV = value
    analyse = await analyserCV(texteCV)
  } else {
    throw new Error(`format ${ext} non géré dans ce test`)
  }

  const classif = classifyDocument({ analyse, texteCV })
  // Pour Zahmoul : le warning est déjà injecté dans `_extraction_warnings` par analyserCV
  // si texteCV a été passé. On recheck ici en direct pour display.
  const nameAmb = detectNameAmbiguity(texteCV || '')
  const injected = (analyse as any)?._extraction_warnings || []
  const hasAmb = injected.some((w: any) => /ambig/i.test(w.message || '')) || !!nameAmb

  return {
    filename, ext, texteCVLen: texteCV.length,
    iaDocType: analyse?.document_type,
    iaName: `${analyse?.prenom || ''} ${analyse?.nom || ''}`.trim(),
    iaExp: (analyse?.experiences || []).length,
    iaComp: (analyse?.competences || []).length,
    classif, nameAmbiguityWarning: hasAmb, injectedWarnings: injected,
  }
}

async function main() {
  console.log('━'.repeat(80))
  console.log('TEST E2E v1.9.102 — 5 fichiers réels (pipeline complet mammoth+pdfjs+Claude)')
  console.log('━'.repeat(80))

  for (const t of TESTS) {
    console.log(`\n▸ ${t.file}`)
    try {
      const r = await runOne(t.file, t.folder)
      console.log(`  IA document_type : ${r.iaDocType}`)
      console.log(`  IA extraction    : ${r.iaName}  (${r.iaExp} exp, ${r.iaComp} comp)`)
      console.log(`  texteCV extrait  : ${r.texteCVLen} chars`)
      console.log(`  classifier       : ${r.classif.isNotCV ? 'NON-CV' : 'CV'} [${r.classif.docType}/${r.classif.reason}]`)
      console.log(`  name_ambiguity   : ${r.nameAmbiguityWarning ? '✅ DÉTECTÉ' : '— non'}`)

      // Vérif attendu
      const expCv = t.expected.cv
      const actualCv = !r.classif.isNotCV
      const classifOk = actualCv === expCv && (!t.expected.reason || r.classif.reason === t.expected.reason)
      const warnOk = !t.expected.warning || r.nameAmbiguityWarning
      if (classifOk && warnOk) {
        console.log(`  VERDICT          : ✅ PASS`)
      } else {
        console.log(`  VERDICT          : ❌ FAIL — attendu ${expCv ? 'CV' : 'NON-CV'} ${t.expected.reason || ''}${t.expected.warning ? ` + warning=${t.expected.warning}` : ''}`)
      }
    } catch (e: any) {
      console.log(`  ❌ ERREUR : ${e.message}`)
    }
  }
  console.log('\n' + '━'.repeat(80))
}

main().catch(e => { console.error(e); process.exit(1) })
