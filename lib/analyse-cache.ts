// lib/analyse-cache.ts
// v1.9.21 — Cache in-memory court (TTL 5 min) des analyses Claude, keyé par storage_path.
//
// Contexte : quand /api/cv/parse détecte un match manuel (non bulk), il retourne
// `confirmation_required` pour afficher la modale UI. Si l'utilisateur valide
// (Update ou Create new) dans les 5 minutes, la 2e requête `/api/cv/parse`
// (avec `skip_confirmation:true`) récupère l'analyse cachée — zéro appel Claude.
//
// Scope :
//   - Cache Node.js in-memory (Map) — partagé entre requêtes sur la MÊME instance serverless.
//   - Sur Vercel, en cas de cold start ou nouvelle instance, le cache est absent → re-analyse
//     fallback automatique (~$0.01/CV). Acceptable : l'économie est un bonus, pas une garantie.
//   - Pas de Redis/externe — KISS. On veut zéro dépendance nouvelle.
//
// TTL : 5 minutes. Suffisant pour un utilisateur qui regarde une modale et clique.
// Au-delà, re-analyse (cas rare : user laisse l'onglet ouvert, va manger, revient).

export type CachedAnalyse = {
  analyse: any
  texteCV: string
  photoUrl: string | null
  docType: string
  filenameEffectif: string
  autresDocumentsMultiType: any[]
}

type CacheEntry = CachedAnalyse & { expires: number }

const cache = new Map<string, CacheEntry>()
const TTL_MS = 5 * 60 * 1000
const MAX_ENTRIES = 200 // garde-fou mémoire (~50-200KB par entrée avec texteCV)

export function getCachedAnalyse(storagePath: string | null | undefined): CachedAnalyse | null {
  if (!storagePath) return null
  const entry = cache.get(storagePath)
  if (!entry) return null
  if (Date.now() > entry.expires) {
    cache.delete(storagePath)
    return null
  }
  const { expires: _expires, ...rest } = entry
  return rest
}

export function setCachedAnalyse(storagePath: string | null | undefined, data: CachedAnalyse): void {
  if (!storagePath) return
  // Cleanup opportuniste si le cache devient trop gros
  if (cache.size >= MAX_ENTRIES) {
    const now = Date.now()
    for (const [k, v] of cache) {
      if (now > v.expires) cache.delete(k)
    }
    // Si toujours trop : drop le plus ancien (ordre d'insertion Map)
    if (cache.size >= MAX_ENTRIES) {
      const firstKey = cache.keys().next().value
      if (firstKey) cache.delete(firstKey)
    }
  }
  cache.set(storagePath, { ...data, expires: Date.now() + TTL_MS })
}

export function invalidateCachedAnalyse(storagePath: string | null | undefined): void {
  if (!storagePath) return
  cache.delete(storagePath)
}
