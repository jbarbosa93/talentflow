'use client'

// TalentFlow Rapport — Enregistrement du service worker PWA + mémoire du lien
// v2.9.35
//
// - Enregistre /sw-report.js (scope /report) → rend le portail installable.
// - Mémorise le dernier rapport ouvert (slug) dans localStorage : sert à la
//   page d'entrée /report (l'app installée s'ouvre dessus côté Android).

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

export const REPORT_LAST_SLUG_KEY = 'tf_report_last'
const RESERVED = new Set(['login', 'set-password', 'account', 'client'])

export default function ServiceWorkerRegister() {
  const pathname = usePathname()

  // Enregistrement du SW (une seule fois)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker
      .register('/sw-report.js', { scope: '/report' })
      .catch(() => { /* silencieux — l'install PWA reste optionnelle */ })
  }, [])

  // Mémorise le slug du rapport candidat courant
  useEffect(() => {
    if (!pathname) return
    const m = pathname.match(/^\/report\/([^/]+)\/?$/)
    const slug = m?.[1]
    if (slug && !RESERVED.has(slug)) {
      try { localStorage.setItem(REPORT_LAST_SLUG_KEY, slug) } catch { /* silencieux */ }
    }
  }, [pathname])

  return null
}
