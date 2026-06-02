// TalentFlow Rapports — Layout PUBLIC (hors dashboard)
// v2.3.x — aligné EXACTEMENT sur app/sign/layout.tsx pour cohérence design v2.
// Pas de sidebar, pas de TopBar : uniquement la page rapport candidat ou client.

import type { Metadata, Viewport } from 'next'
import { DM_Sans } from 'next/font/google'
import '../globals.css'
import ServiceWorkerRegister from '@/components/report/ServiceWorkerRegister'

const jakarta = DM_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Rapport hebdomadaire — L-Agence SA',
  description: 'Soumettez votre rapport d\'heures hebdomadaire en toute sécurité',
  // v2.9.35 — PWA portail rapport candidat (« TalentFlow Rapport », installable)
  applicationName: 'TalentFlow Rapport',
  manifest: '/report.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'TalentFlow Rapport',
    statusBarStyle: 'default',
  },
  // v2.9.37 — Favicon + icône PWA dédiés « TalentFlow Rapport » (éclair + document)
  icons: {
    icon: '/report-icon.svg',
    apple: '/report-icon-192.png',
  },
  openGraph: {
    title: 'Rapport hebdomadaire — L-Agence SA',
    description: 'Soumettez votre rapport d\'heures hebdomadaire en toute sécurité',
    siteName: 'TalentFlow Sign',
    images: [
      {
        url: 'https://www.talent-flow.ch/og-image.png',
        width: 1200,
        height: 630,
        alt: 'L-Agence SA — Rapports & Signatures',
      },
    ],
    locale: 'fr_CH',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Rapport hebdomadaire — L-Agence SA',
    description: 'Soumettez votre rapport d\'heures hebdomadaire en toute sécurité',
    images: ['https://www.talent-flow.ch/og-image.png'],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#EAB308',
}

export default function ReportPublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body
        className={jakarta.variable}
        style={{
          margin: 0,
          minHeight: '100vh',
          background: '#FAFAF7',
          // v2.10.17 — Portail conçu en clair uniquement : empêche Android Chrome
          // (Auto Dark Theme) / iOS d'inverser les couleurs (sinon signature au
          // doigt invisible, champs assombris, etc.).
          colorScheme: 'light',
          fontFamily: 'var(--font-jakarta), system-ui, -apple-system, sans-serif',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        }}
      >
        {children}
        {/* v2.9.35 — PWA : enregistrement SW. v2.10.13 — Bandeau « Installer
            l'application » retiré : on a désormais l'app native TalentFlow Sign ;
            le web reste pour les missions ponctuelles. */}
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}
