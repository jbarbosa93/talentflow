// TalentFlow Service Worker — PWA support
const CACHE_NAME = 'talentflow-v1'

// Install — pré-cache les assets essentiels
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([
        '/',
        '/icon.svg',
        '/icon-192.png',
        '/icon-512.png',
        '/manifest.json',
      ])
    )
  )
  self.skipWaiting()
})

// Activate — nettoyage des anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch — network-first pour les pages, cache-first pour les assets
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Ignore les requêtes non-GET et les API Supabase
  if (request.method !== 'GET') return
  if (url.hostname.includes('supabase')) return
  if (url.pathname.startsWith('/api/')) return

  // Assets statiques → cache-first
  if (url.pathname.match(/\.(js|css|png|jpg|svg|woff2?|ico)$/)) {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached || fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        })
      )
    )
    return
  }

  // Pages HTML → network-first avec fallback cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return response
      })
      .catch(() => caches.match(request))
  )
})
