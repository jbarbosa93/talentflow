/**
 * Applique les 285 corrections finales en DB.
 * Source : ~/Desktop/localisation-corrections-finales.csv
 *
 * Idempotent : UPDATE WHERE id=X AND localisation=ancienne_valeur
 * → si déjà appliqué, le WHERE ne match plus → 0 rows updated, pas d'erreur.
 *
 * Usage :
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/batch/apply-corrections-finales.ts            # dry-run
 *   npx tsx scripts/batch/apply-corrections-finales.ts --apply    # exécute
 */

import 'dotenv/config'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SR = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!SUPABASE_URL || !SUPABASE_SR) throw new Error('Supabase env manquant')

const supabase = createClient(SUPABASE_URL, SUPABASE_SR, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function parseCSVLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQ) {
      if (c === '"' && line[i+1] === '"') { cur += '"'; i++ }
      else if (c === '"') inQ = false
      else cur += c
    } else {
      if (c === '"') inQ = true
      else if (c === ',') { out.push(cur); cur = '' }
      else cur += c
    }
  }
  out.push(cur)
  return out
}

interface Correction {
  id: string
  nom: string
  prenom: string
  before: string
  after: string
  source: string
}

function loadCSV(): Correction[] {
  const csvPath = path.join(os.homedir(), 'Desktop', 'localisation-corrections-finales.csv')
  const txt = fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, '')
  const lines = txt.split('\n').filter(Boolean)
  const headers = parseCSVLine(lines[0])
  const idx = (h: string) => headers.indexOf(h)
  return lines.slice(1).map(line => {
    const f = parseCSVLine(line)
    return {
      id: f[idx('id')],
      nom: f[idx('nom')],
      prenom: f[idx('prenom')],
      before: f[idx('localisation_actuelle')],
      after: f[idx('correction')],
      source: f[idx('source')],
    }
  }).filter(r => r.id && r.before && r.after && r.before !== r.after)
}

async function main() {
  const corrections = loadCSV()
  console.log(`Mode : ${APPLY ? '🚀 APPLY (DB writes)' : '🔍 DRY-RUN (no writes)'}`)
  console.log(`Corrections à appliquer : ${corrections.length}\n`)

  let okWebOverride = 0, okScriptAuto = 0
  for (const c of corrections) {
    if (c.source.startsWith('script-auto')) okScriptAuto++
    else okWebOverride++
  }
  console.log(`  - script-auto : ${okScriptAuto}`)
  console.log(`  - web/manual  : ${okWebOverride}\n`)

  if (!APPLY) {
    console.log('━━━ DRY-RUN — pas de DB write. Re-lancer avec --apply pour exécuter ━━━')
    return
  }

  let applied = 0, skipped = 0, errors = 0
  for (const c of corrections) {
    const { data, error } = await supabase
      .from('candidats')
      .update({ localisation: c.after })
      .eq('id', c.id)
      .eq('localisation', c.before) // idempotence guard
      .select('id')
    if (error) {
      console.error(`❌ ${c.id} (${c.nom}) : ${error.message}`)
      errors++
      continue
    }
    if (!data || data.length === 0) {
      // déjà appliqué (idempotent skip) ou localisation a changé entre temps
      skipped++
      continue
    }
    applied++
    if (applied % 50 === 0) console.log(`  ... ${applied} appliqués`)
  }

  console.log(`\n━━━ BILAN ━━━`)
  console.log(`✅ Appliqués : ${applied}`)
  console.log(`⏭  Skip (idempotence ou modifié) : ${skipped}`)
  console.log(`❌ Erreurs : ${errors}`)
}

main().catch(e => { console.error('FATAL', e); process.exit(1) })
