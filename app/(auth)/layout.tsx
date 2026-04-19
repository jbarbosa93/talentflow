import { Plus_Jakarta_Sans } from 'next/font/google'
import type { Metadata } from 'next'
import '../globals.css'
import './auth.css'
import { SpeedInsights } from '@vercel/speed-insights/next'

const jakarta = Plus_Jakarta_Sans({
  variable: '--font-jakarta',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'TalentFlow — Connexion',
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={jakarta.variable}>
        {children}
        <SpeedInsights />
      </body>
    </html>
  )
}
