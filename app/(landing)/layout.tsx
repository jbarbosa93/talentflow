import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import '../globals.css'
import './landing.css'

const jakarta = Plus_Jakarta_Sans({
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
  themeColor: '#F7C948',
}

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className={jakarta.variable}>
        {children}
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(() => {})
          }
        `}} />
      </body>
    </html>
  )
}
