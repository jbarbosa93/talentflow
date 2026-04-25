// Témoin anti-régression — 100 candidats avec photo_url OK en DB.
// Lance extractPhotoFromPDF sur chaque, mesure le taux de succès du moteur ACTUEL.
// Sert de baseline : Sessions 2/3 ne doivent pas faire baisser ce taux.
//
// Usage : npx tsx --env-file=.env.local scripts/tests/sim-photo-extraction.ts
// Génère : ~/Desktop/talentflow-test-fixtures/photos-ok/baseline-witness-report.json
//
// ⚠️ Coût Claude API : ~50-150 appels Haiku (Strategy 1b validation + Strategy 3 crop). Faible coût.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { extractPhotoFromPDF } from '../../lib/cv-photo'

const FIXTURES_DIR = path.join(os.homedir(), 'Desktop/talentflow-test-fixtures/photos-ok')
const REPORT_PATH = path.join(FIXTURES_DIR, 'baseline-witness-report.json')

interface ManifestEntry {
  idx: number
  filename: string
  size: number
  candidat_id: string
  name: string
}

interface RunResult {
  idx: number
  filename: string
  name: string
  candidat_id: string
  extracted: boolean
  photo_size_bytes: number
  duration_ms: number
  error: string | null
  s1_candidates: number       // candidates_collected après Strategy 1
  s2_triggered: boolean        // Strategy 2 lancée ?
  s2_crashed: boolean          // Strategy 2 crashée ?
  s3_skip_reason: string | null
  s3_triggered: boolean
  s1_too_large_count: number   // nb XObjects rejetés pour too_large
  final_reason: string | null
  f5_logs: string[]
}

async function runOne(entry: ManifestEntry): Promise<RunResult> {
  const filePath = path.join(FIXTURES_DIR, entry.filename)
  const buf = fs.readFileSync(filePath)

  // Capture les logs au lieu de les silencer
  const logs: string[] = []
  const origLog = console.log
  const origWarn = console.warn
  console.log = (...args: any[]) => { logs.push(args.map(String).join(' ')) }
  console.warn = (...args: any[]) => { logs.push('[WARN] ' + args.map(String).join(' ')) }

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

  const f5_logs = logs.filter(l => /^\[F5-/.test(l))

  // Analyse les logs F5 pour extraire les signaux
  let s1_candidates = 0
  for (const l of f5_logs) {
    const m = l.match(/^\[F5-S1\] done candidates_collected=(\d+)/)
    if (m) s1_candidates = Number(m[1])
  }
  const s2_triggered = f5_logs.some(l => l.includes('[F5-S2] trigger'))
  const s2_crashed = f5_logs.some(l => l.includes('[F5-S2] crash'))
  const s3_skip = f5_logs.find(l => l.startsWith('[F5-S3] skip'))
  const s3_triggered = f5_logs.some(l => l.startsWith('[F5-S3] trigger'))
  const s1_too_large_count = f5_logs.filter(l => l.includes('skip reason=too_large')).length
  const final = f5_logs.find(l => l.startsWith('[F5-Final]'))

  return {
    idx: entry.idx,
    filename: entry.filename,
    name: entry.name,
    candidat_id: entry.candidat_id,
    extracted: !!result,
    photo_size_bytes: result?.length || 0,
    duration_ms: Date.now() - t0,
    error,
    s1_candidates,
    s2_triggered,
    s2_crashed,
    s3_skip_reason: s3_skip ? s3_skip.replace('[F5-S3] skip ', '') : null,
    s3_triggered,
    s1_too_large_count,
    final_reason: final ?? null,
    f5_logs,
  }
}

async function main() {
  const manifestPath = path.join(FIXTURES_DIR, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    console.error(`❌ Manifest absent : ${manifestPath}`)
    console.error('   Lance d\'abord : node --env-file=.env.local scripts/tests/download-photos-ok-fixtures.mjs')
    process.exit(1)
  }
  const manifest: ManifestEntry[] = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))

  console.log(`🛡️  Témoin anti-régression — ${manifest.length} fixtures avec photo_url OK`)
  console.log(`📁 ${FIXTURES_DIR}\n`)

  const results: RunResult[] = []
  for (const entry of manifest) {
    process.stdout.write(`[${String(entry.idx).padStart(3, '0')}] ${entry.filename.slice(0, 50).padEnd(50)} `)
    const r = await runOne(entry)
    results.push(r)
    const status = r.extracted ? '✅' : '❌'
    const detail = r.extracted
      ? `${r.photo_size_bytes}B (${r.duration_ms}ms)`
      : (r.error ? `err: ${r.error.slice(0, 50)}` : 'no headshot')
    console.log(`${status} ${detail}`)
  }

  const ok = results.filter(r => r.extracted).length
  const fail = results.length - ok
  const pct = (ok / results.length * 100).toFixed(1)

  console.log('\n' + '━'.repeat(80))
  console.log(`📊 BASELINE TÉMOIN : ${ok}/${results.length} (${pct}%) extractions réussies`)
  console.log('━'.repeat(80))

  if (fail > 0) {
    console.log(`\n⚠️  ${fail} candidats échouent malgré photo_url OK en DB :`)
    for (const r of results.filter(x => !x.extracted)) {
      console.log(`     [${String(r.idx).padStart(3, '0')}] ${r.name} — ${r.error || 'no headshot found'}`)
    }
    console.log('\n   Ces cas peuvent être : photo extraite manuellement en DB,')
    console.log('   photo extraite par version antérieure du moteur, ou photo cassée.')
    console.log('   Le baseline témoin est le pourcentage de référence pour Session 2/3.')
  }

  fs.writeFileSync(REPORT_PATH, JSON.stringify({
    when: new Date().toISOString(),
    summary: { total: results.length, ok, fail, pct: parseFloat(pct) },
    results,
  }, null, 2))
  console.log(`\n📋 Rapport : ${REPORT_PATH}`)
}

main().catch(e => { console.error('💥', e); process.exit(1) })
