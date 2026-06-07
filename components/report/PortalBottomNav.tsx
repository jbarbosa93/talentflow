'use client'

// TalentFlow Sign — Barre de navigation basse du portail candidat (/report).
// v2.10.35 — Onglets : Accueil · Rapports · Documents · Profil · Paramètres.
// Additif : s'auto-masque sur les pages d'auth (login/set-password), les pages
// client, et quand aucune session candidat n'est active. Ne touche pas aux flux
// existants (le PDF/wizard scrolle au-dessus, la barre est fixée en bas).

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Home, FileText, FolderOpen, User, Settings } from 'lucide-react'

export default function PortalBottomNav() {
  const pathname = usePathname() || ''
  const router = useRouter()
  const [slug, setSlug] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  // Masqué sur les pages d'auth + pages client (pas de session candidat utile).
  const hidden =
    pathname.startsWith('/report/login') ||
    pathname.startsWith('/report/set-password') ||
    pathname.startsWith('/report/client')

  useEffect(() => {
    if (hidden) return
    let active = true
    fetch('/api/portal-auth/me?type=candidat&full=1')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (active) { setSlug(d?.targetSlug || null); setReady(!!d) } })
      .catch(() => {})
    return () => { active = false }
  }, [hidden, pathname])

  // Réserve l'espace en bas SEULEMENT quand la barre est visible (ne touche pas
  // les autres pages : pas de padding inutile sur login/client).
  const visible = !hidden && ready
  useEffect(() => {
    if (visible) {
      document.body.style.paddingBottom = 'calc(66px + env(safe-area-inset-bottom, 0px))'
      return () => { document.body.style.paddingBottom = '' }
    }
  }, [visible])

  if (!visible) return null

  const home = slug ? `/report/${slug}` : '/report'
  const tabs = [
    { key: 'home', label: 'Accueil', icon: Home, href: home, match: (p: string) => !!slug && p === `/report/${slug}` },
    { key: 'rapports', label: 'Rapports', icon: FileText, href: home, match: () => false },
    { key: 'documents', label: 'Documents', icon: FolderOpen, href: '/report/documents', match: (p: string) => p.startsWith('/report/documents') },
    { key: 'profil', label: 'Profil', icon: User, href: '/report/profil', match: (p: string) => p.startsWith('/report/profil') },
    { key: 'params', label: 'Paramètres', icon: Settings, href: '/report/account', match: (p: string) => p.startsWith('/report/account') },
  ]

  return (
    <nav
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50,
        background: '#fff', borderTop: '1px solid #ECEAE3',
        display: 'flex', justifyContent: 'space-around', alignItems: 'stretch',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        boxShadow: '0 -2px 12px rgba(0,0,0,0.04)',
      }}
    >
      {tabs.map(t => {
        const on = t.match(pathname)
        const Icon = t.icon
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => router.push(t.href)}
            style={{
              flex: 1, border: 'none', background: 'transparent', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 3, padding: '8px 2px 10px', fontFamily: 'inherit',
              color: on ? '#1C1A14' : '#9A958A',
            }}
          >
            <Icon size={21} strokeWidth={on ? 2.4 : 1.9} color={on ? '#EAB308' : '#9A958A'} />
            <span style={{ fontSize: 10.5, fontWeight: on ? 700 : 500 }}>{t.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
