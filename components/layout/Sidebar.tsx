'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard, Users, Briefcase, KanbanSquare,
  Sparkles, Settings, Calendar, Mail, Plug, UserCheck, Shield,
  Upload, Loader2, X, Wrench,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { useImport } from '@/contexts/ImportContext'
import { useMatching } from '@/contexts/MatchingContext'
import { usePhotos } from '@/contexts/PhotosContext'
import { useDoublons } from '@/contexts/DoublonsContext'
import BetaBadge from '@/components/BetaBadge'

const NAV_ITEMS = [
  { href: '/dashboard',  label: 'Tableau de bord', icon: LayoutDashboard, exact: true },
  { href: '/candidats',  label: 'Candidats',        icon: Users },
  { href: '/offres',     label: 'Commandes',         icon: Briefcase },
  { href: '/pipeline',   label: 'Pipeline',          icon: KanbanSquare },
  { href: '/entretiens', label: 'Entretiens',        icon: Calendar },
  { href: '/messages',   label: 'Messages',          icon: Mail },
  { href: '/matching',   label: 'Matching IA',       icon: Sparkles },
]

const FOOTER_ITEMS = [
  { href: '/integrations',               label: 'Intégrations',      icon: Plug },
  { href: '/outils',                     label: 'Outils',            icon: Wrench },
  { href: '/parametres/admin',           label: 'Administration',    icon: Shield,    adminOnly: true },
  { href: '/parametres',                 label: 'Paramètres',        icon: Settings },
]

const ADMIN_EMAIL = 'j.barbosa@l-agence.ch'

const navItemVariants = {
  hidden: { opacity: 0, x: -12 },
  show: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.04, type: 'spring' as const, stiffness: 350, damping: 28 },
  }),
}

