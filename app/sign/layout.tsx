// TalentFlow Sign — Layout PUBLIC (hors dashboard)
// v2.2.0 — Phase 3 (mobile-first + html/body root)
// Pas de sidebar, pas de TopBar : uniquement le contenu de signature.

import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import '../globals.css'

const jakarta = DM_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Signature électronique — L-Agence SA',
  description: 'Signez votre document en toute sécurité',
  icons: {
    icon: '/icon.svg',
    apple: '/icon-192.png',
  },
  themeColor: '#EAB308',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=5',
}

export default function SignPublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body
        className={jakarta.variable}
        style={{
          margin: 0,
          minHeight: '100vh',
          background: '#FAFAF7',
          fontFamily: 'var(--font-jakarta), system-ui, -apple-system, sans-serif',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        }}
      >
        {children}
      </body>
    </html>
  )
}
