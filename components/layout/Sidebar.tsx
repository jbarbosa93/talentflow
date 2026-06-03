'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard, Users, Briefcase, KanbanSquare,
  Sparkles, Settings, Calendar, Mail, Plug, UserCheck, Shield,
  Upload, Loader2, X, Wrench, Building2, Activity, TrendingUp, ClipboardList,
  FileSignature, Bell,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { useImport } from '@/contexts/ImportContext'
import { useMatching } from '@/contexts/MatchingContext'
import { usePhotos } from '@/contexts/PhotosContext'
import { useDoublons } from '@/contexts/DoublonsContext'
import BetaBadge from '@/components/BetaBadge'
import { useNewItemsBadges, useMarkSectionSeen, BADGE_COLORS } from '@/hooks/useNewItemsBadges'
import { hasBadge, getViewedSet, getViewedAllAt, ensureInit, refreshViewedFromDB } from '@/lib/badge-candidats'
// v1.9.62 — useOffresATraiterCount retiré (Veille offres suspendue)

// v1.9.135 — Envois déplacé juste après Pipeline (demande João)
const NAV_ITEMS = [
  { href: '/dashboard',    label: 'Tableau de bord', icon: LayoutDashboard, exact: true },
  { href: '/candidats',    label: 'Candidats',        icon: Users },
  { href: '/clients',      label: 'Clients',          icon: Building2 },
  { href: '/offres',       label: 'Commandes',        icon: Briefcase,       hideForSecretaire: true },
  { href: '/missions',     label: 'Missions',         icon: TrendingUp,      adminOnly: true },
  { href: '/pipeline',     label: 'Pipeline',         icon: KanbanSquare,    hideForSecretaire: true },
  { href: '/messages',     label: 'Envois',           icon: Mail,            hideForSecretaire: true },
  { href: '/sign',         label: 'Signatures',       icon: FileSignature,   hideForSecretaire: true },
  { href: '/sign/rapports', label: 'Rapports',        icon: ClipboardList,   hideForSecretaire: true },
  { href: '/notifications', label: 'Notifications',    icon: Bell,            hideForSecretaire: true },
  { href: '/matching',     label: 'Matching IA',      icon: Sparkles,        hideForSecretaire: true, beta: true },
  { href: '/secretariat',  label: 'Administration',   icon: ClipboardList,   secretaireVisible: true },
]

const FOOTER_ITEMS = [
  { href: '/integrations',               label: 'Intégrations',      icon: Plug,      adminOnly: true },
  { href: '/outils',                     label: 'Outils',            icon: Wrench },
  { href: '/parametres',                 label: 'Paramètres',        icon: Settings },
]

const ADMIN_EMAIL = 'j.barbosa@l-agence.ch'

// Mapping href → badge section key
// v1.9.124 — '/activites' retiré : la page sert juste à consulter une trace
// ponctuellement, pas besoin d'être averti par un badge rouge.
const BADGE_SECTION_MAP: Record<string, string> = {
  '/candidats': 'candidats',
  '/clients': 'clients',
  '/offres': 'offres',
  '/entretiens': 'entretiens',
}

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

