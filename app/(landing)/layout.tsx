import type { Metadata } from 'next'
import { Nunito, Fraunces } from 'next/font/google'
import '../globals.css'
import './landing.css'

const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-heading',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'TalentFlow — ATS pour les agences de recrutement',
  description: 'Gérez vos candidats, offres et entretiens. Analyse IA des CVs et matching automatique.',
}

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${nunito.variable} ${fraunces.variable}`}>
        {children}
      </body>
    </html>
  )
}
