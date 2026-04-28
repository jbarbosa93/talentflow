/**
 * Batch normalisation localisation — v1.9.108
 *
 * Cible : 5792 candidats avec localisation IS NOT NULL ET <> ''
 * Pipeline 100% déterministe (0 IA, 0 hallucination) :
 *   - lib/normalize-localisation.ts (lookup CP via datasets geonames officiels)
 *   - 0 appel API externe pendant le run
 *
 * Coût : $0.00 (zéro IA)
 * Durée estimée : 2-5 min
 *
 * Usage :
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/batch/normalize-localisation.ts            # DRY RUN tous
 *   npx tsx scripts/batch/normalize-localisation.ts --apply    # vraies écritures DB
 *   npx tsx scripts/batch/normalize-localisation.ts --limit=100 # limiter (debug)
 *
 * Garde-fou : UPDATE conditionnel `WHERE id=... AND localisation = <ancienne valeur>`
 * empêche d'écraser une localisation déjà modifiée entre fetch et update.
 */

import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { normalizeLocalisation, isAlreadyNormalized } from '../../lib/normalize-localisation'

const APPLY = process.argv.includes('--apply')
const DRY_RUN = !APPLY
const limitArg = process.argv.find(a => a.startsWith('--limit='))?.split('=')[1]
const LIMIT = limitArg ? parseInt(limitArg, 10) : Infinity
const PAGE_SIZE = 1000

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SR = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!SUPABASE_URL || !SUPABASE_SR) throw new Error('Supabase env manquant')

const supabase = createClient(SUPABASE_URL, SUPABASE_SR, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ─── Catégorisation pour échantillonnage rapport ──────────────────────
type Cat = 1 | 2 | 3 | 4 | 5 | 0
function categorize(loc: string): Cat {
  if (/^[A-Za-zÀ-ÿ\s\-]+,\s*Suisse$/i.test(loc) && !/^\d/.test(loc)) return 1
  if (/^[A-Za-zÀ-ÿ\s\-]+,\s*France$/i.test(loc) && !/^\d/.test(loc)) return 2
  if (/(?<![\p{L}])(rue|avenue|route|chemin|allée|allee|place|boulevard|impasse)(?![\p{L}])/iu.test(loc)) return 3
  if (!loc.includes(',')) return 4
  if ((loc.match(/,/g) || []).length >= 2) return 5
  return 0
}

// ─── Statuts de traitement ────────────────────────────────────────────
type Status = 'CHANGED' | 'SKIP_ALREADY_OK' | 'SAME' | 'NULL_NORMALIZED' | 'ERROR'
type Outcome = {
  id: string
  before: string
  after: string | null
  status: Status
  cat: Cat
  error?: string
}

async function fetchAll(): Promise<Array<{ id: string; localisation: string }>> {
  const all: Array<{ id: string; localisation: string }> = []
  let from = 0
  while (true) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('candidats')
      .select('id, localisation')
      .not('localisation', 'is', null)
      .neq('localisation', '')
      .range(from, to)
      .order('id')
    if (error) throw error
    if (!data || data.length === 0) break
    for (const r of data as any[]) all.push(r)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
    if (all.length >= LIMIT) break
  }
  return all.slice(0, LIMIT)
}

