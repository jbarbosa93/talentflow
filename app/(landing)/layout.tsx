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
}

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={jakarta.variable}>
        {children}
      </body>
    </html>
  )
}
