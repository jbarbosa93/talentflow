'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard, Users, Briefcase, KanbanSquare,
  Sparkles, Settings, Calendar, Mail, Plug, LogOut
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

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
  { href: '/integrations', label: 'Intégrations', icon: Plug },
  { href: '/parametres',   label: 'Paramètres',   icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()

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
    return pathname === href || pathname.startsWith(href + '/')
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

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
        {FOOTER_ITEMS.map(item => {
          const Icon = item.icon
          const active = isActive(item.href)
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

        {/* User card */}
        <div className="d-user-card">
          <div className="d-user-avatar">{initiales}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="d-user-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fullName}
            </div>
            <div className="d-user-role">Consultant</div>
            {entreprise && (
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                {entreprise}
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            title="Se déconnecter"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.35)', padding: 4, borderRadius: 6,
              display: 'flex', alignItems: 'center', flexShrink: 0,
              transition: 'color 0.15s',
            }}
            onMouseOver={e => (e.currentTarget.style.color = '#F5A623')}
            onMouseOut={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  )
}
