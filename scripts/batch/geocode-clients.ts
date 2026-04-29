// scripts/batch/geocode-clients.ts
// v1.9.118 — Géocodage batch one-shot des clients actifs
//
// USAGE :
//   npx tsx --env-file=.env.local scripts/batch/geocode-clients.ts --dry-run --limit=50
//   npx tsx --env-file=.env.local scripts/batch/geocode-clients.ts --apply
//
// FORMAT INPUT : "NPA Ville, Suisse" (clients sont presque tous en CH)
// CASCADE      : lookup local CP (instantané, ~95%) → Nominatim 1 req/s (rest)

import { createClient } from '@supabase/supabase-js'
import { geocodeLocalisation } from '../../lib/geocode-localisation'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)
const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const DRY_RUN = !APPLY
const LIMIT_ARG = args.find(a => a.startsWith('--limit='))
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1]) : (DRY_RUN ? 50 : 100000)

interface ClientRow {
  id: string
  nom_entreprise: string
  npa: string | null
  ville: string | null
  canton: string | null
  latitude: number | null
  longitude: number | null
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function buildLocalisation(c: ClientRow): string | null {
  if (!c.ville && !c.npa) return null
  const parts: string[] = []
  if (c.npa) parts.push(c.npa)
  if (c.ville) parts.push(c.ville)
  if (parts.length === 0) return null
  // Suisse par défaut (clients TalentFlow sont quasi-tous en CH)
  return `${parts.join(' ')}, Suisse`
}

async function main() {
  console.log(`\n=== GEOCODE CLIENTS — ${DRY_RUN ? 'DRY-RUN' : 'APPLY'} (limit=${LIMIT}) ===\n`)

  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, nom_entreprise, npa, ville, canton, latitude, longitude')
    .eq('statut', 'actif')
    .is('latitude', null)  // Skip ceux déjà géocodés (re-run idempotent)
    .order('created_at', { ascending: false })
    .limit(LIMIT)

  if (error) { console.error('Fetch error:', error.message); process.exit(1) }
  if (!clients || clients.length === 0) {
    console.log('Aucun client à géocoder (tous ont déjà des coords).')
    return
  }

  console.log(`${clients.length} clients à géocoder\n`)

  let local = 0, nominatim = 0, failed = 0, dbUpdated = 0, dbErrors = 0
  const failedSamples: Array<{ nom: string; loc: string }> = []

  for (let i = 0; i < clients.length; i++) {
    const c = clients[i] as ClientRow
    const progress = `[${i + 1}/${clients.length}]`
    const loc = buildLocalisation(c)

    if (!loc) {
      failed++
      if (failedSamples.length < 10) failedSamples.push({ nom: c.nom_entreprise, loc: '(ni ville ni NPA)' })
      continue
    }

    // Mesure rapide local vs nominatim : on tente d'abord local sync, puis async si raté
    const t0 = Date.now()
    const result = await geocodeLocalisation(loc)
    const ms = Date.now() - t0

    if (!result) {
      failed++
      if (failedSamples.length < 10) failedSamples.push({ nom: c.nom_entreprise, loc })
      if (i < 20 || i % 100 === 0) console.log(`${progress} ❌ ${c.nom_entreprise} — "${loc}"`)
      continue
    }

    // Si le geocode a duré <50ms c'est lookup local, sinon Nominatim
    if (ms < 50) local++
    else nominatim++

    if (i < 10 || i % 100 === 0) {
      console.log(`${progress} ✅ ${c.nom_entreprise} → [${result.latitude.toFixed(4)}, ${result.longitude.toFixed(4)}] (${ms}ms ${ms < 50 ? 'local' : 'nominatim'})`)
    }

    if (!DRY_RUN) {
      const { error: upErr } = await supabase
        .from('clients')
        .update({ latitude: result.latitude, longitude: result.longitude })
        .eq('id', c.id)
      if (upErr) { dbErrors++; console.warn(`  ⚠️ UPDATE failed: ${upErr.message}`) }
      else dbUpdated++
    }

    // Si Nominatim, respecter le rate limit 1 req/s
    if (ms >= 50) await sleep(1100)
  }

  console.log('\n=== RÉCAP ===')
  console.log(`Total candidats au géocodage : ${clients.length}`)
  console.log(`✅ Lookup local instantané    : ${local} (${(100 * local / clients.length).toFixed(1)}%)`)
  console.log(`🌐 Fallback Nominatim         : ${nominatim} (${(100 * nominatim / clients.length).toFixed(1)}%)`)
  console.log(`❌ Échec géocodage            : ${failed} (${(100 * failed / clients.length).toFixed(1)}%)`)
  if (!DRY_RUN) {
    console.log(`\nDB updates OK : ${dbUpdated}`)
    console.log(`DB errors     : ${dbErrors}`)
  } else {
    console.log(`\n[DRY-RUN] Aucune écriture DB. Re-lance avec --apply.`)
  }
  if (failedSamples.length) {
    console.log(`\nÉchantillon des échecs (top ${failedSamples.length}):`)
    for (const s of failedSamples) console.log(`  - ${s.nom} → ${s.loc}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
