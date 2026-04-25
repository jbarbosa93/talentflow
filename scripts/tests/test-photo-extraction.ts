// Banc de test extraction photos — 22 fixtures connues comme échouant.
// Lance le moteur ACTUEL (lib/cv-photo.ts) sans modification, capture score + raison via console.log.
//
// Usage : npx tsx --env-file=.env.local scripts/tests/test-photo-extraction.ts
// Génère : ~/Desktop/talentflow-test-fixtures/photos-fail/baseline-report.json

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  extractPhotoFromPDF,
  extractPhotoFromDOC,
  extractPhotoFromDOCX,
  extractPhotoFromImage,
} from '../../lib/cv-photo'

const FIXTURES_DIR = path.join(os.homedir(), 'Desktop/talentflow-test-fixtures/photos-fail')
const REPORT_PATH = path.join(FIXTURES_DIR, 'baseline-report.json')

interface ManifestEntry {
  idx: number
  filename: string
  size: number
  candidat_id: string
  name: string
}

interface CandidateInfo {
  source: string
  width: number
  height: number
  ratio: number
  compressed: number
  colors: number
  skin: number
  score: number
}

interface RunResult {
  idx: number
  filename: string
  name: string
  ext: string
  size_bytes: number
  extracted: boolean
  photo_size_bytes: number
  candidates_count: number
  candidates: CandidateInfo[]
  selected: { source: string; score: number } | null
  best_score: number | null
  threshold: number | null
  vision_validations: { source: string; answer: string }[]
  failed_strategies: string[]
  f5_logs: string[]
  error: string | null
  duration_ms: number
}

// Parsers — alignés avec les console.log dans lib/cv-photo.ts
function parseCandidate(line: string): CandidateInfo | null {
  // Format : [CV Photo] Candidate: <source> <w>x<h> ratio=<r> compressed=<c>B colors=<col> skin=<s>% score=<sc>
  const m = line.match(/Candidate:\s+(\S+)\s+(\d+)x(\d+)\s+ratio=([\d.]+)\s+compressed=(\d+)B\s+colors=(\d+)\s+skin=(\d+)%\s+score=(-?\d+)/)
  if (!m) return null
  return {
    source: m[1],
    width: Number(m[2]),
    height: Number(m[3]),
    ratio: Number(m[4]),
    compressed: Number(m[5]),
    colors: Number(m[6]),
    skin: Number(m[7]),
    score: Number(m[8]),
  }
}

function parseSelected(line: string): { source: string; score: number } | null {
  // Format : [CV Photo] Selected: <source> <w>x<h> score=<sc>
  const m = line.match(/Selected:\s+(\S+)\s+\d+x\d+\s+score=(-?\d+)/)
  return m ? { source: m[1], score: Number(m[2]) } : null
}

function parseNoHeadshot(line: string): { score: number; threshold: number } | null {
  // Format : [CV Photo] No suitable headshot found. Best score: <sc> (threshold: 25)
  const m = line.match(/Best score:\s+(-?\d+)\s+\(threshold:\s+(\d+)\)/)
  return m ? { score: Number(m[1]), threshold: Number(m[2]) } : null
}

function parseVisionValidation(line: string): { source: string; answer: string } | null {
  // Format : [CV Photo] Vision validation: <source> <w>x<h> → <answer>
  const m = line.match(/Vision validation:\s+(\S+)\s+\d+x\d+\s+→\s+(\S+)/)
  return m ? { source: m[1], answer: m[2] } : null
}

