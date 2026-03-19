import { Nunito, Fraunces } from 'next/font/google'
import type { Metadata } from 'next'
import '../globals.css'
import './auth.css'

const nunito = Nunito({
  variable: '--font-nunito',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
})

const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
})

export const metadata: Metadata = {
  title: 'TalentFlow — Connexion',
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${nunito.variable} ${fraunces.variable}`}>
        {children}
      </body>
    </html>
  )
}
