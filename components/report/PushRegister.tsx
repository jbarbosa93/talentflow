'use client'

// TalentFlow — Enregistrement du token push (C2)
// v2.10.22 — L'app native ajoute ?pt=<token>&plat=<ios|android> à l'URL du portail.
// Ce composant (monté sur les layouts /report et /client-portal) :
//   1. lit ?pt= / ?plat=, le mémorise en sessionStorage, nettoie l'URL.
//   2. POST /api/push/register → l'endpoint lie le token au compte connecté.
//   3. une fois LIÉ (utilisateur connecté), arrête de réessayer.
// Aucun effet hors app native (pas de token → ne fait rien).

import { useEffect } from 'react'

export default function PushRegister() {
  useEffect(() => {
    try {
      const url = new URL(window.location.href)
      const pt = url.searchParams.get('pt')
      const plat = url.searchParams.get('plat')
      if (pt) {
        sessionStorage.setItem('tf_pt', pt)
        if (plat) sessionStorage.setItem('tf_plat', plat)
        // Nettoie l'URL (retire pt/plat) sans recharger
        url.searchParams.delete('pt')
        url.searchParams.delete('plat')
        window.history.replaceState({}, '', url.toString())
      }

      const token = sessionStorage.getItem('tf_pt')
      if (!token) return
      const platform = sessionStorage.getItem('tf_plat') || 'android'

      fetch('/api/push/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, platform }),
      })
        .then(r => r.json())
        .then(res => {
          // Lié au compte (utilisateur connecté) → plus besoin de réessayer.
          if (res && res.linked) sessionStorage.removeItem('tf_pt')
        })
        .catch(() => { /* silencieux */ })
    } catch { /* silencieux */ }
  }, [])

  return null
}