async function main() {
  console.log('━'.repeat(70))
  console.log(`Batch normalize-localisation — ${DRY_RUN ? 'DRY RUN' : 'APPLY'}`)
  console.log('━'.repeat(70))

  const startedAt = Date.now()
  const candidates = await fetchAll()
  console.log(`Fetched : ${candidates.length} fiches\n`)

  const outcomes: Outcome[] = []
  let changed = 0, skipped = 0, same = 0, nulls = 0, err = 0

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]
    const before = c.localisation
    const cat = categorize(before)
    let after: string | null = null
    let status: Status = 'SAME'

    try {
      if (isAlreadyNormalized(before)) {
        status = 'SKIP_ALREADY_OK'
        after = before
        skipped++
      } else {
        after = normalizeLocalisation(before)
        if (after === null) { status = 'NULL_NORMALIZED'; nulls++ }
        else if (after === before) { status = 'SAME'; same++ }
        else { status = 'CHANGED'; changed++ }
      }
    } catch (e: any) {
      status = 'ERROR'
      err++
      outcomes.push({ id: c.id, before, after: null, status, cat, error: e?.message })
      continue
    }

    outcomes.push({ id: c.id, before, after, status, cat })

    if (status === 'CHANGED' && APPLY && after !== null) {
      const { error } = await supabase
        .from('candidats')
        .update({ localisation: after })
        .eq('id', c.id)
        .eq('localisation', before) // garde-fou : ne pas écraser si modifié entre-temps
      if (error) {
        console.error(`UPDATE failed ${c.id}: ${error.message}`)
        err++
      }
    }

    if ((i + 1) % 500 === 0) {
      console.log(`  progress ${i + 1}/${candidates.length} — changed=${changed} skip=${skipped} same=${same} null=${nulls} err=${err}`)
    }
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)

  // Échantillon : 5 cas par catégorie où status === CHANGED
  const sampleByCat: Record<number, Outcome[]> = { 1: [], 2: [], 3: [], 4: [], 5: [], 0: [] }
  for (const o of outcomes) {
    if (o.status !== 'CHANGED') continue
    const arr = sampleByCat[o.cat]
    if (arr.length < 5) arr.push(o)
  }

  console.log('\n' + '━'.repeat(70))
  console.log(`Résultat (${candidates.length} fiches, ${elapsed}s)`)
  console.log('━'.repeat(70))
  console.log(`CHANGED         : ${changed} (${(100 * changed / candidates.length).toFixed(1)}%)`)
  console.log(`SKIP already OK : ${skipped} (${(100 * skipped / candidates.length).toFixed(1)}%)`)
  console.log(`SAME            : ${same} (${(100 * same / candidates.length).toFixed(1)}%)`)
  console.log(`NULL normalized : ${nulls} (${(100 * nulls / candidates.length).toFixed(1)}%)`)
  console.log(`ERROR           : ${err}`)

  console.log('\n━━━ Échantillon CHANGED (5 par catégorie) ━━━')
  const catLabels: Record<number, string> = {
    1: 'Cat 1 — "Ville, Suisse" sans CP',
    2: 'Cat 2 — "Ville, France" sans CP',
    3: 'Cat 3 — avec voirie',
    4: 'Cat 4 — sans virgule',
    5: 'Cat 5 — multi-tokens',
    0: 'Cat 0 — autre',
  }
  for (const c of [1, 2, 3, 4, 5, 0] as Cat[]) {
    const arr = sampleByCat[c]
    if (!arr.length) continue
    console.log(`\n${catLabels[c]}`)
    for (const o of arr) {
      console.log(`  ${o.before.padEnd(56).slice(0, 56)} → ${o.after}`)
    }
  }

  // Distribution par cat sur tout l'échantillon CHANGED
  console.log('\n━━━ Distribution CHANGED par catégorie ━━━')
  const catCount: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 0: 0 }
  for (const o of outcomes) if (o.status === 'CHANGED') catCount[o.cat]++
  for (const c of [1, 2, 3, 4, 5, 0]) console.log(`  Cat ${c}: ${catCount[c]}`)

  // Sauvegarde rapport JSON
  const reportPath = path.join(process.cwd(), `normalize-localisation-${DRY_RUN ? 'dryrun' : 'apply'}-${Date.now()}.json`)
  fs.writeFileSync(reportPath, JSON.stringify({
    dryRun: DRY_RUN,
    fetched: candidates.length,
    summary: { changed, skipped, same, nulls, err, elapsedSec: elapsed },
    sampleByCat,
    catCount,
    outcomes: outcomes.slice(0, 5000), // tronquer pour pas exploser le fichier
    finishedAt: new Date().toISOString(),
  }, null, 2), 'utf8')
  console.log(`\nRapport JSON : ${reportPath}`)

  if (DRY_RUN) console.log('\n⚠️  DRY RUN — aucune écriture DB. Relancer avec --apply pour appliquer.')
}

main().catch(e => { console.error('FATAL', e); process.exit(1) })
