// TalentFlow Rapport — Service Worker minimal (scope /report)
// v2.9.35
//
// RÔLE UNIQUE : rendre le portail rapport candidat « installable » comme une
// app (PWA). Ce SW NE MET RIEN EN CACHE.
//
// ⚠️ Voir public/sw.js (kill-switch) : un ancien SW qui cachait des réponses
// porteuses de cookies a provoqué des erreurs 494 (REQUEST_HEADER_TOO_LARGE)
// en production. Pour éviter toute récidive, ce SW n'utilise JAMAIS l'API
// `caches` et ne fait qu'un passthrough réseau pur.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Handler fetch volontairement vide → aucune interception, aucun cache.
// Sa simple présence suffit à signaler le portail comme « installable ».
self.addEventListener('fetch', () => {
  // passthrough réseau — le navigateur gère la requête normalement
})
