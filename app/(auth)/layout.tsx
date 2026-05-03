import { DM_Sans, Instrument_Serif, JetBrains_Mono } from 'next/font/google'
import type { Metadata } from 'next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import '../globals.css'
import './auth.css'

const jakarta = DM_Sans({
  variable: '--font-jakarta',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

// v1.9.127 — Mêmes fonts que (dashboard) pour cohérence design v2 (login + auth)
const instrumentSerif = Instrument_Serif({
  variable: '--font-instrument-serif',
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'TalentFlow — Connexion',
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${jakarta.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable}`}>
        {children}
        <SpeedInsights />
      </body>
    </html>
  )
}
