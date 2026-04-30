// lib/secteurs-config-server.ts
// v1.9.122 — Helper serveur pour récupérer la taxonomie secteurs depuis la table
// `secteurs_activite_config`. Cache module-level avec TTL 60s pour éviter de
// re-fetch à chaque request d'API.
//
// Utilisé par /api/clients POST/PATCH (extractSecteursFromClient + sanitizeSecteurs).

import { createAdminClient } from '@/lib/supabase/admin'
import { SECTEURS_ACTIVITE } from '@/lib/secteurs-extractor'

interface CacheEntry {
  list: string[]
  metierMap: Map<string, string | null>
  fetchedAt: number
}

const TTL_MS = 60_000 // 1 minute
let cache: CacheEntry | null = null

/**
 * Retourne la liste des secteurs configurés en DB (triés par ordre).
 * Fallback sur la constante SECTEURS_ACTIVITE si DB indispo / vide.
 * Cache 60 secondes.
 */
export async function getSecteursConfigList(): Promise<string[]> {
  const now = Date.now()
  if (cache && now - cache.fetchedAt < TTL_MS) return cache.list

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('secteurs_activite_config' as any)
      .select('nom, ordre, metier_representatif')
      .order('ordre', { ascending: true })
      .order('nom', { ascending: true })

    if (error || !data || data.length === 0) {
      // Fallback constante
      cache = {
        list: SECTEURS_ACTIVITE.slice() as string[],
        metierMap: new Map(),
        fetchedAt: now,
      }
      return cache.list
    }

    const list = (data as any[]).map(r => r.nom as string)
    const metierMap = new Map<string, string | null>(
      (data as any[]).map(r => [r.nom as string, (r.metier_representatif as string | null) ?? null]),
    )
    cache = { list, metierMap, fetchedAt: now }
    return list
  } catch {
    // Fallback constante
    cache = {
      list: SECTEURS_ACTIVITE.slice() as string[],
      metierMap: new Map(),
      fetchedAt: now,
    }
    return cache.list
  }
}

/** Force le refresh du cache (à appeler après mutations CRUD). */
export function invalidateSecteursCache(): void {
  cache = null
}
