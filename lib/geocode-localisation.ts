/**
 * Géocodage d'une localisation candidate au format strict "CP Ville, Pays".
 *
 * Source primaire : scripts/data/cp_geo.json (CP CH+FR → [lat, lng], synchrone)
 * Fallback        : Nominatim OSM (1 req/s, async, timeout 3s pour ne pas bloquer import)
 *
 * Validation : coordonnées doivent être en Europe (35-72°N, -10 à +40°E).
 * Si hors Europe → null (probable faux positif Nominatim).
 *
 * Utilisé par :
 *   - app/(dashboard)/api/cv/parse/route.ts (import manuel)
 *   - app/(dashboard)/api/onedrive/sync/route.ts (cron auto)
 *   - scripts/batch/geocode-candidats.ts (rétroactif)
 */

import cpGeoRaw from '../scripts/data/cp_geo.json'

type GeoEntry = [number, number] // [lat, lng]
type GeoDict = Record<string, GeoEntry>

const CP_GEO: GeoDict = (() => {
  const out: GeoDict = {}
  for (const [k, v] of Object.entries(cpGeoRaw as Record<string, unknown>)) {
    if (k.startsWith('_')) continue
    out[k] = v as GeoEntry
  }
  return out
})()

// ─── Validation Europe ────────────────────────────────────────────────
const EUROPE_LAT_MIN = 35
const EUROPE_LAT_MAX = 72
const EUROPE_LNG_MIN = -10
const EUROPE_LNG_MAX = 40

function isInEurope(lat: number, lng: number): boolean {
  return (
    lat >= EUROPE_LAT_MIN && lat <= EUROPE_LAT_MAX &&
    lng >= EUROPE_LNG_MIN && lng <= EUROPE_LNG_MAX
  )
}

// ─── Parsing ──────────────────────────────────────────────────────────
type ParsedLoc = { cp: string | null; ville: string | null; pays: string | null }

function parseLocalisation(loc: string): ParsedLoc {
  // Format strict : "1870 Monthey, Suisse" / "74500 Évian-les-Bains, France"
  const m = loc.trim().match(/^(\d{4,5})\s+([^,]+?),\s*(.+)$/)
  if (m) return { cp: m[1], ville: m[2].trim(), pays: m[3].trim() }
  // Format autre  : "Lisbonne, Portugal"
  const m2 = loc.trim().match(/^([^,]+?),\s*(.+)$/)
  if (m2) return { cp: null, ville: m2[1].trim(), pays: m2[2].trim() }
  return { cp: null, ville: loc.trim(), pays: null }
}

function paysToCC(pays: string): string | null {
  const p = pays.toLowerCase().trim()
  if (['suisse', 'switzerland', 'schweiz', 'svizzera', 'ch'].includes(p)) return 'ch'
  if (['france', 'francaise', 'française', 'fr'].includes(p)) return 'fr'
  return null
}

// ─── Lookup local synchrone (CP CH/FR uniquement) ─────────────────────
function lookupGeoLocal(cp: string | null, pays: string | null): GeoEntry | null {
  if (!cp || !pays) return null
  const cc = paysToCC(pays)
  if (!cc) return null
  return CP_GEO[`${cc}:${cp}`] ?? null
}

// ─── Fallback Nominatim async (timeout 3s) ────────────────────────────
const NOMINATIM_UA = 'TalentFlow/1.0 (https://talent-flow.ch)'

async function nominatim(query: string, timeoutMs = 3000): Promise<GeoEntry | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(url, { headers: { 'User-Agent': NOMINATIM_UA }, signal: ctrl.signal })
    if (!r.ok) return null
    const data = (await r.json()) as Array<{ lat: string; lon: string }>
    if (!data.length) return null
    return [parseFloat(data[0].lat), parseFloat(data[0].lon)]
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ─── API publique ─────────────────────────────────────────────────────

/**
 * Géocode une localisation au format strict. Retourne { latitude, longitude } ou null.
 *
 * Tentative en cascade :
 *   1. Lookup local CP CH/FR (synchrone, instantané, ~90% des cas)
 *   2. Fallback Nominatim si ville+pays présents et lookup local échoue (timeout 3s)
 *   3. Validation Europe → rejette les FP type "Saxon, US"
 *
 * Idempotent : retourne le même résultat pour le même input.
 *
 * @param localisation Format strict "CP Ville, Pays" attendu (sortie de normalizeLocalisation).
 * @returns { latitude, longitude } ou null si non géocodable / hors Europe.
 */
