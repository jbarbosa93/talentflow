'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard, Users, Briefcase, KanbanSquare,
  Sparkles, Settings, Calendar, Mail, Plug, LogOut, UserCheck, Shield,
  Upload, Loader2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useImport } from '@/contexts/ImportContext'

const NAV_ITEMS = [
  { href: '/dashboard',  label: 'Tableau de bord', icon: LayoutDashboard, exact: true },
  { href: '/candidats',  label: 'Candidats',        icon: Users },
  { href: '/offres',     label: 'Offres',            icon: Briefcase },
  { href: '/pipeline',   label: 'Pipeline',          icon: KanbanSquare },
  { href: '/entretiens', label: 'Entretiens',        icon: Calendar },
  { href: '/messages',   label: 'Messages',          icon: Mail },
  { href: '/matching',   label: 'Matching IA',       icon: Sparkles },
]

const FOOTER_ITEMS = [
  { href: '/integrations',               label: 'Intégrations',      icon: Plug },
  { href: '/parametres/demandes-acces',  label: 'Demandes d\'accès', icon: UserCheck, adminOnly: true },
  { href: '/parametres/admin',           label: 'Administration',    icon: Shield,    adminOnly: true },
  { href: '/parametres',                 label: 'Paramètres',        icon: Settings },
]

const ADMIN_EMAIL = 'j.barbosa@l-agence.ch'

export function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()
  const importCtx = useImport()

  const { data: user } = useQuery({
    queryKey: ['current-user'],
    queryFn: async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      return user
    },
    staleTime: 60_000,
  })

  const prenom     = user?.user_metadata?.prenom     || ''
  const nom        = user?.user_metadata?.nom        || ''
  const entreprise = user?.user_metadata?.entreprise || ''
  const fullName   = [prenom, nom].filter(Boolean).join(' ') || user?.email?.split('@')[0] || 'Utilisateur'
  const initiales  = `${prenom[0] || ''}${nom[0] || ''}`.toUpperCase() || fullName[0]?.toUpperCase() || 'U'

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href
    if (pathname === href) return true
    if (!pathname.startsWith(href + '/')) return false
    // Éviter que /parametres soit actif quand on est sur /parametres/admin ou /parametres/demandes-acces
    // (ces sous-pages ont leur propre item de menu)
    const allHrefs = [...NAV_ITEMS, ...FOOTER_ITEMS].map(i => i.href)
    const moreSpecific = allHrefs.some(h => h !== href && h.startsWith(href + '/') && pathname.startsWith(h))
    return !moreSpecific
  }

  async function handleLogout() {
    // POST vers la route serveur qui efface les cookies httpOnly (le client JS ne peut pas)
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  // Show import progress only when NOT on the import page
  const isImportPage = pathname === '/parametres/import-masse'
  const showImportBadge = importCtx.running && !isImportPage && importCtx.total > 0

  return (
    <aside className="d-sidebar">
      {/* Logo */}
      <Link href="/dashboard" className="d-sidebar-logo" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="d-sidebar-dot" />
          TalentFlow
        </div>
        {entreprise && (
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginLeft: 20, marginTop: 1 }}>
            {entreprise}
          </span>
        )}
      </Link>

      {/* Import progress badge — visible when import runs in background */}
      {showImportBadge && (
        <Link href="/parametres/import-masse" style={{ textDecoration: 'none' }}>
          <div style={{
            margin: '0 12px 8px',
            background: 'rgba(245,166,35,0.12)',
            border: '1.5px solid rgba(245,166,35,0.35)',
            borderRadius: 10,
            padding: '10px 12px',
            cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Loader2 size={13} color="#F5A623" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#F5A623' }}>Import en cours</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginLeft: 'auto' }}>
                {importCtx.progress}%
              </span>
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${importCtx.progress}%`,
                background: 'linear-gradient(90deg, #F5A623, #F97316)',
                borderRadius: 99,
                transition: 'width 0.5s ease',
              }} />
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 5 }}>
              {importCtx.completed}/{importCtx.total} CVs traités · {importCtx.succeeded} importés
            </div>
          </div>
        </Link>
      )}

      {/* Main nav */}
      <nav className="d-sidebar-nav">
        <span className="d-sidebar-section">Menu</span>
        {NAV_ITEMS.map(item => {
          const Icon = item.icon
          const active = isActive(item.href, item.exact)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`d-nav-link${active ? ' active' : ''}`}
            >
              <Icon className="d-nav-icon" strokeWidth={active ? 2.5 : 2} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="d-sidebar-footer">
        <span className="d-sidebar-section" style={{ margin: '0 0 6px' }}>Compte</span>
        {FOOTER_ITEMS.filter(item => !item.adminOnly || user?.email === ADMIN_EMAIL).map(item => {
          const Icon = item.icon
          const active = isActive(item.href, (item as any).exact)
          // Show import icon on Paramètres item when running
          const isParams = item.href === '/parametres'
          const showDot = importCtx.running && isParams
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`d-nav-link${active ? ' active' : ''}`}
              style={{ position: 'relative' }}
            >
              <Icon className="d-nav-icon" strokeWidth={active ? 2.5 : 2} />
              {item.label}
              {showDot && (
                <span style={{
                  marginLeft: 'auto', width: 7, height: 7, borderRadius: '50%',
                  background: '#F5A623', flexShrink: 0,
                  animation: 'pulse 2s infinite',
                }} />
              )}
            </Link>
          )
        })}

        {/* User card */}
        <div className="d-user-card">
          <div className="d-user-avatar">{initiales}</div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div className="d-user-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fullName}
            </div>
            <div className="d-user-role">Consultant</div>
            {entreprise && (
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entreprise}
              </div>
            )}
            <button
              onClick={handleLogout}
              title="Se déconnecter"
              style={{
                marginTop: 6, background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,0.4)', padding: 0, borderRadius: 0,
                display: 'flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
                transition: 'color 0.15s', fontSize: 10, fontWeight: 500,
              }}
              onMouseOver={e => { e.currentTarget.style.color = '#F5A623' }}
              onMouseOut={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)' }}
            >
              <LogOut size={11} />
              <span>Se déconnecter</span>
            </button>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </aside>
  )
}
