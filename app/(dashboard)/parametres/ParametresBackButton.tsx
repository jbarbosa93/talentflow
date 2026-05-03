'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

// v1.9.127 — Bouton retour vers /parametres (hub) sur toutes les sous-pages.
// Caché sur /parametres lui-même (= hub).
export default function ParametresBackButton() {
  const pathname = usePathname()
  if (!pathname || pathname === '/parametres' || pathname === '/parametres/') return null

  return (
    <div style={{
      maxWidth: 1400, margin: '0 auto',
      padding: '20px 32px 0',
      fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
    }}>
      <Link
        href="/parametres"
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
        Retour aux paramètres
      </Link>
    </div>
  )
}