export async function geocodeLocalisation(
  localisation: string | null | undefined,
): Promise<{ latitude: number; longitude: number } | null> {
  if (!localisation || !localisation.trim()) return null
  const parsed = parseLocalisation(localisation)

  // 1. Lookup local
  const local = lookupGeoLocal(parsed.cp, parsed.pays)
  if (local) {
    if (isInEurope(local[0], local[1])) {
      return { latitude: local[0], longitude: local[1] }
    }
    return null
  }

  // 2. Fallback Nominatim — uniquement si on a au moins ville+pays
  if (!parsed.pays || !parsed.ville) return null
  const query = parsed.cp
    ? `${parsed.cp} ${parsed.ville}, ${parsed.pays}`
    : `${parsed.ville}, ${parsed.pays}`
  const remote = await nominatim(query)
  if (!remote) return null
  if (!isInEurope(remote[0], remote[1])) return null

  return { latitude: remote[0], longitude: remote[1] }
}

/**
 * Version synchrone — lookup local UNIQUEMENT (pas de Nominatim).
 * Utile dans les contextes où on ne peut pas await (rare).
 */
export function geocodeLocalisationSync(
  localisation: string | null | undefined,
): { latitude: number; longitude: number } | null {
  if (!localisation || !localisation.trim()) return null
  const parsed = parseLocalisation(localisation)
  const local = lookupGeoLocal(parsed.cp, parsed.pays)
  if (!local) return null
  if (!isInEurope(local[0], local[1])) return null
  return { latitude: local[0], longitude: local[1] }
}

/**
 * v1.9.119 — Géocodage par ADRESSE COMPLÈTE (rue + numéro + NPA + ville + pays).
 *
 * Utilisé pour les clients : permet de placer le marker carte sur la vraie rue
 * au lieu du centroïde NPA. Tous les clients d'une même ville cessent d'être
 * superposés sur un seul point GPS.
 *
 * Cascade :
 *   1. Si adresse vide → fallback geocodeLocalisation (centroïde NPA)
 *   2. Sinon → Nominatim avec query complète (timeout 5s, plus large que le 3s
 *      de geocodeLocalisation car la requête est plus précise et donc plus lente)
 *   3. Si Nominatim échoue / hors Europe → fallback centroïde NPA
 *
 * IMPORTANT : Nominatim limite à 1 req/sec. À utiliser en background (after())
 * dans les routes API, ou dans des scripts batch avec sleep(1100) entre requêtes.
 *
 * @returns { latitude, longitude, source: 'address' | 'centroid' } ou null
 */
export async function geocodeAddress(
  adresse: string | null | undefined,
  npa: string | null | undefined,
  ville: string | null | undefined,
  pays: string = 'Suisse',
): Promise<{ latitude: number; longitude: number; source: 'address' | 'centroid' } | null> {
  const adr = (adresse || '').trim()
  const cp = (npa || '').trim()
  const v = (ville || '').trim()

  // Pas d'adresse → fallback centroïde
  if (!adr) {
    if (!cp && !v) return null
    const fallback = await geocodeLocalisation(`${cp ? cp + ' ' : ''}${v}, ${pays}`.trim())
    return fallback ? { ...fallback, source: 'centroid' } : null
  }

  // Avec adresse → Nominatim direct (query complète)
  // Format : "Rue X 26, 1870 Monthey, Suisse"
  const parts: string[] = [adr]
  if (cp || v) parts.push(`${cp ? cp + ' ' : ''}${v}`.trim())
  parts.push(pays)
  const query = parts.filter(Boolean).join(', ')

  const remote = await nominatim(query, 5000)
  if (remote && isInEurope(remote[0], remote[1])) {
    return { latitude: remote[0], longitude: remote[1], source: 'address' }
  }

  // Nominatim échoué → fallback centroïde NPA
  if (!cp && !v) return null
  const fallback = await geocodeLocalisation(`${cp ? cp + ' ' : ''}${v}, ${pays}`.trim())
  return fallback ? { ...fallback, source: 'centroid' } : null
}
