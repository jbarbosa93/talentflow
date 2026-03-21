'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard, Users, Briefcase, KanbanSquare,
  Sparkles, Settings, Calendar, Mail, Plug, UserCheck, Shield,
  Upload, Loader2, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useImport } from '@/contexts/ImportContext'
import { useMatching } from '@/contexts/MatchingContext'
import { usePhotos } from '@/contexts/PhotosContext'
import { useDoublons } from '@/contexts/DoublonsContext'
import BetaBadge from '@/components/BetaBadge'

const NAV_ITEMS = [
  { href: '/dashboard',  label: 'Tableau de bord', icon: LayoutDashboard, exact: true },
  { href: '/candidats',  label: 'Candidats',        icon: Users },
  { href: '/offres',     label: 'Commandes',          icon: Briefcase },
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

export function Sidebar({ mobileOpen, onClose }: { mobileOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname()
  const importCtx = useImport()
  const matchingCtx = useMatching()
  const photosCtx = usePhotos()
  const doublonsCtx = useDoublons()

  const { data: user } = useQuery({
    queryKey: ['current-user'],
    queryFn: async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      return user
    },
    staleTime: 60_000,
  })

  const entreprise = user?.user_metadata?.entreprise || ''

  // Count candidats à traiter
  const { data: aTraiterCount } = useQuery({
    queryKey: ['candidats-a-traiter-count'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/candidats/init-import-status')
        if (!res.ok) return 0
        const data = await res.json()
        return data.a_traiter || 0
      } catch { return 0 }
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    placeholderData: 0,
  })

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href
    if (pathname === href) return true
    if (!pathname.startsWith(href + '/')) return false
    const allHrefs = [...NAV_ITEMS, ...FOOTER_ITEMS].map(i => i.href)
    const subRoutes = ['/candidats/a-traiter']
    const moreSpecific = [...allHrefs, ...subRoutes].some(h => h !== href && h.startsWith(href + '/') && pathname.startsWith(h))
    return !moreSpecific
  }

  // Show import progress only when NOT on the import page
  const isImportPage = pathname === '/parametres/import-masse'
  const showImportBadge = importCtx.running && !isImportPage && importCtx.total > 0

  // Show matching progress only when NOT on /matching
  const isMatchingPage = pathname === '/matching'
  const showMatchingBadge = (matchingCtx.phase === 'running' || matchingCtx.phase === 'paused') && !isMatchingPage && matchingCtx.total > 0

  // Show photos progress only when NOT on corriger-photos page
  const isPhotosPage = pathname === '/parametres/corriger-photos'
  const showPhotosBadge = (photosCtx.phase === 'running' || photosCtx.phase === 'paused') && !isPhotosPage && photosCtx.total > 0

  // Show doublons progress only when NOT on doublons page
  const isDoublonsPage = pathname === '/parametres/doublons'
  const showDoblonsBadge = (doublonsCtx.phase === 'loading' || doublonsCtx.phase === 'analysing') && !isDoublonsPage

  return (
    <aside className={`d-sidebar${mobileOpen ? ' is-open' : ''}`}>
      {/* Logo + mobile close */}
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

      {/* Matching progress badge — visible when analysis runs in background */}
      {showMatchingBadge && (
        <Link href="/matching" style={{ textDecoration: 'none' }}>
          <div style={{
            margin: '0 12px 8px',
            background: 'rgba(99,102,241,0.12)',
            border: `1.5px solid ${matchingCtx.phase === 'paused' ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.4)'}`,
            borderRadius: 10,
            padding: '10px 12px',
            cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              {matchingCtx.phase === 'paused'
                ? <span style={{ fontSize: 11, fontWeight: 700, color: '#818CF8' }}>⏸ Matching en pause</span>
                : <><Loader2 size={13} color="#818CF8" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                   <span style={{ fontSize: 11, fontWeight: 700, color: '#818CF8' }}>Matching IA</span></>
              }
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginLeft: 'auto' }}>
                {matchingCtx.progress}%
              </span>
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${matchingCtx.progress}%`,
                background: matchingCtx.phase === 'paused'
                  ? 'linear-gradient(90deg, #818CF8, #6366F1)'
                  : 'linear-gradient(90deg, #6366F1, #8B5CF6)',
                borderRadius: 99,
                transition: 'width 0.5s ease',
              }} />
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 5 }}>
              {matchingCtx.doneCount}/{matchingCtx.total} candidats · {matchingCtx.offreName}
            </div>
          </div>
        </Link>
      )}

      {/* Photos progress badge */}
      {showPhotosBadge && (
        <Link href="/parametres/corriger-photos" style={{ textDecoration: 'none' }}>
          <div style={{
            margin: '0 12px 8px',
            background: 'rgba(16,185,129,0.12)',
            border: '1.5px solid rgba(16,185,129,0.35)',
            borderRadius: 10,
            padding: '10px 12px',
            cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              {photosCtx.phase === 'paused'
                ? <span style={{ fontSize: 11, fontWeight: 700, color: '#10B981' }}>⏸ Photos en pause</span>
                : <><Loader2 size={13} color="#10B981" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                   <span style={{ fontSize: 11, fontWeight: 700, color: '#10B981' }}>Analyse photos</span></>
              }
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginLeft: 'auto' }}>
                {photosCtx.progress}%
              </span>
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${photosCtx.progress}%`,
                background: 'linear-gradient(90deg, #10B981, #059669)',
                borderRadius: 99,
                transition: 'width 0.5s ease',
              }} />
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 5 }}>
              {photosCtx.processed}/{photosCtx.total} CVs · {photosCtx.found} photo{photosCtx.found !== 1 ? 's' : ''} trouvée{photosCtx.found !== 1 ? 's' : ''}
            </div>
          </div>
        </Link>
      )}

      {/* Doublons progress badge */}
      {showDoblonsBadge && (
        <Link href="/parametres/doublons" style={{ textDecoration: 'none' }}>
          <div style={{
            margin: '0 12px 8px',
            background: 'rgba(239,68,68,0.1)',
            border: '1.5px solid rgba(239,68,68,0.3)',
            borderRadius: 10,
            padding: '10px 12px',
            cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Loader2 size={13} color="#EF4444" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#EF4444' }}>
                {doublonsCtx.phase === 'loading' ? 'Chargement doublons' : 'Analyse doublons'}
              </span>
              {doublonsCtx.phase === 'analysing' && (
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginLeft: 'auto' }}>
                  {doublonsCtx.progress}%
                </span>
              )}
            </div>
            {doublonsCtx.phase === 'analysing' && (
              <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${doublonsCtx.progress}%`,
                  background: 'linear-gradient(90deg, #EF4444, #DC2626)',
                  borderRadius: 99,
                  transition: 'width 0.5s ease',
                }} />
              </div>
            )}
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 5 }}>
              {doublonsCtx.checkedPairs}/{doublonsCtx.totalPairs} paires · {doublonsCtx.doublons.length} doublon{doublonsCtx.doublons.length !== 1 ? 's' : ''}
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
          const isMatchingNav = item.href === '/matching'
          const showMatchingDot = (matchingCtx.phase === 'running' || matchingCtx.phase === 'paused') && isMatchingNav && !active
          const isCandidatsNav = item.href === '/candidats'
          const showATraiterBadge = isCandidatsNav && typeof aTraiterCount === 'number' && aTraiterCount > 0
          return (
            <div key={item.href}>
              <Link
                href={item.href}
                className={`d-nav-link${active ? ' active' : ''}`}
                style={isMatchingNav ? { position: 'relative' } : undefined}
              >
                <Icon className="d-nav-icon" strokeWidth={active ? 2.5 : 2} />
                {item.label}
                {showMatchingDot && (
                  <span style={{
                    marginLeft: 'auto', width: 7, height: 7, borderRadius: '50%',
                    background: matchingCtx.phase === 'paused' ? '#818CF8' : '#6366F1', flexShrink: 0,
                    animation: matchingCtx.phase === 'running' ? 'pulse 2s infinite' : 'none',
                  }} />
                )}
              </Link>
              {(aTraiterCount ?? 0) > 0 && (
                <Link
                  href="/candidats/a-traiter"
                  className="d-nav-link"
                  style={{
                    paddingLeft: 36, fontSize: 12,
                    background: pathname === '/candidats/a-traiter' ? 'rgba(245,166,35,0.15)' : undefined,
                    color: pathname === '/candidats/a-traiter' ? 'var(--primary)' : undefined,
                    fontWeight: pathname === '/candidats/a-traiter' ? 700 : undefined,
                  }}
                >
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    minWidth: 20, height: 20, borderRadius: 99, padding: '0 6px',
                    background: 'rgba(245,166,35,0.25)', color: '#F5A623',
                    fontSize: 10, fontWeight: 800, marginRight: 6,
                  }}>
                    {aTraiterCount}
                  </span>
                  À traiter
                </Link>
              )}
            </div>
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
          const showDot = isParams && (importCtx.running || photosCtx.phase === 'running' || photosCtx.phase === 'paused' || doublonsCtx.phase === 'loading' || doublonsCtx.phase === 'analysing')

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

      </div>

      {/* Beta badge inline */}
      <BetaBadge inline />

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </aside>
  )
}
