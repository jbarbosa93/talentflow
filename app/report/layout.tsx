// TalentFlow Rapports — Layout PUBLIC (hors dashboard)
// v2.3.x — aligné EXACTEMENT sur app/sign/layout.tsx pour cohérence design v2.
// Pas de sidebar, pas de TopBar : uniquement la page rapport candidat ou client.

import type { Metadata, Viewport } from 'next'
import { DM_Sans } from 'next/font/google'
import '../globals.css'
import ServiceWorkerRegister from '@/components/report/ServiceWorkerRegister'
import PwaInstallPrompt from '@/components/report/PwaInstallPrompt'

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
  // v2.3.x Bug 5+6 — Favicon + og:image L-Agence (au lieu du défaut Vercel)
  icons: {
    icon: '/icon.svg',
    apple: '/icon-192.png',
  },
  openGraph: {
    title: 'Rapport hebdomadaire — L-Agence SA',
    description: 'Soumettez votre rapport d\'heures hebdomadaire en toute sécurité',
    siteName: 'TalentFlow Sign',
    images: [
      {
        url: 'https://www.talent-flow.ch/email-logo.png',
        width: 800,
        height: 800,
        alt: 'L-Agence SA',
      },
    ],
    locale: 'fr_CH',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Rapport hebdomadaire — L-Agence SA',
    description: 'Soumettez votre rapport d\'heures hebdomadaire en toute sécurité',
    images: ['https://www.talent-flow.ch/email-logo.png'],
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
          fontFamily: 'var(--font-jakarta), system-ui, -apple-system, sans-serif',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        }}
      >
        {children}
        {/* v2.9.35 — PWA : enregistrement SW + bandeau d'installation */}
        <ServiceWorkerRegister />
        <PwaInstallPrompt />
      </body>
    </html>
  )
}
