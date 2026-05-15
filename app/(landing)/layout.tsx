import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import { SpeedInsights } from '@vercel/speed-insights/next'
import '../globals.css'
import './landing.css'

const jakarta = DM_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'TalentFlow — ATS pour les agences de recrutement',
  description: 'Gérez vos candidats, offres et entretiens. Analyse IA des CVs et matching automatique.',
  icons: {
    icon: '/icon.svg',
    apple: '/icon-192.png',
  },
  manifest: '/manifest.json',
  themeColor: '#F5A623',
}

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className={jakarta.variable}>
        {children}
        <SpeedInsights />
        {/* v2.8.6 — Service Worker DÉSACTIVÉ temporairement.
            Cause : caches SW corrompus pouvaient servir des réponses avec
            cookies énormes accumulés → REQUEST_HEADER_TOO_LARGE (494 Vercel).
            Le script ci-dessous unregister tout SW existant + purge les caches
            sur tous les browsers qui visitent talent-flow.ch. */}
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then((regs) => {
              regs.forEach((reg) => reg.unregister().catch(() => {}))
            }).catch(() => {})
            if (window.caches) {
              caches.keys().then((keys) => {
                keys.forEach((k) => caches.delete(k).catch(() => {}))
              }).catch(() => {})
            }
          }
        `}} />
      </body>
    </html>
  )
}