export function Sidebar({ mobileOpen, onClose, desktopCollapsed }: { mobileOpen?: boolean; onClose?: () => void; desktopCollapsed?: boolean }) {
  const pathname = usePathname()
  const importCtx = useImport()
  const matchingCtx = useMatching()
  const photosCtx = usePhotos()
  const { data: newBadges } = useNewItemsBadges()
  const markSeen = useMarkSectionSeen()
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
  // v2.0.3 — Helper admin cohérent avec hooks/useRequireAdmin : email==ADMIN_EMAIL OU role∈{Admin,Administrateur}
  const isAdminUser = (u: typeof user): boolean => {
    if (!u) return false
    if (ADMIN_EMAIL && u.email === ADMIN_EMAIL) return true
    const r = (u.user_metadata as { role?: string } | null | undefined)?.role || ''
    return r === 'Admin' || r === 'Administrateur'
  }

  // Badge rappels entretiens actifs
  const { data: rappelsCount } = useQuery({
    queryKey: ['entretiens-rappels-count'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/entretiens/rappels')
        const d = await res.json()
        return (d.rappels as any[])?.length || 0
      } catch { return 0 }
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    placeholderData: 0,
  })

  // Badge sidebar : candidats créés dans les 30 derniers jours et pas encore vus
  const [sidebarBadgeCount, setSidebarBadgeCount] = useState(0)
  // v1.9.31 — Badge pending_validation OneDrive sur /integrations
  const [pendingValidationCount, setPendingValidationCount] = useState(0)

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const computeBadgeCount = async () => {
      try {
        // cache-bust pour éviter la réponse mise en cache
        const res = await fetch(`/api/candidats/count-new?t=${Date.now()}`)
        if (!res.ok) return
        const { ids } = await res.json() as { ids: { id: string; import_status: string; created_at: string; last_import_at?: string | null }[] }
        const vs = getViewedSet()
        const allAt = getViewedAllAt()
        setSidebarBadgeCount(ids.filter(item => hasBadge(item.id, item.created_at, vs, allAt, item.last_import_at)).length)
      } catch { /* silencieux */ }
    }

    // v1.9.64 — debounce 500ms → 50ms pour les actions user (Marquer vu / Non vu).
    // 50ms suffit à coalescer sans faire attendre. Les imports batch sont toujours
    // coalescés via le refetchInterval 60s + computeBadgeCount au focus.
    const debouncedCompute = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(computeBadgeCount, 50)
    }

    // Premier calcul après init DB (viewedAllAt déjà lu depuis localStorage — pas de flash)
    ensureInit().then(() => computeBadgeCount())

    window.addEventListener('talentflow:badges-changed', debouncedCompute)
    // v1.9.23 — refetch immédiat au retour sur l'onglet (capte crons OneDrive silencieux)
    // v1.9.26 — rafraîchir viewedSet depuis DB AVANT compute (capte candidats_vus DELETE serveur)
    const onFocus = () => { refreshViewedFromDB().then(() => computeBadgeCount()) }
    window.addEventListener('focus', onFocus)
    const interval = setInterval(computeBadgeCount, 60_000)

    return () => {
      window.removeEventListener('talentflow:badges-changed', debouncedCompute)
      window.removeEventListener('focus', onFocus)
      clearInterval(interval)
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [])

  // v1.9.31 — Fetch count pending_validation OneDrive
  useEffect(() => {
    let cancelled = false
    const fetchPending = async () => {
      try {
        const res = await fetch('/api/onedrive/pending-validation', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json() as { count?: number }
        if (!cancelled) setPendingValidationCount(data.count || 0)
      } catch { /* silencieux */ }
    }
    fetchPending()
    const onFocus = () => fetchPending()
    const onPendingChanged = (e: any) => {
      if (typeof e?.detail === 'number') setPendingValidationCount(e.detail)
      else fetchPending()
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('talentflow:pending-validation-changed', onPendingChanged)
    const interval = setInterval(fetchPending, 2 * 60_000)
    return () => {
      cancelled = true
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('talentflow:pending-validation-changed', onPendingChanged)
      clearInterval(interval)
    }
  }, [])

  // Badge secrétariat — notifications non lues
  const { data: secNotifCount } = useQuery({
    queryKey: ['secretariat-notifs-count'],
    queryFn: async () => {
      if (!isSecretaire) return 0
      try {
        const res = await fetch('/api/secretariat/notifications')
        if (!res.ok) return 0
        const d = await res.json()
        return d.notifications?.length || 0
      } catch { return 0 }
    },
    enabled: isSecretaire,
    staleTime: 60_000,
    refetchInterval: 60_000,
    placeholderData: 0,
  })

  // Badge offres externes — supprimé v1.9.62 (Veille offres suspendue)

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

  const ADMIN_PATHS = ['/parametres/admin', '/parametres/demandes-acces', '/parametres/securite']

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
    // v2.9.65 — Désambiguïsation /sign vs /sign/rapports : la sidebar a 2 onglets
    // distincts ; /sign ne doit PAS s'allumer sur /sign/rapports/* (et inversement
    // /sign/rapports ne doit pas s'allumer sur /sign/templates ou /sign/[id]).
    // v2.9.66 — Désambiguïsation /sign vs /sign/rapports (2 onglets sidebar distincts).
    // /sign ne doit PAS s'allumer sur les pages /sign/rapports/* (Rapports a son propre onglet).
    // Note : /sign/rapports/templates est désormais une route distincte de /sign/templates.
    if (href === '/sign' && pathname.startsWith('/sign/rapports')) return false
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
  const showDoblonsBadge = doublonsCtx.phase === 'loading' && !isDoublonsPage

  return (
    <aside className={`d-sidebar${mobileOpen ? ' is-open' : ''}${desktopCollapsed ? ' is-collapsed' : ''}`}>
      {/* Logo V2 (design v2 — icône or + texte noir + sous-titre L'AGENCE · V2) */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <Link href="/dashboard" className="d-sidebar-logo" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          {/* TalentFlow icon (éclair brand) */}
          <motion.span
            whileHover={{ scale: 1.08, rotate: 4 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: 8,
              background: '#1C1A14', flexShrink: 0,
              boxShadow: '0 1px 2px rgba(0,0,0,.08), 0 4px 12px -4px rgba(255, 170, 0, .35)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
              <path d="M288 48L112 272h144l-32 192 176-224H256z" fill="#F7C948"/>
            </svg>
          </motion.span>
          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.15 }}>
            <b style={{
              fontFamily: 'var(--font-jakarta), DM Sans, system-ui, sans-serif',
              fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em',
              color: 'var(--text, #1C1A14)',
            }}>
              TalentFlow
            </b>
            {entreprise && (
              <span style={{
                fontSize: 10, color: 'var(--text-3, #8b8675)',
                fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 2,
              }}>
                {entreprise}
              </span>
            )}
          </span>
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
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)' }}>Import en cours</span>
                  <span style={{ fontSize: 11, color: 'rgba(28,26,20,0.55)', marginLeft: 'auto' }}>
                    {importCtx.progress}%
                  </span>
                </div>
                <div style={{ height: 4, background: 'rgba(28,26,20,0.08)', borderRadius: 99, overflow: 'hidden' }}>
                  <motion.div
                    style={{ height: '100%', background: 'linear-gradient(90deg, #F5A623, #F97316)', borderRadius: 99 }}
                    animate={{ width: `${importCtx.progress}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                </div>
                <div style={{ fontSize: 10, color: 'rgba(28,26,20,0.5)', marginTop: 5 }}>
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
                    ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--info)' }}>⏸ Matching en pause</span>
                    : <><Loader2 size={13} color="#818CF8" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                       <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--info)' }}>Matching IA</span></>
                  }
                  <span style={{ fontSize: 11, color: 'rgba(28,26,20,0.55)', marginLeft: 'auto' }}>
                    {matchingCtx.progress}%
                  </span>
                </div>
                <div style={{ height: 4, background: 'rgba(28,26,20,0.08)', borderRadius: 99, overflow: 'hidden' }}>
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
                <div style={{ fontSize: 10, color: 'rgba(28,26,20,0.5)', marginTop: 5 }}>
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
                    ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--success)' }}>⏸ Photos en pause</span>
                    : <><Loader2 size={13} color="#10B981" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                       <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--success)' }}>Analyse photos</span></>
                  }
                  <span style={{ fontSize: 11, color: 'rgba(28,26,20,0.55)', marginLeft: 'auto' }}>
                    {photosCtx.progress}%
                  </span>
                </div>
                <div style={{ height: 4, background: 'rgba(28,26,20,0.08)', borderRadius: 99, overflow: 'hidden' }}>
                  <motion.div
                    style={{ height: '100%', background: 'linear-gradient(90deg, #10B981, #059669)', borderRadius: 99 }}
                    animate={{ width: `${photosCtx.progress}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                </div>
                <div style={{ fontSize: 10, color: 'rgba(28,26,20,0.5)', marginTop: 5 }}>
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
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--destructive)' }}>
                    Recherche doublons...
                  </span>
                </div>
                <div style={{ fontSize: 10, color: 'rgba(28,26,20,0.5)', marginTop: 5 }}>
                  Verification en cours...
                </div>
              </div>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main nav */}
      <nav className="d-sidebar-nav">
        <span className="d-sidebar-section">Navigation</span>
        <motion.div
          initial="hidden"
          animate="show"
          style={{ display: 'flex', flexDirection: 'column' }}
        >
          {NAV_ITEMS.filter(item => {
            if ((item as any).adminOnly && !isAdminUser(user)) return false
            // Secrétariat visible pour Secrétaire ET Admin
            if ((item as any).secretaireVisible && userRole !== 'Secrétaire' && !isAdminUser(user)) return false
            // Masquer certains items pour la Secrétaire
            if ((item as any).hideForSecretaire && isSecretaire) return false
            return true
          }).map((item, i) => {
            const Icon = item.icon
            const active = isActive(item.href, item.exact)
            const isMatchingNav = item.href === '/matching'
            const showMatchingDot = (matchingCtx.phase === 'running' || matchingCtx.phase === 'paused') && isMatchingNav && !active
            return (
              <motion.div
                key={item.href}
                custom={i}
                variants={navItemVariants}
                whileTap={{ scale: 0.97 }}
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
                    // Badge disparaît après 5s sur la page (pas au clic)
                    const badgeKey = BADGE_SECTION_MAP[item.href]
                    if (badgeKey) {
                      setTimeout(() => markSeen(badgeKey), 5000)
                    }
                    // v1.9.72 : on NE purge PLUS les filtres de /candidats au clic sidebar.
                    // User veut que la recherche + filtres + sélection persistent jusqu'à "Tout effacer" ou logout.
                    // Les clés legacy isolées (candidats_search/page/import_status) ne sont plus utilisées
                    // depuis que tout est consolidé dans `candidats_filters` — on les nettoie juste si présent.
                    if (!item.href.startsWith('/candidats')) {
                      sessionStorage.removeItem('candidats_search')
                      sessionStorage.removeItem('candidats_page')
                      sessionStorage.removeItem('candidats_import_status')
                    }
                  }}
                >
                  <Icon className="d-nav-icon" strokeWidth={active ? 2.5 : 2} />
                  {item.label}
                  {/* v1.9.127 — Badge "Beta" sur Matching IA (design v2) */}
                  {(item as any).beta && (
                    <span style={{
                      marginLeft: 'auto',
                      padding: '1px 6px', borderRadius: 6,
                      background: 'rgba(249, 115, 22, 0.14)',
                      color: '#C2410C', fontWeight: 800,
                      fontSize: 9, letterSpacing: '0.04em',
                      textTransform: 'uppercase', flexShrink: 0,
                    }}>
                      Beta
                    </span>
                  )}
                  {/* Badge nombre de nouveaux candidats depuis dernière visite */}
                  {item.href === '/candidats' && sidebarBadgeCount > 0 && (() => {
                    // v2.1.11 — padding dynamique : 0 (cercle parfait) si 1 chiffre, '0 5' si 2+ chiffres
                    const isLong = sidebarBadgeCount >= 10
                    return (
                      <span style={{
                        marginLeft: 'auto', minWidth: 20, height: 20, borderRadius: 999,
                        padding: isLong ? '0 5px' : 0, boxSizing: 'border-box',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: 'var(--destructive)', color: '#FFFFFF',
                        fontSize: 11, fontWeight: 800, flexShrink: 0,
                        lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                      }}>
                        {sidebarBadgeCount > 99 ? '99+' : sidebarBadgeCount}
                      </span>
                    )
                  })()}
                  {/* v1.9.127 — Badge count "design v2" pour les autres sections (Clients/Commandes/Entretiens).
                      Avant : simple dot rouge animé. Maintenant : nombre dans pill discret slate
                      (cohérent avec la maquette V2 qui montre 3, 27, 12 sur les items). */}
                  {(() => {
                    if (item.href === '/candidats') return null
                    const badgeKey = BADGE_SECTION_MAP[item.href]
                    const count = badgeKey && newBadges ? (newBadges as any)[badgeKey] : 0
                    if (!count) return null
                    return (
                      <span style={{
                        // v2.1.11 — ROUGE partout (avant : surface-3/muted gris) pour cohérence avec Candidats
                        marginLeft: 'auto', minWidth: 20, height: 20, borderRadius: 999,
                        padding: count >= 10 ? '0 5px' : 0, boxSizing: 'border-box',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: 'var(--destructive)', color: '#FFFFFF',
                        fontSize: 11, fontWeight: 800, flexShrink: 0,
                        lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                      }}>
                        {count > 99 ? '99+' : count}
                      </span>
                    )
                  })()}
                  {/* Badge rappels entretiens */}
                  {item.href === '/entretiens' && typeof rappelsCount === 'number' && rappelsCount > 0 && (
                    <span style={{
                      marginLeft: 'auto', minWidth: 20, height: 20, borderRadius: 999,
                      padding: rappelsCount >= 10 || rappelsCount > 9 ? '0 5px' : 0, boxSizing: 'border-box',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      background: 'var(--destructive)', color: 'var(--destructive-foreground)',
                      fontSize: 11, fontWeight: 800, flexShrink: 0,
                      lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                    }}>
                      {rappelsCount > 9 ? '9+' : rappelsCount}
                    </span>
                  )}
                  {/* Badge offres externes — désactivé v1.9.62 (Veille offres suspendue). */}
                  {/* Badge notifications secrétariat */}
                  {item.href === '/secretariat' && typeof secNotifCount === 'number' && secNotifCount > 0 && (
                    <span style={{
                      marginLeft: 'auto', minWidth: 20, height: 20, borderRadius: 999,
                      padding: secNotifCount >= 10 ? '0 5px' : 0, boxSizing: 'border-box',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      background: 'var(--destructive)', color: '#fff',
                      fontSize: 11, fontWeight: 800, flexShrink: 0,
                      lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                    }}>
                      {secNotifCount}
                    </span>
                  )}
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
        <span className="d-sidebar-section" style={{ margin: '0 0 6px' }}>Configuration</span>
        <motion.div
          initial="hidden"
          animate="show"
          style={{ display: 'flex', flexDirection: 'column' }}
        >
          {FOOTER_ITEMS.filter(item => {
            if (item.adminOnly && !isAdminUser(user)) return false
            if (item.href === '/outils' && isSecretaire) return false
            return true
          }).map((item, i) => {
            const Icon = item.icon
            const active = isActive(item.href, (item as any).exact)
            const isOutils = item.href === '/outils'
            const isAdmin = item.href === '/parametres/admin'
            const showDot = isOutils && (importCtx.running || photosCtx.phase === 'running' || photosCtx.phase === 'paused' || doublonsCtx.phase === 'loading')
            return (
              <motion.div
                key={item.href}
                custom={NAV_ITEMS.length + i}
                variants={navItemVariants}
                whileTap={{ scale: 0.97 }}
                style={{ position: 'relative' }}
              >
                <Link
                    href={item.href}
                    className={`d-nav-link${active ? ' active' : ''}`}
                    style={{ position: 'relative', zIndex: 1, borderRadius: 8, background: active ? 'var(--primary)' : undefined }}
                    onClick={() => {
                      // v1.9.72 : persistance filtres candidats — voir lien précédent.
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
                        background: 'var(--destructive)', color: 'var(--destructive-foreground)',
                        fontSize: 10, fontWeight: 800, flexShrink: 0,
                      }}>
                        {demandesCount}
                      </span>
                    )}
                    {/* v1.9.31 — Badge fichiers pending_validation sur Intégrations */}
                    {item.href === '/integrations' && pendingValidationCount > 0 && (
                      <span style={{
                        marginLeft: 'auto', minWidth: 18, height: 18, borderRadius: 99,
                        padding: '0 5px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: 'var(--destructive)', color: 'var(--destructive-foreground)',
                        fontSize: 10, fontWeight: 800, flexShrink: 0,
                      }}>
                        {pendingValidationCount > 99 ? '99+' : pendingValidationCount}
                      </span>
                    )}
                    {showDot && (
                      <span style={{
                        marginLeft: 'auto', width: 7, height: 7, borderRadius: '50%',
                        background: 'var(--primary)', flexShrink: 0,
                        animation: 'pulse 2s infinite',
                      }} />
                    )}
                  </Link>
                {/* Indicateur extraction CV supprimé — cron en arrière-plan */}

                {/* Sous-menu Administration : Sécurité & Demandes d'accès */}
                {isAdmin && active && (
                  <>
                    <Link
                      href="/parametres/securite"
                      className="d-nav-link"
                      style={{
                        position: 'relative', zIndex: 1,
                        paddingLeft: 36, fontSize: 12,
                        background: pathname === '/parametres/securite' ? 'rgba(245,166,35,0.15)' : undefined,
                        color: pathname === '/parametres/securite' ? 'var(--primary)' : undefined,
                        fontWeight: pathname === '/parametres/securite' ? 700 : undefined,
                      }}
                    >
                      <Shield size={14} strokeWidth={1.5} style={{ opacity: 0.7 }} />
                      Sécurité &amp; Accès
                    </Link>
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
                          background: 'var(--destructive)', color: 'var(--destructive-foreground)',
                          fontSize: 9, fontWeight: 800, flexShrink: 0,
                        }}>
                          {demandesCount}
                        </span>
                      )}
                    </Link>
                  </>
                )}
              </motion.div>
            )
          })}
        </motion.div>
      </div>

      {/* v1.9.127 — Footer sidebar : user info supprimé (déjà top-right), bouton "Signaler bug" supprimé.
          Badge version Production conservé. */}
      <BetaBadge inline />

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </aside>
  )
}
