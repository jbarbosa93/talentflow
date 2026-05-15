// TalentFlow Service Worker — KILL SWITCH v2.8.6
//
// Un cache de Service Worker corrompu peut servir une réponse contenant des
// cookies énormes accumulés → REQUEST_HEADER_TOO_LARGE (494 Vercel).
//
// Ce SW se désinscrit automatiquement et purge tous les caches au prochain
// chargement. Permet de résoudre le 494 sans demander à chaque user de
// faire "Clear site data" manuellement.
//
// Pour réactiver le PWA plus tard, restaurer le SW depuis l'historique git
// (version avant 2026-05-15).

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 1. Purge tous les caches
    try {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    } catch { /* silent */ }

    // 2. Désinscrit le SW
    try {
      await self.registration.unregister()
    } catch { /* silent */ }

    // 3. Force reload de tous les clients ouverts (sans le SW cette fois)
    try {
      const clients = await self.clients.matchAll({ type: 'window' })
      for (const client of clients) {
        client.navigate(client.url)
      }
    } catch { /* silent */ }
  })())
})

// Pas de fetch handler → le browser passe les requêtes en direct (sans cache)
