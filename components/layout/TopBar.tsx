'use client'
import { Search, RefreshCw, Sparkles, Loader2, X, Briefcase, MapPin, ChevronDown, User, LogOut, Settings } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useSyncMicrosoft } from '@/hooks/useMessages'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
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

export function TopBar() {
  const pathname = usePathname()
  const router   = useRouter()
  const sync     = useSyncMicrosoft()

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

  // ── Données ───────────────────────────────────────────────────────────────

  const { data: intData } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => fetch('/api/integrations').then(r => r.json()),
    staleTime: 30_000,
  })
  const isMsConnected = intData?.integrations?.some((i: any) => i.type === 'microsoft' && i.actif)

  const { data: user } = useQuery({
    queryKey: ['current-user'],
    queryFn: async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      return user
    },
    staleTime: 60_000,
  })

  const { data: _candidatsRaw } = useQuery({
    queryKey: ['candidats', {}],
    queryFn: async () => {
      const res = await fetch('/api/candidats')
      if (!res.ok) return { candidats: [], total: 0 }
      const { candidats, total } = await res.json()
      return { candidats: (candidats || []) as Candidat[], total: (total || 0) as number }
    },
    staleTime: 60_000,
  })
  const allCandidats = _candidatsRaw?.candidats

  // ── Filtrage client-side ──────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (aiResults !== null) return aiResults
    if (!query.trim() || !allCandidats) return []
    const q = query.toLowerCase()
    return (allCandidats as any[]).filter((c: any) =>
      (c.nom || '').toLowerCase().includes(q) ||
      (c.prenom || '').toLowerCase().includes(q) ||
      (c.titre_poste || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.localisation || '').toLowerCase().includes(q) ||
      (c.formation || '').toLowerCase().includes(q) ||
      (c.resume_ia || '').toLowerCase().includes(q) ||
      (c.cv_texte_brut || '').toLowerCase().includes(q) ||
      (c.competences || []).some((s: string) => s.toLowerCase().includes(q)) ||
      (c.langues || []).some((s: string) => s.toLowerCase().includes(q)) ||
      (c.experiences || []).some((e: any) =>
        (e.poste || '').toLowerCase().includes(q) ||
        (e.entreprise || '').toLowerCase().includes(q)
      )
    ).slice(0, 8)
  }, [allCandidats, query, aiResults])

  // ── Recherche IA ──────────────────────────────────────────────────────────

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
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  // ── Profil utilisateur ────────────────────────────────────────────────────

  const prenom      = user?.user_metadata?.prenom     || ''
  const nom         = user?.user_metadata?.nom        || ''
  const role        = user?.user_metadata?.role       || 'Consultant'
  const entreprise  = user?.user_metadata?.entreprise || ''
  const avatarUrl   = user?.user_metadata?.avatar_url || null
  const initiales   = `${prenom[0] || ''}${nom[0] || ''}`.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'
  const fullName    = [prenom, nom].filter(Boolean).join(' ') || user?.email?.split('@')[0] || 'Mon profil'

  const showDropdown = open && (filtered.length > 0 || aiSearching || aiResults !== null)

  const isOnCandidats = pathname === '/candidats' || pathname.startsWith('/candidats')
  if (isOnCandidats) return null

  return (
    <header className="d-topbar">
      {/* ── Barre de recherche ── */}
      <div ref={wrapRef} style={{ position: 'relative', flex: 1, maxWidth: 520, marginRight: 20 }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          background: focused ? 'white' : 'var(--background)',
          border: `1.5px solid ${focused ? 'var(--primary)' : 'var(--border)'}`,
          borderRadius: 10, overflow: 'hidden',
          boxShadow: focused ? '0 0 0 3px rgba(245,167,35,0.12)' : 'none',
          transition: 'all 0.15s ease',
        }}>
          <div style={{ padding: '0 10px 0 12px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <Search size={14} style={{ color: focused ? 'var(--primary)' : 'var(--muted)' }} />
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
          {aiSearching && (
            <div style={{ padding: '0 10px', display: 'flex', alignItems: 'center' }}>
              <Loader2 size={13} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
            </div>
          )}
          {query && !aiSearching && (
            <button onMouseDown={e => { e.preventDefault(); clearSearch() }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 10px', display: 'flex', alignItems: 'center', color: 'var(--muted)' }}>
              <X size={13} />
            </button>
          )}
        </div>

        {/* Dropdown */}
        {showDropdown && (
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: 'white', border: '1.5px solid var(--border)', borderRadius: 12, boxShadow: '0 8px 32px rgba(15,23,42,0.12)', zIndex: 999, overflow: 'hidden' }}>
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
            {!aiSearching && filtered.map((c: any) => (
              <div key={c.id} onMouseDown={e => { e.preventDefault(); goTo(c.id) }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--background)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'white')}
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
              </div>
            ))}
            {!aiSearching && filtered.length === 0 && aiResults !== null && (
              <div style={{ padding: '20px 14px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Aucun candidat correspondant</div>
            )}
            {!aiSearching && filtered.length > 0 && (
              <div onMouseDown={e => { e.preventDefault(); goToCandidats() }}
                style={{ padding: '10px 14px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--primary)', cursor: 'pointer', background: 'var(--background)', borderTop: '1px solid var(--border)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary-soft)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--background)')}
              >
                Voir tous les candidats →
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Actions droite ── */}
      <div className="d-topbar-actions">
        {isMsConnected && (
          <button onClick={() => sync.mutate()} disabled={sync.isPending} className="d-icon-btn" title="Synchroniser Microsoft">
            <RefreshCw style={{ width: 14, height: 14 }} className={sync.isPending ? 'animate-spin' : ''} />
          </button>
        )}

        {/* Profil recruteur — dropdown */}
        <div ref={profileRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setProfileOpen(p => !p)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: profileOpen ? 'var(--background)' : 'transparent',
              border: `1.5px solid ${profileOpen ? 'var(--primary)' : 'var(--border)'}`,
              borderRadius: 10, padding: '5px 10px 5px 6px',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              if (!profileOpen) {
                e.currentTarget.style.background = 'var(--background)'
                e.currentTarget.style.borderColor = 'var(--primary)'
              }
            }}
            onMouseLeave={e => {
              if (!profileOpen) {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.borderColor = 'var(--border)'
              }
            }}
          >
            {/* Avatar */}
            <div style={{
              width: 30, height: 30, borderRadius: 8, flexShrink: 0,
              background: avatarUrl ? 'transparent' : 'var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 800, color: '#0F172A', overflow: 'hidden',
            }}>
              {avatarUrl
                ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : initiales
              }
            </div>

            {/* Nom + entreprise */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1, whiteSpace: 'nowrap' }}>
                {fullName}
              </span>
              {entreprise && (
                <span style={{ fontSize: 10, color: 'var(--primary)', marginTop: 2, fontWeight: 700, whiteSpace: 'nowrap' }}>{entreprise}</span>
              )}
            </div>

            <ChevronDown size={12} style={{ color: 'var(--muted)', flexShrink: 0, transition: 'transform 0.2s', transform: profileOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
          </button>

          {/* Dropdown menu */}
          {profileOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', right: 0,
              background: 'white', border: '1.5px solid var(--border)',
              borderRadius: 12, boxShadow: '0 8px 32px rgba(15,23,42,0.12)',
              zIndex: 999, minWidth: 220, overflow: 'hidden',
              animation: 'fadeInDown 0.15s ease',
            }}>
              {/* User info header */}
              <div style={{
                padding: '14px 16px', borderBottom: '1px solid var(--border)',
                background: 'var(--background)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                    background: avatarUrl ? 'transparent' : 'var(--primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 800, color: '#0F172A', overflow: 'hidden',
                  }}>
                    {avatarUrl
                      ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : initiales
                    }
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.2 }}>{fullName}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{role}</div>
                    {entreprise && (
                      <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 700, marginTop: 1 }}>{entreprise}</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Menu items */}
              <div style={{ padding: '6px' }}>
                <button
                  onClick={() => { setProfileOpen(false); router.push('/parametres/profil') }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '9px 12px', border: 'none', background: 'transparent',
                    borderRadius: 8, cursor: 'pointer', transition: 'background 0.12s',
                    fontSize: 13, fontWeight: 600, color: 'var(--foreground)',
                    fontFamily: 'var(--font-body)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--background)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <User size={14} style={{ color: 'var(--muted)' }} />
                  Mon profil
                </button>
                <button
                  onClick={() => { setProfileOpen(false); router.push('/parametres') }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '9px 12px', border: 'none', background: 'transparent',
                    borderRadius: 8, cursor: 'pointer', transition: 'background 0.12s',
                    fontSize: 13, fontWeight: 600, color: 'var(--foreground)',
                    fontFamily: 'var(--font-body)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--background)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <Settings size={14} style={{ color: 'var(--muted)' }} />
                  Paramètres
                </button>
              </div>

              {/* Separator + Logout */}
              <div style={{ borderTop: '1px solid var(--border)', padding: '6px' }}>
                <button
                  onClick={handleLogout}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '9px 12px', border: 'none', background: 'transparent',
                    borderRadius: 8, cursor: 'pointer', transition: 'all 0.12s',
                    fontSize: 13, fontWeight: 600, color: '#EF4444',
                    fontFamily: 'var(--font-body)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#FEF2F2')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <LogOut size={14} />
                  Se déconnecter
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes fadeInDown { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </header>
  )
}
