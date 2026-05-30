// TalentFlow Portail Client — Layout PUBLIC (hors dashboard)
// v2.7.0 — Aligné sur app/report/layout.tsx pour cohérence design v2.

import type { Metadata, Viewport } from 'next'
import { DM_Sans, Instrument_Serif } from 'next/font/google'
import '../globals.css'

const jakarta = DM_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  variable: '--font-instrument-serif',
  weight: '400',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Portail Collaborateurs — L-Agence SA',
  description: 'Documents et conformité des collaborateurs en mission',
  icons: {
    icon: '/icon.svg',
    apple: '/icon-192.png',
  },
  robots: {
    index: false,
    follow: false,
  },
  // v2.9.92 — Aperçu de lien (WhatsApp/iMessage) : carte L-Agence
  openGraph: {
    title: 'Portail Collaborateurs — L-Agence SA',
    description: 'Validez les rapports d\'heures de vos collaborateurs en mission',
    siteName: 'TalentFlow',
    images: [{ url: 'https://www.talent-flow.ch/og-image.png', width: 1200, height: 630, alt: 'L-Agence SA' }],
    locale: 'fr_CH',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Portail Collaborateurs — L-Agence SA',
    description: 'Validez les rapports d\'heures de vos collaborateurs en mission',
    images: ['https://www.talent-flow.ch/og-image.png'],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#EAB308',
}

export default function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body
        className={`${jakarta.variable} ${instrumentSerif.variable}`}
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
