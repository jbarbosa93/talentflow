// lib/cp-to-ville.ts
// v1.9.114 — Lookup CP → Ville (Suisse + France) pour le filtre NPA de /clients.
//
// Source : datasets geonames officiels chargés au module-level.
// Bug fix : taper "1000" (Lausanne) doit matcher TOUS les CPs Lausanne
// (1000-1018), pas seulement ceux qui contiennent littéralement "1000".

import cpSuisse from '../scripts/data/cp_suisse.json'
import cpFrance from '../scripts/data/cp_france.json'

// Format des datasets : { "slug": [cp, ville] } (TS infère string[], on cast à l'usage)
type CpDataset = Record<string, string[]>

// Map inverse CP → Ville normalisée, construite au load. Une seule fois.
const cpToVilleMap: Map<string, string> = (() => {
  const map = new Map<string, string>()

  const ingest = (ds: CpDataset) => {
    for (const entry of Object.values(ds)) {
      if (!Array.isArray(entry) || entry.length < 2) continue
      const [cp, villeRaw] = entry
      if (!cp || !villeRaw) continue
      // Strip trailing space + digits (ex: "Lausanne 1" → "Lausanne",
      // "Genève 12" → "Genève") pour ne garder que le nom de la commune.
      const ville = villeRaw.replace(/\s+\d+$/, '').trim()
      // Premier match gagnant — un CP peut avoir plusieurs entrées (variantes)
      if (!map.has(cp)) map.set(cp, ville)
    }
  }

  ingest(cpSuisse as unknown as CpDataset)
  ingest(cpFrance as unknown as CpDataset)

  return map
})()

/**
 * Retourne le nom de la ville pour un CP donné, ou null si inconnu.
 * Ex : "1000" → "Lausanne", "1870" → "Monthey", "999" → null.
 */
export function getVilleFromCp(cp: string): string | null {
  if (!cp) return null
  return cpToVilleMap.get(cp.trim()) || null
}
