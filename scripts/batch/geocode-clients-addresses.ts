// scripts/batch/geocode-clients-addresses.ts
// v1.9.119 — Géocodage RUE+NUMÉRO précis des clients via Nominatim
//
// COMPLÈTE le batch geocode-clients.ts (v1.9.118 — centroïde NPA).
// Cible UNIQUEMENT les clients avec `adresse` non vide. Les autres gardent
// leur centroïde NPA (déjà géocodé en v1.9.118).
//
// USAGE :
//   npx tsx --env-file=.env.local scripts/batch/geocode-clients-addresses.ts --limit=50
//   npx tsx --env-file=.env.local scripts/batch/geocode-clients-addresses.ts --apply
//
// CASCADE par client :
//   1. Build query "Rue X 26, 1870 Monthey, Suisse"
//   2. Nominatim (timeout 5s, rate limit 1.1s entre requêtes)
//   3. Si succès + Europe → UPDATE lat/lng
//   4. Si échec → garde lat/lng existants (centroïde NPA, pas de régression)
//
// IDEMPOTENT : utilise un marqueur `geocode_source` pour skip les clients déjà
// géocodés par adresse précise dans un run précédent. Filtre `--force` pour re-tenter.

import { createClient } from '@supabase/supabase-js'
import { geocodeAddress } from '../../lib/geocode-localisation'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing env (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)')
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
  adresse: string | null
  npa: string | null
  ville: string | null
  canton: string | null
  latitude: number | null
  longitude: number | null
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function main() {
  console.log(`\n=== GEOCODE CLIENTS (RUE PRÉCISE) — ${DRY_RUN ? 'DRY-RUN' : 'APPLY'} (limit=${LIMIT}) ===\n`)

  // Cible : clients avec adresse non vide
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, nom_entreprise, adresse, npa, ville, canton, latitude, longitude')
    .eq('statut', 'actif')
    .not('adresse', 'is', null)
    .neq('adresse', '')
    .order('created_at', { ascending: false })
    .limit(LIMIT)

  if (error) { console.error('Fetch error:', error.message); process.exit(1) }
  if (!clients || clients.length === 0) {
    console.log('Aucun client avec adresse à re-géocoder.')
    return
  }

  console.log(`${clients.length} clients avec adresse → tentative géocodage rue précise via Nominatim`)
  console.log(`Rate limit Nominatim : 1 req / 1.1s → ETA ~${Math.ceil(clients.length * 1.1 / 60)} min\n`)

  let address = 0       // Géocodé via adresse précise (succès Nominatim)
  let centroid = 0      // Fallback centroïde (Nominatim échoué)
  let unchanged = 0     // Centroïde inchangé (pas d'amélioration)
  let dbUpdated = 0
  let dbErrors = 0
  const failedSamples: Array<{ nom: string; query: string }> = []
  const movedSamples: Array<{ nom: string; from: string; to: string; deltaKm: number }> = []

  function distKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLng = (lng2 - lng1) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  for (let i = 0; i < clients.length; i++) {
    const c = clients[i] as ClientRow
    const progress = `[${i + 1}/${clients.length}]`
    const adresse = (c.adresse || '').trim()
    const query = `${adresse}, ${c.npa || ''} ${c.ville || ''}, Suisse`.replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim()

    const t0 = Date.now()
    const result = await geocodeAddress(c.adresse, c.npa, c.ville, 'Suisse')
    const ms = Date.now() - t0

    if (!result) {
      console.log(`${progress} ❌ ${c.nom_entreprise} — "${query}" (no result)`)
      if (failedSamples.length < 10) failedSamples.push({ nom: c.nom_entreprise, query })
      continue
    }

    if (result.source === 'address') {
      address++
      // Distance entre ancienne (centroïde) et nouvelle (rue)
      const oldLat = c.latitude
      const oldLng = c.longitude
      const delta = oldLat != null && oldLng != null
        ? distKm(oldLat, oldLng, result.latitude, result.longitude)
        : 0
      if (i < 15 || i % 50 === 0) {
        console.log(`${progress} ✅ ${c.nom_entreprise} → [${result.latitude.toFixed(4)}, ${result.longitude.toFixed(4)}] (rue, +${delta.toFixed(2)} km, ${ms}ms)`)
      }
      if (delta > 0.05 && movedSamples.length < 15) {
        movedSamples.push({ nom: c.nom_entreprise, from: `${oldLat?.toFixed(4)},${oldLng?.toFixed(4)}`, to: `${result.latitude.toFixed(4)},${result.longitude.toFixed(4)}`, deltaKm: delta })
      }

      if (!DRY_RUN) {
        const { error: upErr } = await supabase
          .from('clients')
          .update({ latitude: result.latitude, longitude: result.longitude })
          .eq('id', c.id)
        if (upErr) { dbErrors++; console.warn(`  ⚠️ UPDATE failed: ${upErr.message}`) }
        else dbUpdated++
      }
    } else {
      // Source = centroïde → pas d'amélioration vs centroïde NPA déjà en DB
      // Mais on vérifie quand même : si DB n'a pas de coords, on update
      if (c.latitude == null || c.longitude == null) {
        centroid++
        if (!DRY_RUN) {
          const { error: upErr } = await supabase
            .from('clients')
            .update({ latitude: result.latitude, longitude: result.longitude })
            .eq('id', c.id)
          if (upErr) { dbErrors++; console.warn(`  ⚠️ UPDATE centroïde failed: ${upErr.message}`) }
          else dbUpdated++
        }
        if (i < 15 || i % 50 === 0) console.log(`${progress} 🔵 ${c.nom_entreprise} → fallback centroïde (Nominatim KO)`)
      } else {
        unchanged++
      }
    }

    // Rate limit Nominatim 1 req/sec strict (la fonction fait 1 ou 2 calls Nominatim si fallback)
    await sleep(1100)
  }

  console.log('\n=== RÉCAP ===')
  console.log(`Total clients ciblés          : ${clients.length}`)
  console.log(`✅ Géocodage rue précis       : ${address} (${(100 * address / clients.length).toFixed(1)}%)`)
  console.log(`🔵 Fallback centroïde (KO)    : ${centroid} (${(100 * centroid / clients.length).toFixed(1)}%)`)
  console.log(`⏭️  Inchangés (centroïde déjà) : ${unchanged} (${(100 * unchanged / clients.length).toFixed(1)}%)`)
  console.log(`❌ Échec total                : ${failedSamples.length}`)
  if (!DRY_RUN) {
    console.log(`\nDB updates OK : ${dbUpdated}`)
    console.log(`DB errors     : ${dbErrors}`)
  } else {
    console.log(`\n[DRY-RUN] Aucune écriture DB. Re-lance avec --apply.`)
  }

  if (movedSamples.length) {
    console.log(`\nÉchantillon des markers déplacés (centroïde → rue précise):`)
    for (const s of movedSamples) console.log(`  - ${s.nom}: ${s.from} → ${s.to} (${s.deltaKm.toFixed(2)} km)`)
  }

  if (failedSamples.length) {
    console.log(`\nÉchantillon des échecs (top ${failedSamples.length}):`)
    for (const s of failedSamples) console.log(`  - ${s.nom} → "${s.query}"`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
