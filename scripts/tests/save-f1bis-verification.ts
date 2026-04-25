// Sauvegarde 6 cas F1bis (3 banc 22 + 3 témoin 100) pour validation visuelle João.
// Re-lance le moteur sur chaque fichier, capture le buffer photo, le sauve à côté du PDF source.
//
// Usage : npx tsx --env-file=.env.local scripts/tests/save-f1bis-verification.ts
// Génère : ~/Desktop/talentflow-test-fixtures/f1bis-verification/

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { extractPhotoFromPDF } from '../../lib/cv-photo'

const OUT_DIR = path.join(os.homedir(), 'Desktop/talentflow-test-fixtures/f1bis-verification')
const BANC_DIR = path.join(os.homedir(), 'Desktop/talentflow-test-fixtures/photos-fail')
const TEMOIN_DIR = path.join(os.homedir(), 'Desktop/talentflow-test-fixtures/photos-ok')

interface Pick {
  outIdx: number
  category: 'banc' | 'temoin'
  hint: string  // catégorisation visuelle attendue
  srcDir: string
  filename: string
  candidatName: string
}

const PICKS: Pick[] = [
  // Banc 22 — 3 cas représentatifs
  { outIdx: 1, category: 'banc',   hint: 'photo-circulaire',   srcDir: BANC_DIR,   filename: '007-diana-rodrigues-antunes.pdf',     candidatName: 'Diana Antunes' },
  { outIdx: 2, category: 'banc',   hint: 'header-design',      srcDir: BANC_DIR,   filename: '022-catarina-almeida.pdf',            candidatName: 'Catarina Almeida' },
  { outIdx: 3, category: 'banc',   hint: 'photo-NB-suspectee', srcDir: BANC_DIR,   filename: '006-mariana-marques-conceicao.pdf',   candidatName: 'Mariana Marques' },
  // Témoin 100 — 3 cas au hasard parmi les +18 nouveaux F1bis
  { outIdx: 4, category: 'temoin', hint: 'temoin-aleatoire',   srcDir: TEMOIN_DIR, filename: '015-david-frey.pdf',                  candidatName: 'David Frey' },
  { outIdx: 5, category: 'temoin', hint: 'temoin-aleatoire',   srcDir: TEMOIN_DIR, filename: '065-joao-filipe-da-silva-correia.pdf', candidatName: 'João Filipe Da Silva Correia' },
  { outIdx: 6, category: 'temoin', hint: 'temoin-aleatoire',   srcDir: TEMOIN_DIR, filename: '080-mihaela-avadani.pdf',             candidatName: 'Mihaela Avadani' },
]

function slug(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 30)
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  console.log(`📁 ${OUT_DIR}\n`)

  const results: Array<{ outIdx: number; category: string; hint: string; candidatName: string; sourceFilename: string; extractedFilename: string | null; bytes: number; duration_ms: number; error: string | null }> = []

  for (const p of PICKS) {
    const srcPath = path.join(p.srcDir, p.filename)
    if (!fs.existsSync(srcPath)) {
      console.error(`❌ [${String(p.outIdx).padStart(2, '0')}] Manquant : ${srcPath}`)
      continue
    }
    const buf = fs.readFileSync(srcPath)

    // Silence le moteur
    const origLog = console.log
    const origWarn = console.warn
    console.log = () => {}
    console.warn = () => {}

    let result: Buffer | null = null
    let error: string | null = null
    const t0 = Date.now()
    try {
      result = await extractPhotoFromPDF(buf)
    } catch (e: any) {
      error = e?.message || String(e)
    } finally {
      console.log = origLog
      console.warn = origWarn
    }
    const duration = Date.now() - t0

    const baseName = `${String(p.outIdx).padStart(2, '0')}-${p.category}-${slug(p.candidatName)}-${p.hint}`
    const sourceOut = path.join(OUT_DIR, `${baseName}--SOURCE.pdf`)
    fs.copyFileSync(srcPath, sourceOut)

    let extractedFilename: string | null = null
    if (result) {
      const extractedOut = path.join(OUT_DIR, `${baseName}--EXTRAITE.jpg`)
      fs.writeFileSync(extractedOut, result)
      extractedFilename = path.basename(extractedOut)
      console.log(`✅ [${String(p.outIdx).padStart(2, '0')}] ${p.candidatName.padEnd(35)} → ${result.length}B (${duration}ms)`)
    } else {
      console.log(`❌ [${String(p.outIdx).padStart(2, '0')}] ${p.candidatName.padEnd(35)} → NULL ${error ? `err=${error}` : ''}`)
    }

    results.push({
      outIdx: p.outIdx,
      category: p.category,
      hint: p.hint,
      candidatName: p.candidatName,
      sourceFilename: path.basename(sourceOut),
      extractedFilename,
      bytes: result?.length || 0,
      duration_ms: duration,
      error,
    })
  }

  const indexPath = path.join(OUT_DIR, 'index.json')
  fs.writeFileSync(indexPath, JSON.stringify({ when: new Date().toISOString(), results }, null, 2))
  console.log(`\n📋 Index : ${indexPath}`)
  console.log(`📁 6 paires (PDF source + photo extraite) à valider visuellement.`)
}

main().catch(e => { console.error('💥', e); process.exit(1) })
