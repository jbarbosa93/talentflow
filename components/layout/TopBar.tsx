'use client'
import Image from 'next/image'
import { Search, RefreshCw, Sparkles, Loader2, X, Briefcase, MapPin, ChevronDown, User, LogOut, Settings, Menu, Sun, Moon, PanelLeftClose } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useSyncMicrosoft } from '@/hooks/useMessages'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '@/contexts/ThemeContext'
import type { Candidat, PipelineEtape } from '@/types/database'

const PAGE_TITLES: Record<string, string> = {
  '/':            'Tableau de bord',
  '/candidats':   'Candidats',
  '/offres':      'Commandes',
  '/pipeline':    'Pipeline',
  '/entretiens':  'Entretiens',
  '/messages':    'Messages',
  '/matching':    'Matching IA',
  '/integrations':'Intégrations',
  '/parametres':  'Paramètres',
}

const ETAPE_COLORS: Record<PipelineEtape, string> = {
  nouveau:   '#64748B',
  contacte:  '#3B82F6',
  entretien: '#F59E0B',
  place:     '#10B981',
  refuse:    '#EF4444',
}
const ETAPE_LABELS: Record<PipelineEtape, string> = {
  nouveau: 'Nouveau', contacte: 'Contacté', entretien: 'Entretien', place: 'Placé', refuse: 'Refusé',
}

const dropdownVariants = {
  hidden: { opacity: 0, y: -8, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 400, damping: 28 } },
  exit: { opacity: 0, y: -6, scale: 0.97, transition: { duration: 0.15 } },
}

const resultItemVariants = {
  hidden: { opacity: 0, x: -6 },
  show: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.03, type: 'spring' as const, stiffness: 400, damping: 28 },
  }),
}