const badgeVariants = {
  hidden: { opacity: 0, y: -8, scale: 0.95 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } },
  exit: { opacity: 0, y: -6, scale: 0.95, transition: { duration: 0.18 } },
}

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
  const userRole: string = user?.user_metadata?.role || 'Consultant'
  const isSecretaire = userRole === 'Secrétaire'

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

  // Compteur demandes d'accès en attente
  const { data: demandesCount } = useQuery({
    queryKey: ['demandes-acces-count'],
    queryFn: async () => {
      try {
        const supabase = createClient()
        const { count } = await supabase
          .from('demandes_acces')
          .select('*', { count: 'exact', head: true })
          .eq('statut', 'en_attente')
        return count || 0
      } catch { return 0 }
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    placeholderData: 0,
  })

  const OUTILS_PATHS = ['/parametres/import-masse', '/parametres/corriger-photos', '/parametres/doublons']

  const ADMIN_PATHS = ['/parametres/admin', '/parametres/demandes-acces']

  const isActive = (href: string, exact?: boolean) => {
    // Sur les pages outils, seul /outils est actif — pas /parametres
    if (OUTILS_PATHS.includes(pathname)) {
      if (href === '/outils') return true
      if (href === '/parametres') return false
      return pathname === href
    }
    // Sur les pages admin, seul Administration est actif — pas Paramètres
    if (ADMIN_PATHS.includes(pathname)) {
      if (href === '/parametres/admin') return true
      if (href === '/parametres') return false
      return pathname === href
    }
    if (exact) return pathname === href
    if (pathname === href) return true
    if (pathname.startsWith(href + '/')) return true
    return false
  }

  const isImportPage = pathname === '/parametres/import-masse'
  const showImportBadge = importCtx.running && !isImportPage && importCtx.total > 0

  const isMatchingPage = pathname === '/matching'
  const showMatchingBadge = (matchingCtx.phase === 'running' || matchingCtx.phase === 'paused') && !isMatchingPage && matchingCtx.total > 0

  const isPhotosPage = pathname === '/parametres/corriger-photos'
  const showPhotosBadge = (photosCtx.phase === 'running' || photosCtx.phase === 'paused') && !isPhotosPage && photosCtx.total > 0

  const isDoublonsPage = pathname === '/parametres/doublons'
  const showDoblonsBadge = (doublonsCtx.phase === 'loading' || doublonsCtx.phase === 'analysing') && !isDoublonsPage

  return (
    <aside className={`d-sidebar${mobileOpen ? ' is-open' : ''}`}>
      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <Link href="/dashboard" className="d-sidebar-logo" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <motion.span
              className="d-sidebar-dot"
              animate={{ boxShadow: ['0 0 0 3px rgba(245,167,35,0.2)', '0 0 0 6px rgba(245,167,35,0.08)', '0 0 0 3px rgba(245,167,35,0.2)'] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            />
            TalentFlow
          </div>
          {entreprise && (
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginLeft: 20, marginTop: 1 }}>
              {entreprise}
            </span>
          )}
        </Link>
      </motion.div>

      {/* Progress badges */}
      <AnimatePresence>
        {showImportBadge && (
          <motion.div key="import-badge" variants={badgeVariants} initial="hidden" animate="show" exit="exit">
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
                  <motion.div
                    style={{ height: '100%', background: 'linear-gradient(90deg, #F5A623, #F97316)', borderRadius: 99 }}
                    animate={{ width: `${importCtx.progress}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 5 }}>
                  {importCtx.completed}/{importCtx.total} CVs traités · {importCtx.succeeded} importés
                </div>
              </div>
            </Link>
          </motion.div>
        )}

        {showMatchingBadge && (
          <motion.div key="matching-badge" variants={badgeVariants} initial="hidden" animate="show" exit="exit">
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
                  <motion.div
                    style={{
                      height: '100%',
                      background: matchingCtx.phase === 'paused'
                        ? 'linear-gradient(90deg, #818CF8, #6366F1)'
                        : 'linear-gradient(90deg, #6366F1, #8B5CF6)',
                      borderRadius: 99,
                    }}
                    animate={{ width: `${matchingCtx.progress}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 5 }}>
                  {matchingCtx.doneCount}/{matchingCtx.total} candidats · {matchingCtx.offreName}
                </div>
              </div>
            </Link>
          </motion.div>
        )}

        {showPhotosBadge && (
          <motion.div key="photos-badge" variants={badgeVariants} initial="hidden" animate="show" exit="exit">
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
                  <motion.div
                    style={{ height: '100%', background: 'linear-gradient(90deg, #10B981, #059669)', borderRadius: 99 }}
                    animate={{ width: `${photosCtx.progress}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 5 }}>
                  {photosCtx.processed}/{photosCtx.total} CVs · {photosCtx.found} photo{photosCtx.found !== 1 ? 's' : ''} trouvée{photosCtx.found !== 1 ? 's' : ''}
                </div>
              </div>
            </Link>
          </motion.div>
        )}

        {showDoblonsBadge && (
          <motion.div key="doublons-badge" variants={badgeVariants} initial="hidden" animate="show" exit="exit">
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
                    <motion.div
                      style={{ height: '100%', background: 'linear-gradient(90deg, #EF4444, #DC2626)', borderRadius: 99 }}
                      animate={{ width: `${doublonsCtx.progress}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                  </div>
                )}
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 5 }}>
                  {doublonsCtx.checkedPairs}/{doublonsCtx.totalPairs} paires · {doublonsCtx.doublons.length} doublon{doublonsCtx.doublons.length !== 1 ? 's' : ''}
                </div>
              </div>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main nav */}
      <nav className="d-sidebar-nav">
        <span className="d-sidebar-section">Menu</span>
        <motion.div
          initial="hidden"
          animate="show"
          style={{ display: 'flex', flexDirection: 'column' }}
        >
          {NAV_ITEMS.map((item, i) => {
            const Icon = item.icon
            const active = isActive(item.href, item.exact)
            const isMatchingNav = item.href === '/matching'
            const showMatchingDot = (matchingCtx.phase === 'running' || matchingCtx.phase === 'paused') && isMatchingNav && !active
            return (
              <motion.div
                key={item.href}
                custom={i}
                variants={navItemVariants}
                style={{ position: 'relative' }}
              >
                {/* Active indicator bar */}
                {active && (
                  <motion.div
                    layoutId="sidebar-active"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'var(--primary)',
                      borderRadius: 8,
                      zIndex: 0,
                    }}
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <Link
                  href={item.href}
                  className={`d-nav-link${active ? ' active' : ''}`}
                  style={{ position: 'relative', zIndex: 1 }}
                  onClick={() => {
                    if (!item.href.startsWith('/candidats')) {
                      sessionStorage.removeItem('candidats_search')
                      sessionStorage.removeItem('candidats_page')
                      sessionStorage.removeItem('candidats_import_status')
                    }
                  }}
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
              </motion.div>
            )
          })}
        </motion.div>
      </nav>

      {/* Footer */}
      <div className="d-sidebar-footer">
        <span className="d-sidebar-section" style={{ margin: '0 0 6px' }}>Compte</span>
        <motion.div
          initial="hidden"
          animate="show"
          style={{ display: 'flex', flexDirection: 'column' }}
        >
          {FOOTER_ITEMS.filter(item => {
            if (item.adminOnly && user?.email !== ADMIN_EMAIL) return false
            if (item.href === '/outils' && isSecretaire) return false
            return true
          }).map((item, i) => {
            const Icon = item.icon
            const active = isActive(item.href, (item as any).exact)
            const isOutils = item.href === '/outils'
            const isAdmin = item.href === '/parametres/admin'
            const showDot = isOutils && (importCtx.running || photosCtx.phase === 'running' || photosCtx.phase === 'paused' || doublonsCtx.phase === 'loading' || doublonsCtx.phase === 'analysing')
            return (
              <motion.div
                key={item.href}
                custom={NAV_ITEMS.length + i}
                variants={navItemVariants}
                style={{ position: 'relative' }}
              >
                <Link
                    href={item.href}
                    className={`d-nav-link${active ? ' active' : ''}`}
                    style={{ position: 'relative', zIndex: 1, borderRadius: 8, background: active ? 'var(--primary)' : undefined }}
                    onClick={() => {
                      if (!item.href.startsWith('/candidats')) {
                        sessionStorage.removeItem('candidats_search')
                        sessionStorage.removeItem('candidats_page')
                        sessionStorage.removeItem('candidats_import_status')
                      }
                    }}
                  >
                    <Icon className="d-nav-icon" strokeWidth={active ? 2.5 : 2} />
                    {item.label}
                    {/* Badge demandes d'accès sur Administration */}
                    {isAdmin && typeof demandesCount === 'number' && demandesCount > 0 && (
                      <span style={{
                        marginLeft: 'auto', minWidth: 18, height: 18, borderRadius: 99,
                        padding: '0 5px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: '#EF4444', color: 'white',
                        fontSize: 10, fontWeight: 800, flexShrink: 0,
                      }}>
                        {demandesCount}
                      </span>
                    )}
                    {showDot && (
                      <span style={{
                        marginLeft: 'auto', width: 7, height: 7, borderRadius: '50%',
                        background: '#F5A623', flexShrink: 0,
                        animation: 'pulse 2s infinite',
                      }} />
                    )}
                  </Link>
                {/* Sous-menu Administration : Demandes d'accès */}
                {isAdmin && active && (
                  <Link
                    href="/parametres/demandes-acces"
                    className="d-nav-link"
                    style={{
                      position: 'relative', zIndex: 1,
                      paddingLeft: 36, fontSize: 12,
                      background: pathname === '/parametres/demandes-acces' ? 'rgba(245,166,35,0.15)' : undefined,
                      color: pathname === '/parametres/demandes-acces' ? 'var(--primary)' : undefined,
                      fontWeight: pathname === '/parametres/demandes-acces' ? 700 : undefined,
                    }}
                  >
                    <UserCheck size={14} strokeWidth={1.5} style={{ opacity: 0.7 }} />
                    Demandes d&apos;accès
                    {typeof demandesCount === 'number' && demandesCount > 0 && (
                      <span style={{
                        marginLeft: 'auto', minWidth: 16, height: 16, borderRadius: 99,
                        padding: '0 4px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: '#EF4444', color: 'white',
                        fontSize: 9, fontWeight: 800, flexShrink: 0,
                      }}>
                        {demandesCount}
                      </span>
                    )}
                  </Link>
                )}
              </motion.div>
            )
          })}
        </motion.div>
      </div>

      {/* Beta badge inline */}
      <BetaBadge inline />

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </aside>
  )
}
