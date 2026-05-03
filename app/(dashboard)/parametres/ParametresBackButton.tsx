'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

// v1.9.127 — Bouton retour intelligent.
// v2.0.1 — Routes considérées comme outils → "Retour à outils" au lieu de "Retour aux paramètres".
//          Liste cohérente avec /outils/page.tsx (OUTILS array).
const OUTILS_DANS_PARAMETRES = new Set([
  '/parametres/import-masse',
  '/parametres/doublons',
  '/parametres/corriger-photos',
])

export default function ParametresBackButton() {
  const pathname = usePathname()
  if (!pathname || pathname === '/parametres' || pathname === '/parametres/') return null

  const isOutil = OUTILS_DANS_PARAMETRES.has(pathname)
  const href = isOutil ? '/outils' : '/parametres'
  const label = isOutil ? 'Retour à outils' : 'Retour aux paramètres'

  return (
    <div style={{
      maxWidth: 1400, margin: '0 auto',
      padding: '20px 32px 0',
      fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
    }}>
      <Link
        href={href}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          height: 32, padding: '0 12px', borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--surface, var(--card))',
          color: 'var(--muted)',
          fontSize: 13, fontWeight: 500,
          textDecoration: 'none',
          transition: 'border-color 0.15s, color 0.15s, background 0.15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = 'var(--primary)'
          e.currentTarget.style.color = 'var(--foreground)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = 'var(--border)'
          e.currentTarget.style.color = 'var(--muted)'
        }}
      >
        <ArrowLeft size={14} />
        {label}
      </Link>
    </div>
  )
}
