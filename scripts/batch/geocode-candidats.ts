/**
 * Géocodage rétroactif des candidats : remplit candidats.latitude / longitude.
 *
 * Source primaire : scripts/data/cp_geo.json (CP CH+FR → [lat, lng])
 * Fallback        : Nominatim OSM (1 req/s, pour pays autres ou CP absents)
 *
 * Usage :
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/batch/geocode-candidats.ts                    # dry-run 50
 *   npx tsx scripts/batch/geocode-candidats.ts --limit=200        # dry-run 200
 *   npx tsx scripts/batch/geocode-candidats.ts --apply            # vrai run total
 *   npx tsx scripts/batch/geocode-candidats.ts --apply --limit=50 # vrai run partiel
 *
 * Garde-fous :
 *   - Skip candidats avec latitude IS NOT NULL (jamais écraser)
 *   - Skip localisation null/empty
 *   - Skip si lat/lng hors Europe (35-72°N, -10 à +40°E) → suspicion FP
 *   - Idempotence DB : UPDATE WHERE id=X AND latitude IS NULL
 */

import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='))
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : (APPLY ? null : 50)

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SR = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!SUPABASE_URL || !SUPABASE_SR) throw new Error('Supabase env manquant')

const supabase = createClient(SUPABASE_URL, SUPABASE_SR, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ─── Dataset géocodage local ──────────────────────────────────────────
const CP_GEO_RAW = JSON.parse(
  fs.readFileSync(path.resolve('scripts/data/cp_geo.json'), 'utf8'),
) as { _meta: any; [k: string]: [number, number] | any }
const CP_GEO: Record<string, [number, number]> = {}
for (const [k, v] of Object.entries(CP_GEO_RAW)) {
  if (k.startsWith('_')) continue
  CP_GEO[k] = v as [number, number]
}
console.log(`[init] ${Object.keys(CP_GEO).length} CPs géocodés en mémoire`)

// ─── Validation Europe ────────────────────────────────────────────────
const EUROPE_LAT_MIN = 35
const EUROPE_LAT_MAX = 72
const EUROPE_LNG_MIN = -10
const EUROPE_LNG_MAX = 40

function isInEurope(lat: number, lng: number): boolean {
  return lat >= EUROPE_LAT_MIN && lat <= EUROPE_LAT_MAX
      && lng >= EUROPE_LNG_MIN && lng <= EUROPE_LNG_MAX
}

// ─── Parsing localisation ─────────────────────────────────────────────
type ParsedLoc = { cp: string | null; ville: string | null; pays: string | null }

function parseLocalisation(loc: string): ParsedLoc {
  // Format strict : "1870 Monthey, Suisse" / "74500 Évian-les-Bains, France"
  // Format autre  : "Lisbonne, Portugal" / "Casablanca, Maroc"
  const m = loc.trim().match(/^(\d{4,5})\s+([^,]+?),\s*(.+)$/)
  if (m) return { cp: m[1], ville: m[2].trim(), pays: m[3].trim() }
  const m2 = loc.trim().match(/^([^,]+?),\s*(.+)$/)
  if (m2) return { cp: null, ville: m2[1].trim(), pays: m2[2].trim() }
  return { cp: null, ville: loc.trim(), pays: null }
}

function paysToCC(pays: string): string | null {
  const p = pays.toLowerCase()
  if (['suisse', 'switzerland', 'schweiz', 'svizzera', 'ch'].includes(p)) return 'ch'
  if (['france', 'francaise', 'française', 'fr'].includes(p)) return 'fr'
  return null
}

// ─── Lookup local (CP CH/FR uniquement) ───────────────────────────────
function lookupLocal(parsed: ParsedLoc): { lat: number; lng: number; source: string } | null {
  if (!parsed.cp || !parsed.pays) return null
  const cc = paysToCC(parsed.pays)
  if (!cc) return null
  const key = `${cc}:${parsed.cp}`
  const hit = CP_GEO[key]
  if (!hit) return null
  return { lat: hit[0], lng: hit[1], source: `local:${cc}:${parsed.cp}` }
}

// ─── Fallback Nominatim ───────────────────────────────────────────────
const NOMINATIM_UA = 'TalentFlow-Geocode/1.0 (jbarbosa93@hotmail.com)'

async function nominatim(query: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`
  try {
    const r = await fetch(url, { headers: { 'User-Agent': NOMINATIM_UA } })
    if (!r.ok) return null
    const data = await r.json() as Array<{ lat: string; lon: string }>
    if (!data.length) return null
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch {
    return null
  }
}

// ─── Main ─────────────────────────────────────────────────────────────
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

interface Cand { id: string; nom: string | null; prenom: string | null; localisation: string | null }

async function fetchTodo(): Promise<Cand[]> {
  // Candidats avec localisation non-null + latitude null
  const all: Cand[] = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await supabase
      .from('candidats')
      .select('id, nom, prenom, localisation')
      .not('localisation', 'is', null)
      .neq('localisation', '')
      .is('latitude', null)
      .range(from, from + PAGE - 1)
      .order('id')
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as Cand[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

async function main() {
  console.log(`Mode : ${APPLY ? '🚀 APPLY (DB writes)' : '🔍 DRY-RUN'}`)
  console.log(`Limit : ${LIMIT ?? 'aucune (tous)'}\n`)

  const todo = await fetchTodo()
  console.log(`Candidats à géocoder (latitude null) : ${todo.length}`)
  const slice = LIMIT ? todo.slice(0, LIMIT) : todo
  console.log(`Traités cette passe : ${slice.length}\n`)

  let local = 0, nomCalls = 0, nomOk = 0, outOfEurope = 0, none = 0, applied = 0, errors = 0
  const examples: Array<{ id: string; loc: string; result: string }> = []

  for (let i = 0; i < slice.length; i++) {
    const c = slice[i]
    const loc = c.localisation!.trim()
    if (!loc) { none++; continue }
    const parsed = parseLocalisation(loc)
    let geo: { lat: number; lng: number; source: string } | null = lookupLocal(parsed)

    if (!geo && parsed.pays && parsed.ville) {
      // Fallback Nominatim — seulement si on a au moins ville+pays
      const query = parsed.cp
        ? `${parsed.cp} ${parsed.ville}, ${parsed.pays}`
        : `${parsed.ville}, ${parsed.pays}`
      nomCalls++
      const hit = await nominatim(query)
      if (hit) {
        geo = { lat: hit.lat, lng: hit.lng, source: 'nominatim' }
        nomOk++
      }
      await sleep(1100) // rate limit
    }

    if (!geo) { none++; continue }

    if (!isInEurope(geo.lat, geo.lng)) {
      outOfEurope++
      continue
    }

    if (geo.source.startsWith('local:')) local++
    examples.push({ id: c.id, loc, result: `${geo.lat}, ${geo.lng} [${geo.source}]` })

    if (APPLY) {
      const { error, data } = await supabase
        .from('candidats')
        .update({ latitude: geo.lat, longitude: geo.lng })
        .eq('id', c.id)
        .is('latitude', null)
        .select('id')
      if (error) errors++
      else if (data && data.length > 0) applied++
    }

    if ((i + 1) % 100 === 0) console.log(`  ... ${i + 1}/${slice.length} (local=${local}, nominatim=${nomOk})`)
  }

  console.log(`\n━━━ BILAN ━━━`)
  console.log(`Local  (cp_geo.json)        : ${local}`)
  console.log(`Nominatim OK                : ${nomOk} / ${nomCalls} appels`)
  console.log(`Hors Europe (rejeté)        : ${outOfEurope}`)
  console.log(`Non géocodé                 : ${none}`)
  if (APPLY) {
    console.log(`✅ Appliqués DB              : ${applied}`)
    console.log(`❌ Erreurs                   : ${errors}`)
  }

  console.log(`\n=== Échantillons (${Math.min(15, examples.length)}) ===`)
  for (const e of examples.slice(0, 15)) {
    console.log(`  "${e.loc}"`)
    console.log(`    → ${e.result}`)
  }

  if (!APPLY) {
    // Sauvegarde rapport JSON local
    const outPath = path.join(os.homedir(), 'Desktop', `geocode-dryrun-${slice.length}.json`)
    fs.writeFileSync(outPath, JSON.stringify({ stats: { local, nomOk, nomCalls, outOfEurope, none }, examples }, null, 2))
    console.log(`\n📁 Rapport DRY RUN : ${outPath}`)
    console.log(`\n━━━ DRY-RUN — pas de DB write. Re-lancer avec --apply pour exécuter ━━━`)
  }
}

main().catch(e => { console.error('FATAL', e); process.exit(1) })