export function TopBar({ onMenuClick, onToggleDesktop, desktopCollapsed }: { onMenuClick?: () => void; onToggleDesktop?: () => void; desktopCollapsed?: boolean }) {
  const pathname = usePathname()
  const router   = useRouter()
  const sync     = useSyncMicrosoft()
  const { theme, toggle, isDark } = useTheme()

  const [query, setQuery]             = useState('')
  const [open, setOpen]               = useState(false)
  const [aiSearching, setAiSearching] = useState(false)
  const [aiResults, setAiResults]     = useState<Candidat[] | null>(null)
  const [aiLabel, setAiLabel]         = useState('')
  const [focused, setFocused]         = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const inputRef   = useRef<HTMLInputElement>(null)
  const wrapRef    = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  const title = Object.entries(PAGE_TITLES)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([key]) => pathname === key || pathname.startsWith(key + '/'))
    ?.[1] ?? 'TalentFlow'

  const { data: intData } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => fetch('/api/integrations').then(r => r.json()),
    staleTime: 30_000,
  })
  const isMsConnected = intData?.integrations?.some((i: any) => ['microsoft', 'microsoft_onedrive'].includes(i.type) && i.actif)

  const { data: user } = useQuery({
    queryKey: ['current-user'],
    queryFn: async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      return user
    },
    staleTime: 60_000,
  })

  // Recherche via l'API serveur (RPC full-text)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  const { data: searchResults, isFetching: searchFetching } = useQuery({
    queryKey: ['topbar-search', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery.trim()) return []
      const res = await fetch(`/api/candidats?search=${encodeURIComponent(debouncedQuery)}&per_page=8&import_status=all`)
      if (!res.ok) return []
      const { candidats } = await res.json()
      return (candidats || []) as Candidat[]
    },
    enabled: debouncedQuery.trim().length > 0,
    staleTime: 10_000,
  })

  const filtered = useMemo(() => {
    if (aiResults !== null) return aiResults
    if (!debouncedQuery.trim()) return []
    return searchResults || []
  }, [searchResults, debouncedQuery, aiResults])

  const handleAiSearch = useCallback(async () => {
    if (!query.trim()) return
    setAiSearching(true)
    setAiResults(null)
    setAiLabel('')
    try {
      const res = await fetch('/api/candidats/search-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      if (!res.ok) throw new Error()
      const { candidats, query_interpreted } = await res.json()
      setAiResults((candidats || []).slice(0, 8))
      setAiLabel(query_interpreted || query)
    } catch {
      setAiResults([])
    } finally {
      setAiSearching(false)
    }
  }, [query])

  const clearSearch = () => {
    setQuery(''); setAiResults(null); setAiLabel(''); setOpen(false)
  }

  const goTo = (id: string) => { clearSearch(); router.push(`/candidats/${id}`) }
  const goToCandidats = () => { clearSearch(); router.push('/candidats') }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (query.trim()) setOpen(true)
    else if (!aiResults) setOpen(false)
  }, [query, aiResults])

  async function handleLogout() {
    sessionStorage.clear()
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  const [isDev, setIsDev] = useState(false)
  useEffect(() => { setIsDev(window.location.hostname === 'localhost') }, [])
  const prenom      = isDev ? 'Admin' : (user?.user_metadata?.prenom     || '')
  const nom         = isDev ? '' : (user?.user_metadata?.nom        || '')
  const role        = isDev ? 'Administrateur' : (user?.user_metadata?.role       || 'Consultant')
  const entreprise  = user?.user_metadata?.entreprise || ''
  const avatarUrl   = isDev ? null : (user?.user_metadata?.avatar_url || null)
  const initiales   = isDev ? 'A' : (`${prenom[0] || ''}${nom[0] || ''}`.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U')
  const fullName    = isDev ? 'Admin' : ([prenom, nom].filter(Boolean).join(' ') || user?.email?.split('@')[0] || 'Mon profil')

  const showDropdown = open && (filtered.length > 0 || aiSearching || aiResults !== null)

  const isOnCandidats = pathname === '/candidats' || pathname.startsWith('/candidats')

  if (isOnCandidats) {
    return (
      <motion.header
        className="d-topbar"
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        {onMenuClick && (
          <button className="d-topbar-hamburger" onClick={onMenuClick} aria-label="Menu">
            <Menu size={20} />
          </button>
        )}
        {/* v1.9.47 — toggle sidebar desktop (caché en mobile via CSS) */}
        {onToggleDesktop && (
          <button className="d-topbar-toggle-sidebar" onClick={onToggleDesktop} aria-label={desktopCollapsed ? 'Afficher la sidebar' : 'Cacher la sidebar'} title={desktopCollapsed ? 'Afficher la sidebar' : 'Cacher la sidebar'}>
            <PanelLeftClose size={18} style={{ transform: desktopCollapsed ? 'scaleX(-1)' : undefined, transition: 'transform 0.2s' }} />
          </button>
        )}
        <div style={{ flex: 1 }} />
        <div className="d-topbar-actions">
          <motion.button onClick={toggle} className="d-icon-btn" title={isDark ? 'Mode clair' : 'Mode sombre'} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <AnimatePresence mode="wait">
              {isDark
                ? <motion.span key="sun" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}><Sun size={14} /></motion.span>
                : <motion.span key="moon" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.2 }}><Moon size={14} /></motion.span>
              }
            </AnimatePresence>
          </motion.button>
          <div ref={profileRef} style={{ position: 'relative' }}>
            <motion.button
              onClick={() => setProfileOpen(p => !p)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, background: profileOpen ? 'var(--background)' : 'transparent', border: `1.5px solid ${profileOpen ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 10, padding: '6px 12px 6px 6px', cursor: 'pointer', transition: 'all 0.15s' }}
              whileHover={{ borderColor: 'var(--primary)', background: 'var(--background)' }}
            >
              <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: avatarUrl ? 'transparent' : 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#0F172A', overflow: 'hidden' }}>
                {avatarUrl ? <Image src={avatarUrl} alt="" width={40} height={40} unoptimized style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initiales}
              </div>
              <div className="d-topbar-profile-text" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1, whiteSpace: 'nowrap' }}>{fullName}</span>
                {entreprise && <span style={{ fontSize: 11, color: 'var(--primary)', marginTop: 2, fontWeight: 700, whiteSpace: 'nowrap' }}>{entreprise}</span>}
              </div>
              <motion.span animate={{ rotate: profileOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDown size={12} style={{ color: 'var(--muted)' }} />
              </motion.span>
            </motion.button>
            <AnimatePresence>
              {profileOpen && (
                <motion.div variants={dropdownVariants} initial="hidden" animate="show" exit="exit" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 12, boxShadow: '0 8px 32px rgba(15,23,42,0.12)', zIndex: 999, minWidth: 220, overflow: 'hidden' }}>
                  <div style={{ padding: '6px' }}>
                    <motion.button onClick={() => { setProfileOpen(false); router.push('/parametres/profil') }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', border: 'none', background: 'transparent', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', fontFamily: 'var(--font-body)' }} whileHover={{ background: 'var(--background)' }}>
                      <User size={14} style={{ color: 'var(--muted)' }} /> Mon profil
                    </motion.button>
                    <motion.button onClick={() => { setProfileOpen(false); router.push('/parametres') }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', border: 'none', background: 'transparent', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', fontFamily: 'var(--font-body)' }} whileHover={{ background: 'var(--background)' }}>
                      <Settings size={14} style={{ color: 'var(--muted)' }} /> Paramètres
                    </motion.button>
                  </div>
                  <div style={{ borderTop: '1px solid var(--border)', padding: '6px' }}>
                    <motion.button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', border: 'none', background: 'transparent', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#EF4444', fontFamily: 'var(--font-body)' }} whileHover={{ background: '#FEF2F2' }}>
                      <LogOut size={14} /> Se déconnecter
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.header>
    )
  }

  return (
    <motion.header
      className="d-topbar"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {/* ── Hamburger mobile ── */}
      {onMenuClick && (
        <button className="d-topbar-hamburger" onClick={onMenuClick} aria-label="Menu">
          <Menu size={20} />
        </button>
      )}

      {/* ── Barre de recherche ── */}
      <div ref={wrapRef} style={{ position: 'relative', flex: 1, maxWidth: 520, marginRight: 20 }}>
        <motion.div
          style={{
            display: 'flex', alignItems: 'center',
            borderRadius: 10, overflow: 'hidden',
            border: '1.5px solid var(--border)',
            background: 'var(--background)',
          }}
          animate={{
            borderColor: focused ? 'var(--primary)' : 'var(--border)',
            background: focused ? 'var(--surface)' : 'var(--background)',
            boxShadow: focused ? '0 0 0 3px rgba(245,167,35,0.12)' : '0 0 0 0px rgba(245,167,35,0)',
          }}
          transition={{ duration: 0.15 }}
        >
          <div style={{ padding: '0 10px 0 12px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <Search size={14} style={{ color: 'var(--muted)' }} />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setAiResults(null); setAiLabel('') }}
            onFocus={() => { setFocused(true); if (query.trim()) setOpen(true) }}
            onBlur={() => setFocused(false)}
            onKeyDown={e => {
              if (e.key === 'Enter' && query.trim()) handleAiSearch()
              if (e.key === 'Escape') clearSearch()
            }}
            placeholder="Rechercher un candidat, compétence, métier..."
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--foreground)', padding: '9px 0', fontFamily: 'var(--font-body)' }}
          />
          <AnimatePresence mode="wait">
            {aiSearching && (
              <motion.div
                key="loader"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                style={{ padding: '0 10px', display: 'flex', alignItems: 'center' }}
              >
                <Loader2 size={13} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
              </motion.div>
            )}
            {query && !aiSearching && (
              <motion.button
                key="clear"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onMouseDown={e => { e.preventDefault(); clearSearch() }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 10px', display: 'flex', alignItems: 'center', color: 'var(--muted)' }}
              >
                <X size={13} />
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Dropdown */}
        <AnimatePresence>
          {showDropdown && (
            <motion.div
              variants={dropdownVariants}
              initial="hidden"
              animate="show"
              exit="exit"
              style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
                background: 'var(--surface)', border: '1.5px solid var(--border)',
                borderRadius: 12, boxShadow: '0 8px 32px rgba(15,23,42,0.12)',
                zIndex: 999, overflow: 'hidden',
              }}
            >
              {aiResults !== null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--primary-soft)', borderBottom: '1px solid rgba(245,167,35,0.2)' }}>
                  <Sparkles size={12} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', flex: 1 }}>{aiResults.length} résultat{aiResults.length !== 1 ? 's' : ''} IA</span>
                  {aiLabel && <span style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>« {aiLabel} »</span>}
                </div>
              )}
              {aiSearching && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 14px' }}>
                  <Loader2 size={14} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>Analyse des CVs en cours...</span>
                </div>
              )}
              {!aiSearching && filtered.map((c: any, i: number) => (
                <motion.div
                  key={c.id}
                  custom={i}
                  variants={resultItemVariants}
                  initial="hidden"
                  animate="show"
                  onMouseDown={e => { e.preventDefault(); goTo(c.id) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', transition: 'background 0.1s', background: 'var(--surface)' }}
                  whileHover={{ background: 'var(--background)' }}
                >
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#0F172A', flexShrink: 0 }}>
                    {`${(c.prenom || '')[0] || ''}${(c.nom || '')[0] || ''}`.toUpperCase() || '?'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--foreground)', lineHeight: 1.2 }}>{c.prenom} {c.nom}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                      {c.titre_poste && <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}><Briefcase size={10} /> {c.titre_poste}</span>}
                      {c.localisation && <span style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 3 }}><MapPin size={10} /> {c.localisation}</span>}
                      {c.competences?.slice(0, 2).map((comp: string) => (
                        <span key={comp} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 100, background: 'var(--primary-soft)', color: 'var(--primary)', fontWeight: 700 }}>{comp}</span>
                      ))}
                    </div>
                  </div>
                  {c.statut_pipeline && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, flexShrink: 0, background: `${ETAPE_COLORS[c.statut_pipeline as PipelineEtape]}18`, color: ETAPE_COLORS[c.statut_pipeline as PipelineEtape] }}>
                      {ETAPE_LABELS[c.statut_pipeline as PipelineEtape] || c.statut_pipeline}
                    </span>
                  )}
                </motion.div>
              ))}
              {!aiSearching && filtered.length === 0 && aiResults !== null && (
                <div style={{ padding: '20px 14px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Aucun candidat correspondant</div>
              )}
              {!aiSearching && filtered.length > 0 && (
                <motion.div
                  onMouseDown={e => { e.preventDefault(); goToCandidats() }}
                  style={{ padding: '10px 14px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--primary)', cursor: 'pointer', background: 'var(--background)', borderTop: '1px solid var(--border)' }}
                  whileHover={{ background: 'var(--primary-soft)' }}
                >
                  Voir tous les candidats →
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Actions droite ── */}
      <div className="d-topbar-actions">
        {isMsConnected && (
          <motion.button
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className="d-icon-btn"
            title="Synchroniser Microsoft"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <RefreshCw style={{ width: 14, height: 14 }} className={sync.isPending ? 'animate-spin' : ''} />
          </motion.button>
        )}

        {/* Toggle thème */}
        <motion.button
          onClick={toggle}
          className="d-icon-btn"
          title={isDark ? 'Mode clair' : 'Mode sombre'}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <AnimatePresence mode="wait">
            {isDark ? (
              <motion.span key="sun" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}>
                <Sun size={14} />
              </motion.span>
            ) : (
              <motion.span key="moon" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.2 }}>
                <Moon size={14} />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

        {/* Profil recruteur — dropdown */}
        <div ref={profileRef} style={{ position: 'relative' }}>
          <motion.button
            onClick={() => setProfileOpen(p => !p)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: profileOpen ? 'var(--background)' : 'transparent',
              border: `1.5px solid ${profileOpen ? 'var(--primary)' : 'var(--border)'}`,
              borderRadius: 10, padding: '6px 12px 6px 6px',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            whileHover={{ borderColor: 'var(--primary)', background: 'var(--background)' }}
          >
            {/* Avatar */}
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: avatarUrl ? 'transparent' : 'var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 800, color: '#0F172A', overflow: 'hidden',
            }}>
              {avatarUrl
                ? <Image src={avatarUrl} alt="" width={40} height={40} unoptimized style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : initiales
              }
            </div>

            {/* Nom + entreprise */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1, whiteSpace: 'nowrap' }}>
                {fullName}
              </span>
              {entreprise && (
                <span style={{ fontSize: 11, color: 'var(--primary)', marginTop: 2, fontWeight: 700, whiteSpace: 'nowrap' }}>{entreprise}</span>
              )}
            </div>

            <motion.span
              animate={{ rotate: profileOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown size={12} style={{ color: 'var(--muted)' }} />
            </motion.span>
          </motion.button>

          {/* Dropdown menu */}
          <AnimatePresence>
            {profileOpen && (
              <motion.div
                variants={dropdownVariants}
                initial="hidden"
                animate="show"
                exit="exit"
                style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                  background: 'var(--surface)', border: '1.5px solid var(--border)',
                  borderRadius: 12, boxShadow: '0 8px 32px rgba(15,23,42,0.12)',
                  zIndex: 999, minWidth: 220, overflow: 'hidden',
                }}
              >
                <div style={{ padding: '6px' }}>
                  <motion.button
                    onClick={() => { setProfileOpen(false); router.push('/parametres/profil') }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: '9px 12px', border: 'none', background: 'transparent',
                      borderRadius: 8, cursor: 'pointer',
                      fontSize: 13, fontWeight: 600, color: 'var(--foreground)',
                      fontFamily: 'var(--font-body)',
                    }}
                    whileHover={{ background: 'var(--background)' }}
                  >
                    <User size={14} style={{ color: 'var(--muted)' }} />
                    Mon profil
                  </motion.button>
                  <motion.button
                    onClick={() => { setProfileOpen(false); router.push('/parametres') }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: '9px 12px', border: 'none', background: 'transparent',
                      borderRadius: 8, cursor: 'pointer',
                      fontSize: 13, fontWeight: 600, color: 'var(--foreground)',
                      fontFamily: 'var(--font-body)',
                    }}
                    whileHover={{ background: 'var(--background)' }}
                  >
                    <Settings size={14} style={{ color: 'var(--muted)' }} />
                    Paramètres
                  </motion.button>
                </div>

                <div style={{ borderTop: '1px solid var(--border)', padding: '6px' }}>
                  <motion.button
                    onClick={handleLogout}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: '9px 12px', border: 'none', background: 'transparent',
                      borderRadius: 8, cursor: 'pointer',
                      fontSize: 13, fontWeight: 600, color: '#EF4444',
                      fontFamily: 'var(--font-body)',
                    }}
                    whileHover={{ background: '#FEF2F2' }}
                  >
                    <LogOut size={14} />
                    Se déconnecter
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </motion.header>
  )
}