async function runOne(entry: ManifestEntry): Promise<RunResult> {
  const filePath = path.join(FIXTURES_DIR, entry.filename)
  const buf = fs.readFileSync(filePath)
  const ext = path.extname(entry.filename).toLowerCase()

  const logs: string[] = []
  const origLog = console.log
  const origWarn = console.warn
  console.log = (...args: any[]) => { logs.push(args.map(String).join(' ')) }
  console.warn = (...args: any[]) => { logs.push('[WARN] ' + args.map(String).join(' ')) }

  let result: Buffer | null = null
  let error: string | null = null
  const t0 = Date.now()

  try {
    if (ext === '.pdf') result = await extractPhotoFromPDF(buf)
    else if (ext === '.docx') result = await extractPhotoFromDOCX(buf)
    else if (ext === '.doc') result = await extractPhotoFromDOC(buf)
    else if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') result = await extractPhotoFromImage(buf)
    else throw new Error(`Format non géré : ${ext}`)
  } catch (e: any) {
    error = e?.message || String(e)
  } finally {
    console.log = origLog
    console.warn = origWarn
  }

  const duration = Date.now() - t0

  const candidates: CandidateInfo[] = []
  let selected: RunResult['selected'] = null
  let bestScore: number | null = null
  let threshold: number | null = null
  const visionValidations: RunResult['vision_validations'] = []
  const failedStrategies: string[] = []

  for (const line of logs) {
    const cand = parseCandidate(line)
    if (cand) candidates.push(cand)

    const sel = parseSelected(line)
    if (sel) selected = sel

    const noh = parseNoHeadshot(line)
    if (noh) { bestScore = noh.score; threshold = noh.threshold }

    const viz = parseVisionValidation(line)
    if (viz) visionValidations.push(viz)

    if (line.includes('strategy failed')) failedStrategies.push(line)
    if (line.includes('Strategy 3 (Vision crop) failed')) failedStrategies.push('strategy3')
    if (line.includes('Vision confirmed no faces')) failedStrategies.push('vision-1b-rejected-all')
  }

  if (bestScore === null && candidates.length > 0) {
    bestScore = Math.max(...candidates.map(c => c.score))
    threshold = 25
  }

  // Capture toutes les lignes F5-* + warnings stratégiques pour diagnostic
  const f5_logs = logs.filter(l => /^\[F5-/.test(l) || /pdf-lib strategy failed|pdfjs strategy failed|Strategy 3.*failed/.test(l))

  return {
    idx: entry.idx,
    filename: entry.filename,
    name: entry.name,
    ext,
    size_bytes: entry.size,
    extracted: !!result,
    photo_size_bytes: result?.length || 0,
    candidates_count: candidates.length,
    candidates,
    selected,
    best_score: bestScore,
    threshold,
    vision_validations: visionValidations,
    failed_strategies: failedStrategies,
    f5_logs,
    error,
    duration_ms: duration,
  }
}

async function main() {
  const manifestPath = path.join(FIXTURES_DIR, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    console.error(`❌ Manifest absent : ${manifestPath}`)
    console.error('   Lance d\'abord : node scripts/tests/download-photos-fail-fixtures.mjs')
    process.exit(1)
  }
  const manifest: ManifestEntry[] = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))

  console.log(`🧪 Banc test extraction photo — ${manifest.length} fixtures`)
  console.log(`📁 ${FIXTURES_DIR}\n`)

  const results: RunResult[] = []
  for (const entry of manifest) {
    process.stdout.write(`[${String(entry.idx).padStart(2, '0')}] ${entry.filename}... `)
    const r = await runOne(entry)
    results.push(r)
    const status = r.extracted ? '✅' : '❌'
    const detail = r.extracted
      ? `extr (${r.photo_size_bytes}B, ${r.duration_ms}ms)`
      : `cand=${r.candidates_count} best=${r.best_score ?? 'n/a'} ${r.error ? `err=${r.error.slice(0, 40)}` : ''}`
    console.log(`${status} ${detail}`)
  }

  // Tableau récap
  console.log('\n' + '━'.repeat(120))
  console.log('TABLEAU RÉSUMÉ')
  console.log('━'.repeat(120))
  console.log('| # | Fichier                                | Ext  | Extr | #Cand | Best | Vision    | Raison rejet')
  console.log('|---|----------------------------------------|------|------|-------|------|-----------|------------------------------------------')
  for (const r of results) {
    const fname = r.filename.padEnd(38).slice(0, 38)
    const ext = r.ext.padEnd(4)
    const extr = r.extracted ? '✅  ' : '❌  '
    const cand = String(r.candidates_count).padStart(5)
    const best = r.best_score === null ? '   - ' : String(r.best_score).padStart(4) + ' '
    const visions = r.vision_validations.length > 0
      ? r.vision_validations.map(v => v.answer.slice(0, 3)).join(',').slice(0, 9).padEnd(9)
      : '         '
    let reason = 'OK'
    if (!r.extracted) {
      if (r.error) reason = `err: ${r.error.slice(0, 38)}`
      else if (r.candidates_count === 0) reason = 'aucun candidat extrait du fichier'
      else if (r.best_score !== null && r.best_score < (r.threshold ?? 25)) reason = `score ${r.best_score} < ${r.threshold} (seuil)`
      else if (r.failed_strategies.includes('vision-1b-rejected-all')) reason = 'Vision 1b a rejeté tous les candidats'
      else reason = 'inconnu'
    }
    console.log(`| ${String(r.idx).padStart(2)}| ${fname} | ${ext} | ${extr} | ${cand} | ${best}| ${visions} | ${reason}`)
  }

  const ok = results.filter(r => r.extracted).length
  const fail = results.length - ok
  console.log(`\n📊 ${ok}/${results.length} extractions réussies, ${fail} échecs`)

  // Stats par cause
  const causeStats: Record<string, number> = {}
  for (const r of results) {
    if (r.extracted) continue
    let cause = 'inconnu'
    if (r.error) cause = 'erreur lib'
    else if (r.candidates_count === 0) cause = 'aucun candidat extrait'
    else if (r.best_score !== null && r.best_score < (r.threshold ?? 25)) cause = `score < seuil (${r.best_score})`
    else if (r.failed_strategies.includes('vision-1b-rejected-all')) cause = 'Vision 1b NO sur tout'
    causeStats[cause] = (causeStats[cause] || 0) + 1
  }
  console.log('\nRépartition causes échec :')
  for (const [cause, count] of Object.entries(causeStats)) {
    console.log(`  ${count.toString().padStart(3)} × ${cause}`)
  }

  // Rapport JSON
  const report = {
    when: new Date().toISOString(),
    summary: { total: results.length, ok, fail, causes: causeStats },
    results,
  }
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2))
  console.log(`\n📋 Rapport JSON : ${REPORT_PATH}`)
}

main().catch(e => {
  console.error('💥 Crash :', e)
  process.exit(1)
})
