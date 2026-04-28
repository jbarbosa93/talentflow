/**
 * GET /api/villes/suggestions?q=mont
 *
 * Autocomplete pour le filtre rayon (UI candidats). Retourne top 8 villes CH+FR
 * matching le préfixe (insensible aux accents et à la casse).
 *
 * - Recherche alpha ("Lausanne") → 1 entrée par ville canonique (sans CP, label "Lausanne, Suisse")
 *   → lat/lng du CP principal (le plus petit). Haversine catche tous les sous-CP en rayon.
 * - Recherche numérique ("1003") → CP exact "1003 Lausanne, Suisse" (lat/lng précis).
 *
 * Source : scripts/data/cp_suisse.json + cp_france.json + cp_geo.json (lat/lng).
 * Pas de DB, pas de réseau — instantané.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import cpSuisse from '@/scripts/data/cp_suisse.json'
import cpFrance from '@/scripts/data/cp_france.json'
import cpGeo from '@/scripts/data/cp_geo.json'

export const runtime = 'nodejs'

type CpEntry = [string, string]
type GeoEntry = [number, number]

const CP_CH = cpSuisse as unknown as Record<string, CpEntry>
const CP_FR = cpFrance as unknown as Record<string, CpEntry>
const CP_GEO = (() => {
  const out: Record<string, GeoEntry> = {}
  for (const [k, v] of Object.entries(cpGeo as Record<string, unknown>)) {
    if (k.startsWith('_')) continue
    out[k] = v as GeoEntry
  }
  return out
})()

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function normalizeKey(s: string): string {
  return stripAccents(s).toLowerCase().trim()
}

// Strip postal-annex suffixes : "Lausanne 10", "Genève 15 Aéroport", "Lausanne Adm cant", etc.
function canonicalVille(label: string): string {
  let v = label.trim()
  v = v.replace(/\s+\d+(\s+.*)?$/, '')
  v = v.replace(/\s+(Adm cant.*|Services .*|Centre .*|Tri .*)$/i, '')
  return v.trim() || label.trim()
}

// Reverse map { cp_num → label } trié par CP, pour fallback "CP non répertorié dans cp_suisse"
type CpListEntry = { cp: string; cpNum: number; label: string }
function buildCpList(dict: Record<string, CpEntry>): CpListEntry[] {
  const list: CpListEntry[] = []
  for (const [, entry] of Object.entries(dict)) {
    const cpNum = parseInt(entry[0], 10)
    if (Number.isFinite(cpNum)) list.push({ cp: entry[0], cpNum, label: entry[1] })
  }
  list.sort((a, b) => a.cpNum - b.cpNum)
  return list
}
const CH_CPS = buildCpList(CP_CH)
const FR_CPS = buildCpList(CP_FR)

// Trouve la ville pour un CP donné. Exact match si existant, sinon CP le plus proche numériquement.
function lookupVille(cp: string, list: CpListEntry[]): string {
  const cpNum = parseInt(cp, 10)
  if (!Number.isFinite(cpNum) || list.length === 0) return ''
  const exact = list.find(e => e.cp === cp)
  if (exact) return exact.label
  let best = list[0]
  let bestDist = Math.abs(best.cpNum - cpNum)
  for (const e of list) {
    const d = Math.abs(e.cpNum - cpNum)
    if (d < bestDist) { bestDist = d; best = e }
  }
  return best.label
}

interface Suggestion {
  label: string
  cp: string
  ville: string
  pays: 'Suisse' | 'France'
  lat: number
  lng: number
}

export async function GET(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json([])

  const qNorm = normalizeKey(q)
  const isNumeric = /^\d+$/.test(q)
  const results: Suggestion[] = []

  if (isNumeric) {
    // Recherche par CP : itère cp_geo (toutes les CPs réelles) + label via cp_suisse/cp_france
    for (const [k, geo] of Object.entries(CP_GEO)) {
      if (results.length >= 100) break
      const idx = k.indexOf(':')
      if (idx < 0) continue
      const cc = k.slice(0, idx)
      const cp = k.slice(idx + 1)
      if (!cp.startsWith(q)) continue
      const country: 'Suisse' | 'France' = cc === 'ch' ? 'Suisse' : 'France'
      const list = cc === 'ch' ? CH_CPS : FR_CPS
      const villeRaw = lookupVille(cp, list)
      const ville = canonicalVille(villeRaw)
      results.push({ label: '', cp, ville, pays: country, lat: geo[0], lng: geo[1] })
    }
    // Tri : exact CP > préfixe ; CH avant FR ; CP ASC
    results.sort((a, b) => {
      const aExact = a.cp === q ? 0 : 1
      const bExact = b.cp === q ? 0 : 1
      if (aExact !== bExact) return aExact - bExact
      if (a.pays !== b.pays) return a.pays === 'Suisse' ? -1 : 1
      return a.cp.localeCompare(b.cp)
    })
    const out = results.slice(0, 8).map(s => ({ ...s, label: `${s.cp} ${s.ville}, ${s.pays}`.replace(/, , /, ', ').trim() }))
    return NextResponse.json(out)
  }

  // Recherche par ville : préfixe sur clé normalisée + dédup par ville canonique
  function search(dict: Record<string, CpEntry>, country: 'Suisse' | 'France', cc: 'ch' | 'fr') {
    for (const [key, entry] of Object.entries(dict)) {
      if (results.length >= 300) break
      if (!key.startsWith(qNorm)) continue
      const [cp, label] = entry
      const geo = CP_GEO[`${cc}:${cp}`]
      if (!geo) continue
      results.push({ label: '', cp, ville: label, pays: country, lat: geo[0], lng: geo[1] })
    }
  }
  search(CP_CH, 'Suisse', 'ch')
  search(CP_FR, 'France', 'fr')

  // Tri : exact match canonique > préfixe ; CH avant FR ; ville ASC ; CP ASC (dédup garde le + petit)
  results.sort((a, b) => {
    const aCan = normalizeKey(canonicalVille(a.ville))
    const bCan = normalizeKey(canonicalVille(b.ville))
    const aExact = aCan === qNorm ? 0 : 1
    const bExact = bCan === qNorm ? 0 : 1
    if (aExact !== bExact) return aExact - bExact
    if (a.pays !== b.pays) return a.pays === 'Suisse' ? -1 : 1
    if (aCan !== bCan) return aCan.localeCompare(bCan)
    return a.cp.localeCompare(b.cp)
  })

  // Dédup par ville canonique
  const seen = new Set<string>()
  const deduped: Suggestion[] = []
  for (const s of results) {
    const canon = canonicalVille(s.ville)
    const key = `${normalizeKey(canon)}|${s.pays}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push({ ...s, ville: canon, label: `${canon}, ${s.pays}` })
    if (deduped.length >= 8) break
  }

  return NextResponse.json(deduped)
}
