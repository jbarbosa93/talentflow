'use client'
import { useState, useRef, useEffect, useCallback, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { Mail, Plus, Trash2, Send, FileText, AlertCircle, ExternalLink, Copy, Check, Search, X, Users, Paperclip, MapPin, History, Calendar, Briefcase, ChevronDown, ChevronRight, Pencil } from 'lucide-react'
import dynamic from 'next/dynamic'
const CVCustomizer = dynamic(() => import('@/components/CVCustomizer'), { ssr: false })
import EmailChipInput from '@/components/EmailChipInput'
import MultiCandidatSearch from '@/components/MultiCandidatSearch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useEmailTemplates, useCreateTemplate } from '@/hooks/useMessages'
import { useCandidats } from '@/hooks/useCandidats'
import { useClients, type Client } from '@/hooks/useClients'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { renderTemplate, hasContexteIA, TEMPLATE_VARS, type Civilite } from '@/lib/template-vars'
import { RecentContactsWarning, useRecentContacts } from '@/components/RecentContactsWarning'
import { parseBooleanSearch, normalize } from '@/lib/boolean-search'
import { createClient as createSupaClient } from '@/lib/supabase/client'

const CAT_LABELS: Record<string, string> = {
  invitation_entretien: 'Entretien',
  relance: 'Relance',
  refus: 'Refus',
  offre: 'Offre',
  general: 'Général',
}
const CAT_COLORS: Record<string, { bg: string; color: string }> = {
  invitation_entretien: { bg: '#FFF7ED', color: '#F5A623' },
  relance:              { bg: '#EFF6FF', color: 'var(--info)' },
  refus:                { bg: '#FEF2F2', color: 'var(--destructive)' },
  offre:                { bg: '#F0FDF4', color: 'var(--success)' },
  general:              { bg: 'var(--secondary)', color: 'var(--muted)' },
}

type TabId = 'email' | 'templates' | 'historique'

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'email',      label: 'Mailing',         icon: Mail },
  { id: 'templates',  label: 'Templates',       icon: FileText },
  { id: 'historique', label: 'Historique',      icon: History },
]

// v1.9.78 — Next.js impose que tout composant utilisant useSearchParams soit dans un <Suspense>
// pour supporter le prerendering statique. On wrap donc la vraie page dans un Suspense boundary.
export default function MessagesPage() {
  return (
    <Suspense fallback={<div className="d-page" style={{ maxWidth: 800, padding: 24 }} />}>
      <MessagesPageContent />
    </Suspense>
  )
}

function MessagesPageContent() {
  // v1.9.78 — sync tab ↔ URL (?tab=historique) pour que router.back() depuis une fiche candidat
  //           restaure le bon onglet. Compat ancien usage : /messages sans query = onglet 'email'.
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialTab: TabId = (() => {
    const q = searchParams.get('tab')
    return q === 'historique' || q === 'templates' || q === 'email' ? q : 'email'
  })()
  const [tab, setTab] = useState<TabId>(initialTab)
  const changeTab = (id: TabId) => {
    setTab(id)
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    if (id === 'email') params.delete('tab'); else params.set('tab', id)
    const qs = params.toString()
    router.replace(qs ? `/messages?${qs}` : '/messages', { scroll: false })
  }

  return (
    <div className="d-page" style={{ maxWidth: 800 }}>
      <div className="d-page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="d-page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Send size={22} color="var(--primary)" />Envois
          </h1>
          <p className="d-page-sub">Mailing candidats et historique des envois (WhatsApp & SMS depuis la liste candidats)</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 4,
        background: 'var(--secondary)', border: '1.5px solid var(--border)',
        borderRadius: 10, padding: 4, width: 'fit-content', marginBottom: 24,
      }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => changeTab(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-body)',
              transition: 'all 0.15s',
              background: tab === t.id ? 'var(--card)' : 'transparent',
              color: tab === t.id ? 'var(--foreground)' : 'var(--muted)',
              boxShadow: tab === t.id ? 'var(--card-shadow)' : 'none',
            }}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'email'      && <EmailTab />}
      {tab === 'templates'  && <TemplatesTab />}
      {tab === 'historique' && <HistoriqueTab />}
    </div>
  )
}

// ─── Candidat Search ──────────────────────────────────────────────────────────

function CandidatSearch({
  candidats,
  value,
  onChange,
  placeholder = 'Rechercher un candidat...',
}: {
  candidats: any[] | undefined
  value: string
  onChange: (id: string) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = candidats?.find(c => c.id === value)

  useEffect(() => {
    if (selected) {
      setSelectedLabel(`${selected.prenom} ${selected.nom}`)
      setQuery('')
    } else {
      setSelectedLabel('')
    }
  }, [value, selected])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const filtered = (candidats || []).filter(c => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return (
      c.nom?.toLowerCase().includes(q) ||
      c.prenom?.toLowerCase().includes(q) ||
      c.telephone?.includes(q)
    )
  }).slice(0, 20)

  const handleSelect = (c: any) => {
    onChange(c.id)
    setSelectedLabel(`${c.prenom} ${c.nom}`)
    setQuery('')
    setOpen(false)
  }

  const handleClear = () => {
    onChange('')
    setSelectedLabel('')
    setQuery('')
    inputRef.current?.focus()
  }

  const displayValue = open ? query : (selectedLabel || '')

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
        <input
          ref={inputRef}
          value={displayValue}
          placeholder={selectedLabel ? selectedLabel : placeholder}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => { setOpen(true); setQuery('') }}
          style={{
            width: '100%', height: 38, paddingLeft: 32, paddingRight: selectedLabel ? 32 : 10,
            border: '1.5px solid var(--border)', borderRadius: 8,
            background: 'var(--secondary)', color: 'var(--foreground)',
            fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {selectedLabel && (
          <button
            onClick={handleClear}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2, display: 'flex' }}
          >
            <X size={13} />
          </button>
        )}
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
          background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.1)', maxHeight: 240, overflowY: 'auto',
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
              Aucun candidat trouvé
            </div>
          ) : filtered.map(c => (
            <button
              key={c.id}
              onMouseDown={e => { e.preventDefault(); handleSelect(c) }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', background: c.id === value ? 'var(--primary-soft)' : 'none',
                border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                fontSize: 13, fontFamily: 'var(--font-body)', textAlign: 'left',
              }}
              onMouseOver={e => { if (c.id !== value) e.currentTarget.style.background = 'var(--secondary)' }}
              onMouseOut={e => { if (c.id !== value) e.currentTarget.style.background = 'none' }}
            >
              <div style={{
                width: 30, height: 30, borderRadius: '50%', background: 'var(--primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, color: 'var(--ink, #1C1A14)', flexShrink: 0,
              }}>
                {((c.prenom?.[0] || '') + (c.nom?.[0] || '')).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.prenom} {c.nom}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {c.telephone || 'Sans téléphone'}
                  {c.titre_poste ? ` · ${c.titre_poste}` : ''}
                </div>
              </div>
              {c.id === value && <Check size={13} style={{ color: 'var(--primary)', flexShrink: 0 }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Geo Helpers ─────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

// ─── Client Picker Modal ──────────────────────────────────────────────────────

function ClientPickerModal({
  onClose,
  onConfirm,
  alreadySelected,
}: {
  onClose: () => void
  onConfirm: (emails: string[]) => void
  alreadySelected: string[]
}) {
  const [search, setSearch] = useState('')
  const [secteurFilter, setSecteurFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set(alreadySelected))

  // ── Location / distance ─────────────────────────────────────────────
  const [refInput, setRefInput] = useState('')
  const [refSuggestions, setRefSuggestions] = useState<Array<{ lat: number; lng: number; display: string }>>([])
  const [refLoc, setRefLoc] = useState<{ lat: number; lng: number; label: string } | null>(null)
  const [refLoading, setRefLoading] = useState(false)
  const [maxKm, setMaxKm] = useState<number | null>(null)
  const [cityCoords, setCityCoords] = useState<Record<string, { lat: number; lng: number } | null>>({})
  const coordsCacheRef = useRef<Record<string, { lat: number; lng: number } | null>>({})
  const geocodeQueueRef = useRef<string[]>([])
  const geocodingRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const handleRefInput = (val: string) => {
    setRefInput(val)
    setRefLoc(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!val.trim()) { setRefSuggestions([]); return }
    debounceRef.current = setTimeout(async () => {
      setRefLoading(true)
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&format=json&limit=5&accept-language=fr`, { headers: { 'User-Agent': 'TalentFlow/1.0' } })
        const data = await r.json()
        setRefSuggestions(data.slice(0, 5).map((d: any) => ({ lat: +d.lat, lng: +d.lon, display: d.display_name })))
      } catch {}
      setRefLoading(false)
    }, 400)
  }

  // LocalStorage cache persistant — évite de re-géocoder entre sessions
  const GEOCODE_CACHE_KEY = 'tf_geocode_cache_v1'
  useEffect(() => {
    try {
      const raw = localStorage.getItem(GEOCODE_CACHE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        coordsCacheRef.current = parsed
        setCityCoords({ ...parsed })
      }
    } catch {}
  }, [])
  const persistCache = () => {
    try {
      localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(coordsCacheRef.current))
    } catch {}
  }

  const queueGeocode = useCallback(async (cityKeys: string[]) => {
    for (const key of cityKeys) {
      if (coordsCacheRef.current[key] !== undefined || geocodeQueueRef.current.includes(key)) continue
      geocodeQueueRef.current.push(key)
    }
    if (geocodingRef.current) return
    geocodingRef.current = true
    const fetchOne = async (key: string) => {
      if (coordsCacheRef.current[key] !== undefined) return
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(key)}&format=json&limit=1`, { headers: { 'User-Agent': 'TalentFlow/1.0' } })
        const data = await r.json()
        coordsCacheRef.current[key] = data[0] ? { lat: +data[0].lat, lng: +data[0].lon } : null
      } catch {
        coordsCacheRef.current[key] = null
      }
    }
    // Batches parallèles de 3 (respecte Nominatim ~1 req/s mais 3× plus rapide qu'avant)
    // + 150ms entre batches au lieu de 300ms entre chaque item
    while (geocodeQueueRef.current.length > 0) {
      const batch = geocodeQueueRef.current.splice(0, 3)
      await Promise.all(batch.map(fetchOne))
      setCityCoords({ ...coordsCacheRef.current })
      if (geocodeQueueRef.current.length > 0) {
        await new Promise(r => setTimeout(r, 150))
      }
    }
    persistCache()
    geocodingRef.current = false
  }, [])

  const getCityKey = (c: Client) => [c.ville, c.npa, c.canton].filter(Boolean).join(' ')

  const getDistance = useCallback((c: Client): number | null => {
    if (!refLoc) return null
    const key = getCityKey(c)
    const coords = cityCoords[key]
    if (!coords) return null
    return haversineKm(refLoc.lat, refLoc.lng, coords.lat, coords.lng)
  }, [refLoc, cityCoords])

  // v1.9.70 : per_page 500 → 2000 (la base a 1200+ clients, 500 était trop bas → résultats manquants)
  const { data } = useClients({ per_page: 2000 })
  const clients: Client[] = data?.clients || []

  // Unique secteurs
  const secteurs = Array.from(new Set(clients.map(c => c.secteur).filter(Boolean))).sort((a, b) => a!.localeCompare(b!, 'fr')) as string[]

  const q = normalize(search)
  // v1.9.70 : recherche booléenne (ET/OU/SAUF + parenthèses) — même parser que liste candidats
  const booleanMatcher = parseBooleanSearch(search)

  const filtered = clients.filter(c => {
    if (secteurFilter && c.secteur !== secteurFilter) return false
    if (maxKm !== null && refLoc) {
      const dist = getDistance(c)
      if (dist === null || dist > maxKm) return false
    }
    if (!search.trim()) return true
    const hay = `${c.nom_entreprise || ''} ${c.secteur || ''} ${c.adresse || ''} ${c.npa || ''} ${c.ville || ''} ${c.canton || ''} ${c.telephone || ''} ${c.email || ''} ${c.site_web || ''} ${c.notes || ''} ${(c.contacts || []).map((ct: any) => `${ct.prenom || ''} ${ct.nom || ''} ${ct.name || ''} ${ct.email || ''} ${ct.telephone || ''} ${ct.poste || ''}`).join(' ')}`
    if (booleanMatcher) return booleanMatcher(hay)
    return normalize(hay).includes(q)
  })

  // Trigger geocoding des seuls clients visibles (search + secteur filtre appliqués)
  // Avant : geocodait 500+ clients même si filtre "etancheur" ne laissait que 14 visibles
  // → sessions localhost qui attendaient plusieurs minutes pour rien.
  useEffect(() => {
    if (!refLoc) return
    const keys = filtered.map(getCityKey).filter(Boolean)
    queueGeocode([...new Set(keys)])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refLoc, search, secteurFilter])

  const hasEmail = (c: Client) => !!(c.email || (c.contacts || []).some((ct: any) => ct.email))

  const displayList = [...filtered].sort((a, b) => {
    const aE = hasEmail(a), bE = hasEmail(b)
    if (aE !== bE) return aE ? -1 : 1
    if (refLoc) return (getDistance(a) ?? Infinity) - (getDistance(b) ?? Infinity)
    return 0
  })

  // All possible emails in filtered list
  const allEmails = filtered.flatMap(c => {
    const emails: string[] = []
    if (c.email) emails.push(c.email)
    if (c.contacts) {
      for (const ct of c.contacts) {
        if (ct.email) emails.push(ct.email)
      }
    }
    return emails
  })

  const allSelected = allEmails.length > 0 && allEmails.every(e => selected.has(e))

  const toggleEmail = (email: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(email)) next.delete(email)
      else next.add(email)
      return next
    })
  }

  const toggleClient = (client: Client) => {
    const emails: string[] = []
    if (client.email) emails.push(client.email)
    if (client.contacts) for (const ct of client.contacts) { if (ct.email) emails.push(ct.email) }
    const allChecked = emails.length > 0 && emails.every(e => selected.has(e))
    setSelected(prev => {
      const next = new Set(prev)
      if (allChecked) emails.forEach(e => next.delete(e))
      else emails.forEach(e => next.add(e))
      return next
    })
  }

  const toggleAll = () => {
    if (allSelected) {
      setSelected(prev => {
        const next = new Set(prev)
        allEmails.forEach(e => next.delete(e))
        return next
      })
    } else {
      setSelected(prev => {
        const next = new Set(prev)
        allEmails.forEach(e => next.add(e))
        return next
      })
    }
  }

  const newCount = [...selected].filter(e => !alreadySelected.includes(e)).length

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--card)', borderRadius: 18, width: '100%', maxWidth: 680, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.3)', border: '2px solid var(--border)' }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1.5px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--foreground)', margin: 0 }}>Choisir les destinataires</h2>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: '3px 0 0' }}>Sélectionnez les clients et contacts à ajouter en CCI</p>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, border: '1.5px solid var(--border)', background: 'transparent', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
              <X size={14} />
            </button>
          </div>
          {/* Search + filters (v1.9.70 : recherche booléenne ET/OU/SAUF + parenthèses) */}
          <div style={{ display: 'flex', gap: 8, marginBottom: secteurs.length > 0 ? 10 : 0, alignItems: 'center' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher : nom, secteur, ville, contact, email, notes… ou ET/OU/SAUF"
                style={{ width: '100%', height: 38, paddingLeft: 32, paddingRight: 12, border: '2px solid var(--border)', borderRadius: 10, background: 'var(--secondary)', color: 'var(--foreground)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div
              title={`Recherche avancée :
• magasinier ET bâtiment → les deux mots
• magasinier OU logisticien → l'un ou l'autre
• maçon SAUF intérimaire → exclure un mot
• (magasinier OU logisticien) ET bâtiment → groupement`}
              style={{
                width: 32, height: 38, borderRadius: 10,
                border: '1.5px solid var(--border)', background: 'var(--card)',
                color: 'var(--muted-foreground)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'help', fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
              }}
            >
              ⓘ
            </div>
          </div>
          {/* Secteur filter — dropdown */}
          {secteurs.length > 0 && (
            <select
              value={secteurFilter}
              onChange={e => setSecteurFilter(e.target.value)}
              style={{
                width: '100%', height: 38, padding: '0 12px',
                border: '2px solid var(--border)', borderRadius: 10,
                background: secteurFilter ? 'var(--primary)' : 'var(--secondary)',
                color: secteurFilter ? '#0F172A' : 'var(--muted)',
                fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-body)',
                cursor: 'pointer', outline: 'none',
              }}
            >
              <option value="">Tous les secteurs / métiers</option>
              {secteurs.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}

          {/* ── Location / distance filter ───────────────────────── */}
          <div style={{ position: 'relative', marginTop: 8 }}>
            <div style={{ position: 'relative' }}>
              <MapPin size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: refLoc ? 'var(--primary)' : 'var(--muted)', pointerEvents: 'none' }} />
              <input
                value={refInput}
                onChange={e => handleRefInput(e.target.value)}
                placeholder="Distance depuis... (ville, adresse)"
                style={{ width: '100%', height: 38, paddingLeft: 32, paddingRight: refLoading ? 36 : refLoc ? 32 : 12, border: `2px solid ${refLoc ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 10, background: refLoc ? 'var(--primary-soft)' : 'var(--secondary)', color: 'var(--foreground)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
              />
              {refLoading && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: 'var(--muted)', lineHeight: 1 }}>⏳</span>}
              {refLoc && !refLoading && (
                <button onMouseDown={e => { e.preventDefault(); setRefLoc(null); setRefInput(''); setRefSuggestions([]) }}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}>
                  <X size={13} />
                </button>
              )}
            </div>
            {/* Autocomplete suggestions */}
            {refSuggestions.length > 0 && (
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 300, background: 'var(--card)', border: '2px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', overflow: 'hidden' }}>
                {refSuggestions.map((s, i) => (
                  <button
                    key={i}
                    onMouseDown={e => { e.preventDefault(); setRefLoc({ lat: s.lat, lng: s.lng, label: s.display }); setRefInput(s.display.split(',').slice(0, 2).join(', ').trim()); setRefSuggestions([]) }}
                    style={{ width: '100%', padding: '9px 14px', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--foreground)', borderBottom: i < refSuggestions.length - 1 ? '1px solid var(--border)' : 'none', fontFamily: 'inherit' }}
                    onMouseOver={e => e.currentTarget.style.background = 'var(--secondary)'}
                    onMouseOut={e => e.currentTarget.style.background = 'none'}
                  >
                    <span style={{ fontWeight: 700 }}>{s.display.split(',')[0]}</span>
                    <span style={{ color: 'var(--muted)', marginLeft: 6 }}>{s.display.split(',').slice(1, 3).join(',')}</span>
                  </button>
                ))}
              </div>
            )}
            {/* Rayon + sort options */}
            {refLoc && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Rayon :</span>
                {[null, 10, 20, 50, 100, 200].map(km => (
                  <button
                    key={km ?? 'all'}
                    onClick={() => setMaxKm(km)}
                    style={{
                      padding: '3px 10px', borderRadius: 20, border: `1.5px solid ${maxKm === km ? '#F5A623' : 'var(--border)'}`,
                      background: maxKm === km ? '#FEF3C7' : 'var(--secondary)', color: maxKm === km ? '#92400E' : 'var(--muted)',
                      fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {km === null ? 'Tous' : `${km} km`}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Select all bar */}
        <div style={{ padding: '10px 24px', borderBottom: '1px solid var(--border)', background: 'var(--secondary)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#F5A623' }}
            />
            Tout sélectionner ({allEmails.length} emails)
          </label>
          <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
            {selected.size} email{selected.size !== 1 ? 's' : ''} sélectionné{selected.size !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Client list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px' }}>
          {displayList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: 13 }}>
              {maxKm !== null ? `Aucun client dans un rayon de ${maxKm} km` : 'Aucun client trouvé'}
            </div>
          ) : (
            displayList.map(client => {
              const clientEmails: string[] = []
              if (client.email) clientEmails.push(client.email)
              const contacts: Array<{ nom?: string; prenom?: string; name?: string; email?: string; poste?: string }> = client.contacts || []
              contacts.forEach((ct: any) => { if (ct.email) clientEmails.push(ct.email) })

              const hasAnyEmail = clientEmails.length > 0
              const companyChecked = !!client.email && selected.has(client.email)
              const someChecked = clientEmails.some(e => selected.has(e))

              return (
                <div key={client.id} style={{ borderBottom: '1px solid var(--border)', paddingTop: 10, paddingBottom: 10, opacity: hasAnyEmail ? 1 : 0.45 }}>
                  {/* Client row */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: client.email ? 'pointer' : 'default' }}>
                    <input
                      type="checkbox"
                      checked={companyChecked}
                      disabled={!client.email}
                      ref={el => { if (el) el.indeterminate = !companyChecked && someChecked }}
                      onChange={() => client.email && toggleEmail(client.email)}
                      style={{ width: 15, height: 15, cursor: client.email ? 'pointer' : 'default', accentColor: '#F5A623', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--foreground)' }}>{client.nom_entreprise}</span>
                        {refLoc && (() => {
                          const dist = getDistance(client)
                          if (dist === null) return <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>…</span>
                          const color = dist < 20 ? '#166534' : dist < 50 ? '#92400E' : '#6B7280'
                          const bg = dist < 20 ? '#DCFCE7' : dist < 50 ? '#FEF3C7' : 'var(--secondary)'
                          return (
                            <span style={{ fontSize: 10, fontWeight: 800, color, background: bg, padding: '1px 6px', borderRadius: 6, whiteSpace: 'nowrap', flexShrink: 0 }}>
                              {dist} km
                            </span>
                          )
                        })()}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 8 }}>
                        {client.secteur && <span>{client.secteur}</span>}
                        {client.ville && <span>{client.ville}</span>}
                        {client.email
                          ? <span style={{ color: 'var(--info)' }}>{client.email}</span>
                          : <span style={{ fontStyle: 'italic' }}>Pas d'email</span>
                        }
                      </div>
                    </div>
                    <a
                      href={`/clients/${client.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      title="Ouvrir la fiche client (nouvel onglet)"
                      style={{ flexShrink: 0, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, color: 'var(--muted)', textDecoration: 'none', border: '1px solid transparent', transition: 'all 0.15s' }}
                      onMouseOver={e => { e.currentTarget.style.background = 'var(--secondary)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--foreground)' }}
                      onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = 'var(--muted)' }}
                    >
                      <ExternalLink size={11} />
                    </a>
                  </label>
                  {/* All contacts (grayed out if no email) */}
                  {contacts.map((ct: any, i: number) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 25, marginTop: 4, opacity: ct.email ? 1 : 0.4 }}>
                      <input
                        type="checkbox"
                        checked={!!ct.email && selected.has(ct.email)}
                        disabled={!ct.email}
                        onChange={() => ct.email && toggleEmail(ct.email)}
                        style={{ width: 13, height: 13, cursor: ct.email ? 'pointer' : 'default', accentColor: '#F5A623', flexShrink: 0 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)' }}>{ct.prenom || ''} {ct.nom || ct.name || ''}</span>
                        {ct.poste && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>· {ct.poste}</span>}
                        {ct.email
                          ? <span style={{ fontSize: 11, color: 'var(--info)', marginLeft: 6 }}>{ct.email}</span>
                          : <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6, fontStyle: 'italic' }}>Pas d'email</span>
                        }
                      </div>
                    </div>
                  ))}
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 12 }}>
          <button onClick={onClose} style={{ padding: '9px 18px', border: '2px solid var(--border)', borderRadius: 10, background: 'transparent', color: 'var(--foreground)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Annuler
          </button>
          <button
            onClick={() => onConfirm([...selected])}
            disabled={selected.size === 0}
            style={{ padding: '9px 22px', border: '2px solid #0F172A', borderRadius: 10, background: '#F5A623', color: 'var(--foreground)', fontSize: 13, fontWeight: 800, cursor: selected.size > 0 ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: selected.size > 0 ? 1 : 0.5 }}
          >
            Ajouter {selected.size > 0 ? `${selected.size} email${selected.size > 1 ? 's' : ''}` : ''} en CCI
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Email Tab ────────────────────────────────────────────────────────────────

const MAILING_KEY = 'talentflow_mailing_session'
type MailingSession = {
  candidatIds: string[]
  destinataires: string[]
  templateId: string
  sujet: string
  corps: string
  includeSignature: boolean
}
function loadMailingSession(): Partial<MailingSession> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(sessionStorage.getItem(MAILING_KEY) || '{}') } catch { return {} }
}

function EmailTab() {
  const initial = loadMailingSession()
  const [candidatIds, setCandidatIds] = useState<string[]>(initial.candidatIds || [])
  const [cvCandidatId, setCvCandidatId] = useState<string | null>(null)
  const [cvAttached, setCvAttached] = useState<Record<string, any>>({})
  // v1.9.78 — docs non-CV joints par candidat (URLs des entries dans candidat.documents[])
  const [extraDocs, setExtraDocs] = useState<Record<string, string[]>>({})
  // Cache des documents chargés à la demande (le /api/candidats liste ne remonte pas documents[])
  const [candidatDocsCache, setCandidatDocsCache] = useState<Record<string, Array<{ url: string; name: string; type: string; uploaded_at?: string }>>>({})
  const [templateId, setTemplateId] = useState(initial.templateId || '')
  const [destinataires, setDestinataires] = useState<string[]>(initial.destinataires || [])
  // v1.9.88 — Filtre recherche dans la liste des destinataires (utile pour grandes campagnes 50+).
  const [destinatairesFilter, setDestinatairesFilter] = useState('')
  const [ccEmails, setCcEmails] = useState<string[]>([]) // v1.9.70
  const [sendMode, setSendMode] = useState<'individual' | 'grouped'>('individual') // v1.9.70
  // v1.9.70 : overrides par destinataire (mode individual) — permet de personnaliser sujet/corps pour 1 seul destinataire
  const [overrides, setOverrides] = useState<Record<string, { sujet?: string; corps?: string }>>({})
  const [previewIdx, setPreviewIdx] = useState(0) // index du destinataire en aperçu (mode individual)
  const [sujet, setSujet] = useState(initial.sujet || '')
  const [corps, setCorps] = useState(initial.corps || '')
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [msConfig, setMsConfig] = useState<{ configured: boolean; email?: string; nom?: string } | null>(null)
  const [warningDismissed, setWarningDismissed] = useState(false) // v1.9.68

  // Variables
  const [consultantPrenom, setConsultantPrenom] = useState<string>('')
  const [contexteIA, setContexteIA] = useState<string>('')
  const [generatingContexte, setGeneratingContexte] = useState(false)
  const [civiliteByCandidat, setCiviliteByCandidat] = useState<Record<string, Civilite>>({})
  const [customByCandidat, setCustomByCandidat] = useState<Record<string, { titre_poste?: string; resume_ia?: string; nom_complet?: string }>>({})

  // v1.9.75 : per_page 500 → 10000 — la base a 6300+ candidats, 500 ratait tous ceux au-delà
  // → recherche flexible trouve tout (nom, prénom, email, métier, tel) sans accent / casse
  const { data: _candidatsData } = useCandidats({ per_page: 10000 })
  const candidats = (_candidatsData?.candidats || []).filter((c: any) => c.import_status !== 'archive')
  const { data: templates } = useEmailTemplates('email')

  // v1.9.68 — Warning 7 jours (contacts récents par n'importe quel user)
  const { contacts: recentContacts } = useRecentContacts(candidatIds, candidatIds.length > 0)
  useEffect(() => { setWarningDismissed(false) }, [candidatIds.join(',')])

  // v1.9.71 — Lecture URL ?candidat_id=X&attach=original|perso (depuis fiche candidat ou CVCustomizer)
  // Ajoute le candidat à la sélection + attache le CV demandé + nettoie l'URL.
  const didReadUrlRef = useRef(false)
  useEffect(() => {
    if (didReadUrlRef.current) return
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const urlCandidatId = params.get('candidat_id')
    const urlAttach = params.get('attach') // 'original' | 'perso' | null
    if (!urlCandidatId) return
    didReadUrlRef.current = true
    setCandidatIds(prev => prev.includes(urlCandidatId) ? prev : [...prev, urlCandidatId])
    if (urlAttach === 'original') {
      setCvAttached(prev => ({ ...prev, [urlCandidatId]: { original: true } }))
    }
    // Note : pour 'perso', l'user clique ensuite "Personnaliser" depuis la ligne candidat (ouvre CVCustomizer mode mailing)
    // On nettoie l'URL pour que F5 ne re-déclenche pas l'ajout
    const cleanUrl = window.location.pathname
    window.history.replaceState({}, '', cleanUrl)
    if (urlAttach === 'perso') {
      toast.info('Clique sur "Personnaliser" dans la ligne candidat pour configurer le CV')
    } else if (urlAttach === 'original') {
      toast.success('Candidat ajouté avec son CV original')
    } else {
      toast.success('Candidat ajouté')
    }
  }, [])

  // v1.9.70 — Reset preview index si la liste des destinataires rétrécit + clean overrides orphelins
  useEffect(() => {
    if (previewIdx >= destinataires.length && destinataires.length > 0) {
      setPreviewIdx(0)
    }
    // Supprimer les overrides pour les destinataires qui ont été retirés
    setOverrides(prev => {
      const valid = new Set(destinataires)
      const next: typeof prev = {}
      for (const [k, v] of Object.entries(prev)) {
        if (valid.has(k)) next[k] = v
      }
      return next
    })
  }, [destinataires.join(','), previewIdx])
  const { data: _clientsData } = useClients({ per_page: 2000, statut: 'actif' })
  const clients = _clientsData?.clients || []

  // Signature HTML (chargée depuis user_metadata) + toggle persistant (session)
  const [signatureHtml, setSignatureHtml] = useState<string>('')
  const [includeSignature, setIncludeSignature] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    if (typeof initial.includeSignature === 'boolean') return initial.includeSignature
    const v = localStorage.getItem('talentflow_include_signature')
    return v === null ? true : v === '1'
  })
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('talentflow_include_signature', includeSignature ? '1' : '0')
    }
  }, [includeSignature])

  // Persiste l'état du mailing dans sessionStorage à chaque changement
  useEffect(() => {
    if (typeof window === 'undefined') return
    const session: MailingSession = { candidatIds, destinataires, templateId, sujet, corps, includeSignature }
    const isEmpty = candidatIds.length === 0 && destinataires.length === 0 && !templateId && !sujet && !corps
    if (isEmpty) sessionStorage.removeItem(MAILING_KEY)
    else sessionStorage.setItem(MAILING_KEY, JSON.stringify(session))
  }, [candidatIds, destinataires, templateId, sujet, corps, includeSignature])

  const hasMailingData = candidatIds.length > 0 || destinataires.length > 0 || !!templateId || !!sujet || !!corps

  // v1.9.78 — charge documents[] à la demande (le /api/candidats list ne le remonte pas)
  // v1.9.79 — fix : /api/candidats/[id] retourne { candidat: {...} }, pas le candidat directement
  const loadCandidatDocs = async (id: string) => {
    if (candidatDocsCache[id]) return candidatDocsCache[id]
    try {
      const res = await fetch(`/api/candidats/${id}`)
      if (!res.ok) return []
      const data = await res.json()
      const docs = Array.isArray(data?.candidat?.documents) ? data.candidat.documents : []
      setCandidatDocsCache(prev => ({ ...prev, [id]: docs }))
      return docs
    } catch {
      return []
    }
  }

  const resetMailing = () => {
    setCandidatIds([])
    setDestinataires([])
    setTemplateId('')
    setSujet('')
    setCorps('')
    setContexteIA('')
    setCvAttached({})
    setExtraDocs({})
    setCiviliteByCandidat({})
    setCustomByCandidat({})
    if (typeof window !== 'undefined') sessionStorage.removeItem(MAILING_KEY)
    toast.success('Nouveau envoi')
  }

  // Charger le prénom du consultant + signature
  useEffect(() => {
    const supa = createSupaClient()
    supa.auth.getUser().then(({ data: { user } }) => {
      const meta = user?.user_metadata || {}
      setConsultantPrenom(meta.prenom || meta.first_name || (user?.email?.split('@')[0]) || '')
      setSignatureHtml(typeof meta.signature_html === 'string' ? meta.signature_html : '')
    })
  }, [])

  // Premier candidat sélectionné → contexte des variables
  const firstCandidat = candidatIds.length > 0
    ? (candidats as any[]).find((c: any) => c.id === candidatIds[0]) || null
    : null

  // Charger la customization CV (civilité + titre + résumé) pour le candidat actif
  useEffect(() => {
    if (!firstCandidat) return
    if (customByCandidat[firstCandidat.id]) return
    fetch(`/api/cv-customizations?candidat_id=${firstCandidat.id}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((json: any) => {
        const data = json?.customization?.data
        if (!data) return
        const civ = data.civilite
        if (civ === 'Monsieur' || civ === 'Madame' || civ === 'Monsieur/Madame') {
          setCiviliteByCandidat(prev => ({ ...prev, [firstCandidat.id]: civ }))
        }
        const cc = data.customContent || {}
        setCustomByCandidat(prev => ({
          ...prev,
          [firstCandidat.id]: {
            titre_poste: cc.titre_poste || undefined,
            resume_ia: cc.resume_ia || undefined,
            nom_complet: cc.nom_complet || undefined,
          },
        }))
      })
      .catch(() => {})
  }, [firstCandidat?.id])

  // Résout le client + contact à partir d'un email destinataire (matching dans contacts[])
  const resolveClientByEmail = (email: string): { client: Client | null; contact: any | null } => {
    const lower = (email || '').toLowerCase().trim()
    if (!lower) return { client: null, contact: null }
    for (const c of clients) {
      if ((c.email || '').toLowerCase().trim() === lower) {
        return { client: c, contact: null }
      }
      const contacts = Array.isArray(c.contacts) ? c.contacts : []
      for (const ct of contacts) {
        const ctEmail = (ct?.email || '').toLowerCase().trim()
        if (ctEmail && ctEmail === lower) return { client: c, contact: ct }
      }
    }
    return { client: null, contact: null }
  }

  // Construit le contexte de rendu pour un destinataire donné
  const buildRenderCtx = (destinataireEmail: string | null) => {
    const resolved = destinataireEmail ? resolveClientByEmail(destinataireEmail) : { client: null, contact: null }
    return {
      candidat: firstCandidat
        ? (() => {
            const cc = customByCandidat[firstCandidat.id]
            // Si le consultant a personnalisé le nom complet, on split sur le premier espace
            let prenom = firstCandidat.prenom
            let nom = firstCandidat.nom
            if (cc?.nom_complet && cc.nom_complet.trim()) {
              const parts = cc.nom_complet.trim().split(/\s+/)
              prenom = parts[0] || ''
              nom = parts.slice(1).join(' ')
            }
            return {
              prenom,
              nom,
              titre_poste: cc?.titre_poste || firstCandidat.titre_poste,
              genre: firstCandidat.genre,
              resume_ia: cc?.resume_ia || firstCandidat.resume_ia,
            }
          })()
        : null,
      client: resolved.client
        ? {
            nom_entreprise: resolved.client.nom_entreprise,
            contact_prenom: resolved.contact?.prenom || resolved.contact?.firstName || '',
            contact_nom: resolved.contact?.nom || resolved.contact?.lastName || '',
            contacts: resolved.client.contacts,
          }
        : null,
      consultant: { prenom: consultantPrenom },
      civilite_override: firstCandidat ? (civiliteByCandidat[firstCandidat.id] || null) : null,
      contexte_ia: contexteIA || null,
    }
  }

  // Preview : destinataire courant (flèches ← → permettent de naviguer en mode individual)
  // v1.9.70 : previewIdx + overrides per-destinataire
  const safeIdx = Math.min(previewIdx, Math.max(0, destinataires.length - 1))
  const previewDest = destinataires[safeIdx] || null
  const previewCtx = buildRenderCtx(previewDest)
  const previewResolved = previewDest ? resolveClientByEmail(previewDest) : { client: null, contact: null }
  const currentOverride = previewDest ? (overrides[previewDest] || {}) : {}
  const effectiveSujet = currentOverride.sujet ?? sujet
  const effectiveCorps = currentOverride.corps ?? corps
  const renderedSujet = renderTemplate(effectiveSujet, previewCtx)
  const renderedCorps = renderTemplate(effectiveCorps, previewCtx)
  const templateHasContexteIA = hasContexteIA(corps) || hasContexteIA(sujet)
  const hasCurrentOverride = !!(currentOverride.sujet != null || currentOverride.corps != null)
  const updateOverride = (email: string, patch: { sujet?: string; corps?: string }) => {
    setOverrides(prev => ({ ...prev, [email]: { ...(prev[email] || {}), ...patch } }))
  }
  const clearOverride = (email: string) => {
    setOverrides(prev => { const next = { ...prev }; delete next[email]; return next })
  }

  const handleGenerateContexteIA = async () => {
    if (!firstCandidat) {
      toast.error('Sélectionnez d\'abord un candidat')
      return
    }
    setGeneratingContexte(true)
    try {
      const res = await fetch('/api/templates/contexte-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ candidat_id: firstCandidat.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Erreur IA')
      setContexteIA(data.text || '')
      toast.success('Contexte IA généré')
    } catch (e: any) {
      toast.error(e?.message || 'Erreur génération')
    } finally {
      setGeneratingContexte(false)
    }
  }

  // Vérifier si l'utilisateur a son propre compte Outlook connecté
  useEffect(() => {
    fetch('/api/microsoft/email-status')
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => {
        if (data?.email) {
          setMsConfig({ configured: true, email: data.email, nom: data.nom_compte })
        } else {
          setMsConfig({ configured: false })
        }
      })
      .catch(() => setMsConfig({ configured: false }))
  }, [])

  // Quand on sélectionne des candidats (pas d'auto-ajout email)
  const handleCandidatChange = (ids: string[]) => {
    setCandidatIds(ids)
  }


  const handleTemplateChange = (id: string) => {
    setTemplateId(id)
    const t = templates?.find((t: any) => t.id === id)
    if (t) {
      // On garde le template brut — les variables seront remplacées dans la preview + à l'envoi
      setSujet(t.sujet || '')
      setCorps(t.corps || '')
      // Reset du contexte IA pour éviter d'injecter un ancien paragraphe
      setContexteIA('')
    }
  }

  const [doublonAlert, setDoublonAlert] = useState<{ doublons: any[]; onConfirm: () => void } | null>(null)
  const [showClientPicker, setShowClientPicker] = useState(false)

  const doSend = async () => {
    // v1.9.70 : 2 modes d'envoi
    // - individual : 1 mail par destinataire, personnalisé (comportement historique)
    // - grouped    : 1 seul mail avec tous les destinataires en À + CC en copie
    setSending(true)
    const sessionCampagneId: string = (globalThis as any).crypto?.randomUUID?.()
      ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
    try {
      let ok = 0
      let fail = 0

      if (sendMode === 'grouped') {
        // 1 seul appel : toRecipients = destinataires, ccRecipients = ccEmails
        // Variables {client_*} : prennent le 1er destinataire (affiché dans l'aperçu)
        const firstEmail = destinataires[0]
        const ctx = buildRenderCtx(firstEmail || null)
        const perSujet = renderTemplate(sujet, ctx)
        const perCorps = renderTemplate(corps, ctx)
        try {
          const res = await fetch('/api/microsoft/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              candidat_ids: candidatIds.length > 0 ? candidatIds : undefined,
              attach_cvs: Object.keys(cvAttached).length > 0,
              cv_options: Object.keys(cvAttached).length > 0 ? cvAttached : undefined,
              extra_docs: Object.keys(extraDocs).length > 0 ? extraDocs : undefined,
              destinataires,
              cc: ccEmails.length > 0 ? ccEmails : undefined,
              sujet: perSujet,
              corps: perCorps,
              use_bcc: false,
              send_mode: 'grouped',
              include_signature: includeSignature,
              campagne_id: sessionCampagneId,
            }),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error(data?.error || 'Erreur envoi')
          }
          ok = destinataires.length + ccEmails.length
        } catch (e: any) {
          fail = destinataires.length + ccEmails.length
          console.warn('[mailing grouped]', e?.message)
        }
      } else {
        // Mode individual : 1 mail par destinataire, personnalisé
        for (const email of destinataires) {
          const ctx = buildRenderCtx(email)
          const base = overrides[email] || {}
          const perSujet = renderTemplate(base.sujet ?? sujet, ctx)
          const perCorps = renderTemplate(base.corps ?? corps, ctx)
          try {
            const res = await fetch('/api/microsoft/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                candidat_ids: candidatIds.length > 0 ? candidatIds : undefined,
                attach_cvs: Object.keys(cvAttached).length > 0,
                cv_options: Object.keys(cvAttached).length > 0 ? cvAttached : undefined,
                extra_docs: Object.keys(extraDocs).length > 0 ? extraDocs : undefined,
                destinataires: [email],
                sujet: perSujet,
                corps: perCorps,
                use_bcc: false,
                include_signature: includeSignature,
                campagne_id: sessionCampagneId,
              }),
            })
            if (!res.ok) {
              const data = await res.json().catch(() => ({}))
              throw new Error(data?.error || 'Erreur envoi')
            }
            ok++
          } catch (e: any) {
            fail++
            console.warn('[mailing per-recipient]', email, e?.message)
          }
        }
      }

      if (ok > 0) {
        toast.success(
          ok === 1
            ? 'Email envoyé ✓'
            : `${ok} emails envoyés ✓${fail > 0 ? ` (${fail} échec${fail > 1 ? 's' : ''})` : ''}`,
        )
        setSent(true)
        setDoublonAlert(null)
        setTimeout(() => setSent(false), 3000)
        setCorps('')
        setSujet('')
        setContexteIA('')
      } else {
        toast.error('Aucun email envoyé')
      }
    } catch (e: any) {
      toast.error(`Erreur : ${e?.message || 'envoi'}`)
    } finally {
      setSending(false)
    }
  }

  const handleSend = async () => {
    if (destinataires.length === 0 || !sujet || !corps) return

    // v1.9.81 — Avertissement si des candidats sont attachés mais aucune pièce jointe (CV ou doc).
    // Cas typique : l'user ajoute le candidat au mailing mais oublie de cocher "CV original" ou "Docs".
    // On évite ainsi d'envoyer un mail type "propose profil" sans le CV à un client.
    if (candidatIds.length > 0) {
      const hasAnyCv = Object.keys(cvAttached).length > 0
      const hasAnyDoc = Object.values(extraDocs).some(arr => Array.isArray(arr) && arr.length > 0)
      if (!hasAnyCv && !hasAnyDoc) {
        const proceed = typeof window !== 'undefined' && window.confirm(
          'Aucune pièce jointe sélectionnée (ni CV, ni document).\n\n' +
          'Les candidats sont ajoutés au mail mais aucun fichier ne sera envoyé au destinataire.\n\n' +
          'Envoyer quand même ?'
        )
        if (!proceed) return
      }
    }

    // Vérifier les doublons si candidats sélectionnés
    if (candidatIds.length > 0 && destinataires.length > 0) {
      try {
        const params = new URLSearchParams({
          candidat_ids: candidatIds.join(','),
          destinataires: destinataires.join(','),
        })
        const res = await fetch(`/api/activites/check-doublon?${params}`)
        const data = await res.json()
        if (data.doublons && data.doublons.length > 0) {
          // Montrer l'alerte
          setDoublonAlert({ doublons: data.doublons, onConfirm: doSend })
          return
        }
      } catch {
        // En cas d'erreur de vérification, envoyer quand même
      }
    }
    doSend()
  }

  const labelStyle = { display: 'block' as const, fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Bandeau session mailing — bouton Nouveau envoi visible quand données présentes */}
      {hasMailingData && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', borderRadius: 10,
          border: '1.5px solid #C7D2FE', background: '#EEF2FF',
        }}>
          <div style={{ fontSize: 13, color: '#4338CA', fontWeight: 600 }}>
            ✉️ Brouillon en cours — {candidatIds.length} candidat{candidatIds.length > 1 ? 's' : ''}, {destinataires.length} destinataire{destinataires.length > 1 ? 's' : ''}
          </div>
          <button
            onClick={resetMailing}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              border: '1.5px solid #4F46E5', background: 'white', color: '#4F46E5',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            + Nouveau envoi
          </button>
        </div>
      )}

      {/* Microsoft Graph API Status — v1.9.78 : bandeau vert supprimé si connecté (bruit visuel).
          Bandeau jaune conservé si déconnecté + lien direct vers /parametres/profil pour re-connecter.
          v1.9.79 : affiche UNIQUEMENT après chargement (msConfig !== null) pour éviter le flash au mount. */}
      {msConfig === null || msConfig.configured ? null : (
        <div style={{ borderRadius: 12, border: '1.5px solid #FDE68A', background: 'var(--warning-soft)', padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <Mail size={16} color="var(--warning)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--warning)', margin: 0 }}>Compte Outlook non connecté</p>
            <p style={{ fontSize: 12, color: 'var(--warning)', marginTop: 2 }}>
              Connectez votre compte Outlook dans Paramètres pour envoyer des emails depuis votre adresse.
            </p>
          </div>
          <a href="/parametres/profil"
            className="neo-btn-yellow neo-btn-sm"
            style={{ whiteSpace: 'nowrap', textDecoration: 'none' }}>
            Mon profil →
          </a>
        </div>
      )}

      {/* SMTP Setup Modal */}
      <div style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: 'var(--card-shadow)' }}>
        {/* Candidats multi-select */}
        <div>
          <label style={labelStyle}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Users size={11} /> Candidats (dossiers à joindre)
            </span>
          </label>
          <MultiCandidatSearch
            candidats={candidats as any}
            selectedIds={candidatIds}
            onChange={handleCandidatChange}
            placeholder="Rechercher des candidats à joindre..."
          />
          {/* Liste candidats compacte — 1 ligne par candidat */}
          {candidatIds.length > 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 1, marginTop: 8,
              border: '1.5px solid var(--border)', borderRadius: 10,
              background: 'var(--background)', overflow: 'hidden',
            }}>
              {candidatIds.map((id, idx) => {
                const c = (candidats as any)?.find((cc: any) => cc.id === id)
                if (!c) return null
                const isAttached = !!cvAttached[id]
                const isOriginal = cvAttached[id]?.original === true
                const isPerso = isAttached && !isOriginal
                return (
                  <CandidateJoinRow
                    key={id}
                    candidat={c}
                    isPerso={isPerso}
                    isOriginal={isOriginal}
                    showBorderTop={idx > 0}
                    onEdit={() => setCvCandidatId(id)}
                    onToggleOriginal={() => {
                      if (isOriginal) {
                        setCvAttached(prev => { const n = { ...prev }; delete n[id]; return n })
                      } else {
                        setCvAttached(prev => ({ ...prev, [id]: { original: true } }))
                      }
                    }}
                    onRemove={() => {
                      setCandidatIds(prev => prev.filter(i => i !== id))
                      setCvAttached(prev => { const n = { ...prev }; delete n[id]; return n })
                      setExtraDocs(prev => { const n = { ...prev }; delete n[id]; return n })
                    }}
                    extraDocsSelected={extraDocs[id] || []}
                    candidatDocs={candidatDocsCache[id]}
                    onLoadDocs={() => loadCandidatDocs(id)}
                    onToggleDoc={(url) => {
                      setExtraDocs(prev => {
                        const current = prev[id] || []
                        const next = current.includes(url) ? current.filter(u => u !== url) : [...current, url]
                        const n = { ...prev }
                        if (next.length === 0) delete n[id]; else n[id] = next
                        return n
                      })
                    }}
                  />
                )
              })}
            </div>
          )}
          {/* v1.9.68 — Warning 7 jours : candidats déjà contactés */}
          {!warningDismissed && candidatIds.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <RecentContactsWarning
                candidats={candidatIds
                  .map((id) => (candidats as any)?.find((cc: any) => cc.id === id))
                  .filter(Boolean)
                  .map((c: any) => ({ id: c.id, prenom: c.prenom, nom: c.nom }))}
                contacts={recentContacts}
                onContinue={() => setWarningDismissed(true)}
                onDismiss={() => setWarningDismissed(true)}
              />
            </div>
          )}
        </div>

        {/* Template */}
        <div>
          <label style={labelStyle}>Template (optionnel)</label>
          <select
            value={templateId}
            onChange={e => handleTemplateChange(e.target.value)}
            style={{
              width: '100%', height: 42, padding: '0 14px',
              background: 'var(--card)', border: '2px solid var(--border)',
              borderRadius: 8, color: 'var(--foreground)',
              fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-body)',
              cursor: 'pointer', appearance: 'auto',
            }}
          >
            <option value="">Charger un template...</option>
            {templates?.map((t: any) => (
              <option key={t.id} value={t.id}>{t.nom}</option>
            ))}
          </select>
        </div>

        {/* Destinataires multi-email (v1.9.70 : mode À/CC ou individuel) */}
        <div>
          {/* Mode radio */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {([
              { k: 'individual' as const, label: 'Envoi individuel personnalisé', hint: '1 mail par destinataire · personnalisé' },
              { k: 'grouped' as const,    label: 'Envoi groupé À + CC',          hint: '1 seul mail avec destinataires visibles' },
            ]).map(m => {
              const active = sendMode === m.k
              return (
                <button
                  key={m.k}
                  type="button"
                  onClick={() => setSendMode(m.k)}
                  style={{
                    flex: 1, padding: '8px 10px',
                    border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                    background: active ? 'var(--primary-soft)' : 'var(--card)',
                    color: active ? 'var(--primary)' : 'var(--muted-foreground)',
                    borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                    textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 800 }}>{m.label}</span>
                  <span style={{ fontSize: 10, opacity: 0.8 }}>{m.hint}</span>
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>
              {sendMode === 'grouped' ? 'À (destinataires visibles) *' : 'Destinataires clients *'}
              {destinataires.length > 0 && (
                <span style={{ fontWeight: 500, textTransform: 'none', marginLeft: 8, fontSize: 10, color: 'var(--foreground)', background: 'var(--primary-soft)', padding: '1px 6px', borderRadius: 100 }}>
                  {destinataires.length} email{destinataires.length > 1 ? 's' : ''}
                  {sendMode === 'individual' ? ` — ${destinataires.length} mail${destinataires.length > 1 ? 's' : ''} séparé${destinataires.length > 1 ? 's' : ''}` : ''}
                </span>
              )}
            </label>
            <button
              onClick={() => setShowClientPicker(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 8,
                border: '2px solid var(--border)', background: 'var(--card)',
                color: 'var(--foreground)', fontSize: 12, fontWeight: 700,
                fontFamily: 'var(--font-body)', cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
              onMouseOver={e => e.currentTarget.style.borderColor = 'var(--primary)'}
              onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <Users size={13} />
              Choisir clients
            </button>
          </div>
          {/* v1.9.88 — Barre de recherche pour filtrer les destinataires (utile sur campagnes 50+) */}
          {destinataires.length >= 8 && (
            <div style={{ position: 'relative', marginBottom: 6 }}>
              <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input
                value={destinatairesFilter}
                onChange={e => setDestinatairesFilter(e.target.value)}
                placeholder={`Filtrer parmi ${destinataires.length} destinataires…`}
                style={{
                  width: '100%', height: 32, padding: '0 30px 0 28px',
                  border: '1.5px solid var(--border)', borderRadius: 8,
                  background: 'var(--card)', color: 'var(--foreground)',
                  fontSize: 12, fontFamily: 'inherit', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {destinatairesFilter && (
                <button
                  type="button"
                  onClick={() => setDestinatairesFilter('')}
                  title="Effacer le filtre"
                  style={{
                    position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                    width: 22, height: 22, borderRadius: 6, border: 'none', background: 'var(--secondary)',
                    cursor: 'pointer', color: 'var(--muted-foreground)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <X size={11} />
                </button>
              )}
            </div>
          )}
          <EmailChipInput
            value={destinataires}
            onChange={setDestinataires}
            filterQuery={destinatairesFilter}
            placeholder="Ajouter un email manuellement (appuyez Entrée)..."
          />

          {/* CC : affiché seulement en mode groupé ET si ≥1 destinataire À */}
          {sendMode === 'grouped' && destinataires.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <label style={{ ...labelStyle, marginBottom: 6 }}>
                CC (copie visible)
                {ccEmails.length > 0 && (
                  <span style={{ fontWeight: 500, textTransform: 'none', marginLeft: 8, fontSize: 10, color: 'var(--foreground)', background: 'var(--info-soft)', padding: '1px 6px', borderRadius: 100 }}>
                    {ccEmails.length}
                  </span>
                )}
              </label>
              <EmailChipInput
                value={ccEmails}
                onChange={setCcEmails}
                placeholder="Ajouter en copie (appuyez Entrée)..."
              />
            </div>
          )}

          {sendMode === 'grouped' && (
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.4 }}>
              ℹ️ 1 seul email est envoyé : tous les destinataires À se voient, les CC aussi.
              Les variables <code>{'{client_prenom}'}</code>, <code>{'{client_nom}'}</code> prennent le 1<sup>er</sup> destinataire.
            </p>
          )}
        </div>

        <div>
          <label style={labelStyle}>Sujet *</label>
          <Input value={sujet} onChange={e => setSujet(e.target.value)} placeholder="Objet de l'email..." required />
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Message *</label>
            {templateHasContexteIA && (
              <button
                type="button"
                onClick={handleGenerateContexteIA}
                disabled={!firstCandidat || generatingContexte}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '5px 12px', borderRadius: 8,
                  border: '2px solid var(--border)',
                  background: contexteIA ? '#D1FAE5' : 'var(--card)',
                  color: contexteIA ? '#065F46' : 'var(--foreground)',
                  fontSize: 12, fontWeight: 700,
                  cursor: !firstCandidat || generatingContexte ? 'not-allowed' : 'pointer',
                  opacity: !firstCandidat || generatingContexte ? 0.5 : 1,
                  fontFamily: 'var(--font-body)',
                }}
                title={!firstCandidat ? 'Sélectionnez un candidat pour activer' : 'Générer le paragraphe de présentation'}
              >
                {generatingContexte ? '…' : contexteIA ? <><Check size={12} /> Contexte IA</> : '✨ Générer contexte IA'}
              </button>
            )}
          </div>
          <Textarea
            value={corps}
            onChange={e => setCorps(e.target.value)}
            placeholder="Rédigez votre message..."
            rows={8}
            style={{ resize: 'none', fontFamily: 'monospace', fontSize: 13 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>
              Variables : {TEMPLATE_VARS.map(v => v.key).join(', ')}
            </p>
            {signatureHtml && (
              <label style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 11, color: 'var(--muted)', cursor: 'pointer', userSelect: 'none',
              }}>
                <input
                  type="checkbox"
                  checked={includeSignature}
                  onChange={e => setIncludeSignature(e.target.checked)}
                  style={{ accentColor: '#8B5CF6' }}
                />
                Inclure ma signature
              </label>
            )}
          </div>

          {/* Preview — rendu avec les variables remplacées */}
          {/* v1.9.70 : fond blanc forcé + flèches ←→ + éditeur per-destinataire en mode individual */}
          {(sujet || corps) && (
            <div style={{
              marginTop: 12, padding: '4px',
              background: 'var(--secondary)', border: '1.5px dashed var(--border)',
              borderRadius: 10,
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: 'var(--muted)',
                padding: '8px 10px 6px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap',
              }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {/* Flèches : seulement en mode individual ET si >1 destinataire */}
                  {sendMode === 'individual' && destinataires.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setPreviewIdx(i => (i - 1 + destinataires.length) % destinataires.length)}
                        title="Destinataire précédent"
                        style={{
                          width: 22, height: 22, borderRadius: 6,
                          border: '1px solid var(--border)', background: 'var(--card)',
                          color: 'var(--foreground)', cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontFamily: 'inherit',
                        }}
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewIdx(i => (i + 1) % destinataires.length)}
                        title="Destinataire suivant"
                        style={{
                          width: 22, height: 22, borderRadius: 6,
                          border: '1px solid var(--border)', background: 'var(--card)',
                          color: 'var(--foreground)', cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontFamily: 'inherit',
                        }}
                      >
                        →
                      </button>
                    </>
                  )}
                  <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, lineHeight: 1.3 }}>
                    <span>
                      Aperçu {firstCandidat ? `— ${firstCandidat.prenom} ${firstCandidat.nom}` : ''}
                      {previewDest ? ` → ${previewResolved.client?.nom_entreprise || previewDest}` : ''}
                      {sendMode === 'individual' && destinataires.length > 1 ? ` (${safeIdx + 1}/${destinataires.length})` : ''}
                      {hasCurrentOverride && (
                        <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 99, background: 'var(--warning-soft)', color: 'var(--warning)', fontWeight: 800 }}>
                          ✏️ Personnalisé
                        </span>
                      )}
                    </span>
                    {/* v1.9.88 — Email destinataire visible dans l'aperçu pour identifier sans ambiguïté */}
                    {previewDest && (
                      <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--muted-foreground)', textTransform: 'none', letterSpacing: 0 }}>
                        ✉️ {previewDest}
                      </span>
                    )}
                  </span>
                </span>
                {sendMode === 'individual' && previewDest && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {hasCurrentOverride && (
                      <button
                        type="button"
                        onClick={() => clearOverride(previewDest)}
                        title="Réinitialiser ce mail (revenir au template global)"
                        style={{
                          padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                          border: '1px solid var(--destructive)', background: 'var(--destructive-soft)',
                          color: 'var(--destructive)', cursor: 'pointer', fontFamily: 'inherit',
                          textTransform: 'uppercase', letterSpacing: '0.04em',
                        }}
                      >
                        Réinitialiser
                      </button>
                    )}
                    {/* v1.9.87 — Bug fix : le bouton "✏️ Éditer" appelait clearOverride() en mode édition,
                        ce qui effaçait les modifications. Désormais :
                        - Mode "pas encore personnalisé" → bouton "Personnaliser ce mail" (créé l'override + ouvre l'éditeur)
                        - Mode "personnalisé" → badge statique "✓ Personnalisé" non-cliquable.
                          Pour annuler, le user clique le bouton rouge "Réinitialiser" à gauche.
                        Les modifs dans l'éditeur sont enregistrées en temps réel via onChange. */}
                    {hasCurrentOverride ? (
                      <span
                        title="Mail personnalisé pour ce destinataire (modifications enregistrées en temps réel)"
                        style={{
                          padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                          border: '1px solid var(--primary)',
                          background: 'var(--primary-soft)',
                          color: 'var(--primary)',
                          fontFamily: 'inherit',
                          textTransform: 'uppercase', letterSpacing: '0.04em',
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        ✓ Personnalisé
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => updateOverride(previewDest, { sujet: effectiveSujet, corps: effectiveCorps })}
                        style={{
                          padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                          border: '1px solid var(--border)',
                          background: 'var(--card)',
                          color: 'var(--foreground)',
                          cursor: 'pointer', fontFamily: 'inherit',
                          textTransform: 'uppercase', letterSpacing: '0.04em',
                        }}
                      >
                        Personnaliser ce mail
                      </button>
                    )}
                    {/* v1.9.88 — Bouton Retirer destinataire directement depuis l'aperçu (rapidité). */}
                    <button
                      type="button"
                      onClick={() => {
                        if (!previewDest) return
                        const ok = typeof window === 'undefined' || window.confirm(
                          `Retirer ${previewDest} de la liste des destinataires ?`
                        )
                        if (!ok) return
                        setDestinataires(prev => prev.filter(e => e !== previewDest))
                        setOverrides(prev => { const n = { ...prev }; delete n[previewDest]; return n })
                      }}
                      title="Retirer ce destinataire de l'envoi"
                      style={{
                        padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                        border: '1px solid var(--destructive)', background: 'var(--card)',
                        color: 'var(--destructive)', cursor: 'pointer', fontFamily: 'inherit',
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      🗑 Retirer
                    </button>
                  </span>
                )}
              </div>

              {/* Éditeur per-destinataire — visible seulement si override actif */}
              {sendMode === 'individual' && previewDest && hasCurrentOverride && (
                <div style={{
                  padding: '10px 12px', borderRadius: 8,
                  background: 'var(--warning-soft)', border: '1px solid var(--warning)',
                  margin: '0 4px 8px', display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--warning)' }}>
                    Mail spécifique pour {previewResolved.client?.nom_entreprise || previewDest}
                  </div>
                  <input
                    value={currentOverride.sujet ?? sujet}
                    onChange={e => updateOverride(previewDest, { sujet: e.target.value })}
                    placeholder="Sujet pour ce destinataire"
                    style={{
                      width: '100%', height: 34, padding: '0 10px',
                      border: '1.5px solid var(--border)', borderRadius: 7,
                      background: 'var(--card)', color: 'var(--foreground)',
                      fontSize: 12, fontFamily: 'var(--font-body)', outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <textarea
                    value={currentOverride.corps ?? corps}
                    onChange={e => updateOverride(previewDest, { corps: e.target.value })}
                    rows={6}
                    placeholder="Corps pour ce destinataire (variables supportées)"
                    style={{
                      width: '100%', padding: '8px 10px',
                      border: '1.5px solid var(--border)', borderRadius: 7,
                      background: 'var(--card)', color: 'var(--foreground)',
                      fontSize: 12, fontFamily: 'monospace', resize: 'vertical', outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}

              <div style={{
                background: '#ffffff',
                color: '#000000',
                borderRadius: 7,
                padding: '14px 16px',
                minHeight: 120,
              }}>
                {renderedSujet && (
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#000000', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #e5e7eb' }}>
                    {renderedSujet}
                  </div>
                )}
                <div style={{ fontSize: 13, color: '#000000', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
                  {renderedCorps}
                </div>
                {includeSignature && signatureHtml && (
                  <div
                    style={{ marginTop: 14 }}
                    dangerouslySetInnerHTML={{ __html: signatureHtml }}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <p style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
              <Mail size={12} />{msConfig?.configured ? `Envoi depuis ${msConfig.email}` : 'Microsoft 365 non connecté'} {destinataires.length > 1 ? `· ${destinataires.length} emails individuels` : ''}
            </p>
            {Object.keys(cvAttached).length > 0 && (
              <p style={{ fontSize: 11, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4, margin: 0, fontWeight: 600 }}>
                <Paperclip size={11} /> {Object.keys(cvAttached).length} CV{Object.keys(cvAttached).length > 1 ? 's' : ''} joint{Object.keys(cvAttached).length > 1 ? 's' : ''} au mail
              </p>
            )}
            {/* v1.9.78 — total docs additionnels joints, toutes cats confondues */}
            {(() => {
              const total = Object.values(extraDocs).reduce((acc, arr) => acc + arr.length, 0)
              if (total === 0) return null
              return (
                <p style={{ fontSize: 11, color: 'var(--info)', display: 'flex', alignItems: 'center', gap: 4, margin: 0, fontWeight: 600 }}>
                  <Paperclip size={11} /> {total} document{total > 1 ? 's' : ''} additionnel{total > 1 ? 's' : ''} joint{total > 1 ? 's' : ''}
                </p>
              )
            })()}
          </div>
          <Button onClick={handleSend} disabled={destinataires.length === 0 || !sujet || !corps || sending || sent}>
            {sent ? (
              <><Check className="w-3.5 h-3.5 mr-2" />Envoyé</>
            ) : (
              <><Send className="w-3.5 h-3.5 mr-2" />{sending ? 'Envoi...' : `Envoyer${destinataires.length > 1 ? ` (${destinataires.length})` : ''}`}</>
            )}
          </Button>
        </div>
      </div>

      {/* Client Picker Modal */}
      {showClientPicker && (
        <ClientPickerModal
          onClose={() => setShowClientPicker(false)}
          onConfirm={(emails) => {
            setDestinataires(prev => {
              const merged = [...prev]
              for (const e of emails) {
                if (!merged.includes(e)) merged.push(e)
              }
              return merged
            })
            setShowClientPicker(false)
          }}
          alreadySelected={destinataires}
        />
      )}

      {/* Alerte doublon envoi — rendue via Portal (CLAUDE.md #10) */}
      {doublonAlert && typeof window !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setDoublonAlert(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--card)', borderRadius: 16,
            width: '100%', maxWidth: 520, maxHeight: '90vh',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: '28px 28px 0', flexShrink: 0 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12, margin: '0 auto 16px',
                background: 'rgba(245,158,11,0.12)', border: '2px solid rgba(245,158,11,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 24 }}>⚠️</span>
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--foreground)', margin: '0 0 8px', textAlign: 'center' }}>
                Envoi déjà effectué
              </h3>
              <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 16px', textAlign: 'center', lineHeight: 1.5 }}>
                {doublonAlert.doublons.length === 1 ? 'Ce candidat a déjà été envoyé à ce destinataire' : `${doublonAlert.doublons.length} envois similaires détectés`} :
              </p>
            </div>
            <div style={{ padding: '0 28px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {doublonAlert.doublons.map((d: any, i: number) => (
                  <div key={i} style={{
                    background: 'var(--warning-soft)', border: '1.5px solid var(--warning-soft)', borderRadius: 10,
                    padding: '10px 14px', fontSize: 13,
                  }}>
                    <div style={{ fontWeight: 700, color: 'var(--warning)' }}>
                      {d.candidat_nom || 'Candidat'} → {d.destinataire}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 2 }}>
                      Envoyé le {new Date(d.date).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })} à {new Date(d.date).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h')}
                      {d.user_name ? ` par ${d.user_name}` : ''}
                    </div>
                    {(d.sujet || d.client_nom) && (
                      <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {d.sujet && <span>« {d.sujet} »</span>}
                        {d.client_nom && <span>· {d.client_nom}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', padding: '16px 28px 24px', borderTop: '1.5px solid var(--border)', background: 'var(--card)', borderBottomLeftRadius: 16, borderBottomRightRadius: 16, flexShrink: 0 }}>
              <button onClick={() => setDoublonAlert(null)} style={{
                height: 42, padding: '0 20px', borderRadius: 8,
                border: '1.5px solid var(--border)', background: 'var(--muted)',
                color: 'var(--foreground)', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
                Annuler
              </button>
              <button onClick={() => { doublonAlert.onConfirm(); setDoublonAlert(null) }}
                className="neo-btn-yellow">
                Envoyer quand même
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Modale Personnaliser CV */}
      {cvCandidatId && (() => {
        const cvCandidat = (candidats as any)?.find((cc: any) => cc.id === cvCandidatId)
        return cvCandidat ? (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '95vw', maxWidth: 1200, height: '90vh', background: 'var(--card)', borderRadius: 16, overflow: 'hidden' }}>
              <CVCustomizer
                candidat={cvCandidat}
                onClose={() => setCvCandidatId(null)}
                mode="mailing"
                onAttach={(id, opts) => {
                  setCvAttached(prev => ({ ...prev, [id]: opts }))
                }}
              />
            </div>
          </div>
        ) : null
      })()}
    </div>
  )
}

// ─── Templates Tab ────────────────────────────────────────────────────────────

// v1.9.68 — Métadonnées canaux templates (unifiées avec CANAL_META historique).
const TEMPLATE_CANAL_META: Record<'email' | 'sms' | 'whatsapp', { label: string; icon: string; color: string; bg: string; description: string }> = {
  email:    { label: 'Email',     icon: '✉️', color: 'var(--info)',    bg: 'var(--info-soft)',    description: 'Envoi depuis /messages → Mailing' },
  sms:      { label: 'iMessage',  icon: '💬', color: 'var(--primary)', bg: 'var(--primary-soft)', description: 'Envoi bulk iMessage depuis /candidats' },
  whatsapp: { label: 'WhatsApp',  icon: '📱', color: 'var(--success)', bg: 'var(--success-soft)', description: 'Envoi bulk WhatsApp depuis /candidats' },
}

// Variables exposées dans le builder : courtes + email-only
const VAR_GROUPS = {
  common: [
    { key: '{prenom}',   label: 'Prénom candidat',     example: 'Pedro' },
    { key: '{nom}',      label: 'Nom candidat',        example: 'Silva' },
    { key: '{metier}',   label: 'Métier / titre poste', example: 'Maçon' },
    { key: '{civilite}', label: 'Civilité',            example: 'Monsieur' },
  ],
  emailOnly: [
    { key: '{client_prenom}',     label: 'Prénom contact client' },
    { key: '{client_nom}',        label: 'Nom contact client' },
    { key: '{client_entreprise}', label: 'Nom entreprise cliente' },
    { key: '{consultant_prenom}', label: 'Votre prénom (signature)' },
    { key: '{resume_ia}',         label: 'Résumé IA du candidat' },
    { key: '{contexte_ia}',       label: 'Paragraphe IA contextualisé' },
    { key: '{un_e}',              label: 'Article accordé (un/une)' },
  ],
}

function TemplatesTab() {
  const [showCreate, setShowCreate] = useState(false)
  // v1.9.83 — mode édition : stocke le template en cours de modif
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null)
  const { data: templates, isLoading, refetch } = useEmailTemplates() // tous canaux
  const queryClient = useQueryClient()

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/email-templates?id=${id}`, { method: 'DELETE' })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] })
      toast.success('Template supprimé')
    },
  })

  // Copier template SMS → nouveau WhatsApp (ou inverse)
  const copyToCanal = async (t: any, targetCanal: 'email' | 'sms' | 'whatsapp') => {
    const meta = TEMPLATE_CANAL_META[targetCanal]
    const newName = t.nom.includes(`→ ${meta.label}`) ? t.nom : `${t.nom} → ${meta.label}`
    try {
      const res = await fetch('/api/email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: newName,
          sujet: targetCanal === 'email' ? (t.sujet || '') : null,
          corps: t.corps,
          type: targetCanal,
          categorie: 'general',
        }),
      })
      if (!res.ok) throw new Error()
      queryClient.invalidateQueries({ queryKey: ['email-templates'] })
      toast.success(`Copié vers ${meta.label}`)
    } catch {
      toast.error('Erreur lors de la copie')
    }
  }

  // Group by canal (type) au lieu de catégorie
  const byCanal: Record<'email' | 'sms' | 'whatsapp', any[]> = { email: [], sms: [], whatsapp: [] }
  for (const t of (templates || [])) {
    const canal = ((t as any).type || 'email') as 'email' | 'sms' | 'whatsapp'
    if (byCanal[canal]) byCanal[canal].push(t)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="neo-btn-yellow" onClick={() => setShowCreate(true)}>
          <Plus size={15} />
          Nouveau template
        </button>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ height: 96, background: 'var(--secondary)', borderRadius: 12, animation: 'pulse 2s infinite' }} />
          ))}
        </div>
      ) : (templates || []).length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 0' }}>
          <FileText size={40} color="var(--border)" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)', margin: 0 }}>Aucun template</p>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Créez des templates pour accélérer vos communications</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {(['email', 'sms', 'whatsapp'] as const).map(canal => {
            const items = byCanal[canal]
            if (items.length === 0) return null
            const meta = TEMPLATE_CANAL_META[canal]
            return (
              <div key={canal}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 99,
                    background: meta.bg, color: meta.color,
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>
                    <span>{meta.icon}</span> {meta.label}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {items.length} template{items.length > 1 ? 's' : ''} · {meta.description}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {items.map((t: any) => (
                    <div key={t.id} style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 12, padding: 16, boxShadow: 'var(--card-shadow)' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8, gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>{t.nom}</h3>
                          {canal === 'email' && t.sujet && (
                            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, marginBottom: 0 }}>Sujet : {t.sujet}</p>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          {canal !== 'whatsapp' && (
                            <button
                              onClick={() => copyToCanal(t, 'whatsapp')}
                              title="Copier vers WhatsApp"
                              style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                background: 'var(--success-soft)', border: '1px solid var(--success-soft)',
                                color: 'var(--success)', cursor: 'pointer',
                                padding: '4px 9px', borderRadius: 7,
                                fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
                              }}
                            >
                              📱 Copier vers WhatsApp
                            </button>
                          )}
                          {canal !== 'sms' && canal !== 'whatsapp' && (
                            <button
                              onClick={() => copyToCanal(t, 'sms')}
                              title="Copier vers iMessage"
                              style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                background: 'var(--primary-soft)', border: '1px solid var(--primary-soft)',
                                color: 'var(--primary)', cursor: 'pointer',
                                padding: '4px 9px', borderRadius: 7,
                                fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
                              }}
                            >
                              💬 Copier vers iMessage
                            </button>
                          )}
                          {/* v1.9.83 — bouton Modifier */}
                          <button
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 6, color: 'var(--muted)' }}
                            onClick={() => setEditingTemplate(t)}
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
                            title="Modifier"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 6, color: 'var(--muted)' }}
                            onClick={() => deleteTemplate.mutate(t.id)}
                            onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
                            title="Supprimer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, fontFamily: 'monospace', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, margin: 0 }}>
                        {t.corps}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Nouveau template</DialogTitle>
          </DialogHeader>
          <CreateTemplateForm onSuccess={() => { setShowCreate(false); refetch() }} />
        </DialogContent>
      </Dialog>

      {/* v1.9.83 — Dialog édition (réutilise CreateTemplateForm en mode PATCH) */}
      <Dialog open={!!editingTemplate} onOpenChange={(open) => { if (!open) setEditingTemplate(null) }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Modifier le template</DialogTitle>
          </DialogHeader>
          {editingTemplate && (
            <CreateTemplateForm
              initialTemplate={editingTemplate}
              onSuccess={() => { setEditingTemplate(null); refetch() }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CreateTemplateForm({ onSuccess, initialTemplate }: { onSuccess: () => void; initialTemplate?: { id: string; nom: string; sujet?: string | null; corps: string; type: 'email' | 'sms' | 'whatsapp' } | null }) {
  // v1.9.83 — Mode édition si initialTemplate fourni (PATCH au lieu de POST)
  const isEdit = !!initialTemplate?.id
  const [nom, setNom] = useState(initialTemplate?.nom || '')
  const [canal, setCanal] = useState<'email' | 'sms' | 'whatsapp'>(initialTemplate?.type || 'email')
  const [sujet, setSujet] = useState(initialTemplate?.sujet || '')
  const [corps, setCorps] = useState(initialTemplate?.corps || '')
  const corpsRef = useRef<HTMLTextAreaElement>(null)
  const createTemplate = useCreateTemplate()
  const queryClient = useQueryClient()
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      nom,
      sujet: canal === 'email' ? (sujet || null) : null,
      corps,
      type: canal,
      categorie: 'general',
    }
    if (isEdit && initialTemplate) {
      // PATCH — édition in-place
      setSaving(true)
      try {
        const res = await fetch(`/api/email-templates?id=${initialTemplate.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error()
        queryClient.invalidateQueries({ queryKey: ['email-templates'] })
        toast.success('Template modifié')
        onSuccess()
      } catch {
        toast.error('Erreur lors de la modification')
      } finally {
        setSaving(false)
      }
      return
    }
    createTemplate.mutate(payload, { onSuccess })
  }

  const insertVar = (varKey: string) => {
    const el = corpsRef.current
    if (!el) { setCorps(c => c + varKey); return }
    const start = el.selectionStart ?? corps.length
    const end = el.selectionEnd ?? corps.length
    const next = corps.slice(0, start) + varKey + corps.slice(end)
    setCorps(next)
    // Positionner le curseur après la variable insérée
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + varKey.length
      el.setSelectionRange(pos, pos)
    })
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Nom du template *</label>
        <input value={nom} onChange={e => setNom(e.target.value)} placeholder="ex: Invitation entretien" required style={{
          width: '100%', height: 42, padding: '0 14px', background: 'var(--card)', border: '2px solid var(--border)',
          borderRadius: 8, color: 'var(--foreground)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none',
        }} />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
          Canal d&apos;envoi *
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {(['email', 'sms', 'whatsapp'] as const).map(k => {
            const meta = TEMPLATE_CANAL_META[k]
            const active = canal === k
            return (
              <button
                key={k}
                type="button"
                onClick={() => setCanal(k)}
                style={{
                  padding: '10px 12px', borderRadius: 10,
                  border: `1.5px solid ${active ? meta.color : 'var(--border)'}`,
                  background: active ? meta.bg : 'var(--card)',
                  color: active ? meta.color : 'var(--muted-foreground)',
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: 16 }}>{meta.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 800 }}>{meta.label}</span>
                <span style={{ fontSize: 10, color: active ? meta.color : 'var(--muted)', textAlign: 'center', lineHeight: 1.3, marginTop: 2 }}>
                  {meta.description}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {canal === 'email' && (
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Sujet</label>
          <input value={sujet} onChange={e => setSujet(e.target.value)} placeholder="Objet de l'email…" style={{
            width: '100%', height: 42, padding: '0 14px', background: 'var(--card)', border: '2px solid var(--border)',
            borderRadius: 8, color: 'var(--foreground)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none',
          }} />
        </div>
      )}

      <div>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Corps du message *</label>
        <textarea
          ref={corpsRef}
          value={corps}
          onChange={e => setCorps(e.target.value)}
          placeholder="Bonjour {prenom}, nous avons une opportunité..."
          rows={6}
          required
          style={{
            width: '100%', padding: '12px 14px', background: 'var(--card)', border: '2px solid var(--border)',
            borderRadius: 8, color: 'var(--foreground)', fontSize: 13, fontFamily: 'monospace', outline: 'none', resize: 'vertical',
          }}
        />
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, lineHeight: 1.55 }}>
          <div style={{ fontWeight: 700, color: 'var(--muted-foreground)', marginBottom: 4 }}>
            Variables (cliquer pour insérer) — disponibles sur les 3 canaux :
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
            {VAR_GROUPS.common.map(v => (
              <button
                key={v.key}
                type="button"
                onClick={() => insertVar(v.key)}
                title={`${v.label} — ex: ${v.example}`}
                style={{
                  fontSize: 11, padding: '3px 8px', borderRadius: 6,
                  background: 'var(--primary-soft)', color: 'var(--primary)',
                  border: '1px solid var(--primary-soft)', cursor: 'pointer',
                  fontFamily: 'monospace', fontWeight: 700,
                }}
              >
                {v.key}
              </button>
            ))}
          </div>
          {canal === 'email' && (
            <>
              <div style={{ fontWeight: 700, color: 'var(--muted-foreground)', marginBottom: 4 }}>
                Variables Email uniquement :
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {VAR_GROUPS.emailOnly.map(v => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVar(v.key)}
                    title={v.label}
                    style={{
                      fontSize: 11, padding: '3px 8px', borderRadius: 6,
                      background: 'var(--info-soft)', color: 'var(--info)',
                      border: '1px solid var(--info-soft)', cursor: 'pointer',
                      fontFamily: 'monospace', fontWeight: 700,
                    }}
                  >
                    {v.key}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="submit"
          className="neo-btn-yellow"
          disabled={!nom || !corps || createTemplate.isPending || saving}
          style={{ opacity: (!nom || !corps || createTemplate.isPending || saving) ? 0.5 : 1 }}
        >
          {isEdit
            ? (saving ? 'Enregistrement...' : 'Enregistrer les modifications')
            : (createTemplate.isPending ? 'Création...' : 'Créer le template')}
        </button>
      </div>
    </form>
  )
}

// ─── Historique Tab (v1.9.60) ─────────────────────────────────────────────────
// v1.9.68 : Historique global team — tous les envois du team sont visibles avec
// "envoyé par X". Le bouton supprimer n'apparaît que sur les envois du user courant.

interface HistoriqueCampagne {
  campagne_id: string
  created_at: string
  sujet: string
  destinataires: string[]
  nb_destinataires: number
  candidat_ids: string[]
  nb_candidats: number
  candidats: { id: string; prenom: string | null; nom: string | null }[]
  client_nom: string | null
  cv_personnalise: boolean
  cv_urls_utilises: string[]
  corps_extract: string
  statut: string
  canal: 'email' | 'imessage' | 'whatsapp' | 'sms'
  user_id: string | null
  user_name: string | null
  is_own: boolean
}

// v1.9.66 — canaux unifiés dans l'historique
const CANAL_META: Record<HistoriqueCampagne['canal'], { label: string; icon: string; color: string; bg: string }> = {
  email:    { label: 'Email',    icon: '✉️', color: 'var(--info)',     bg: 'var(--info-soft)' },
  imessage: { label: 'iMessage', icon: '💬', color: 'var(--primary)',  bg: 'var(--primary-soft)' },
  whatsapp: { label: 'WhatsApp', icon: '📱', color: 'var(--success)',  bg: 'var(--success-soft)' },
  sms:      { label: 'SMS',      icon: '📨', color: 'var(--warning)',  bg: 'var(--warning-soft)' },
}

function HistoriqueTab() {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  // v1.9.66 — filtre par canal (email/imessage/whatsapp/sms ou '' = tous)
  const [canalFilter, setCanalFilter] = useState<'' | HistoriqueCampagne['canal']>('')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['emails-history', search, canalFilter],
    queryFn: async () => {
      const url = new URL('/api/emails/history', window.location.origin)
      if (search) url.searchParams.set('search', search)
      if (canalFilter) url.searchParams.set('canal', canalFilter)
      url.searchParams.set('limit', '100')
      const res = await fetch(url.toString())
      if (!res.ok) return { campagnes: [] as HistoriqueCampagne[] }
      return (await res.json()) as { campagnes: HistoriqueCampagne[] }
    },
    staleTime: 30_000,
  })

  const campagnes = data?.campagnes ?? []

  const deleteAll = async () => {
    if (!confirm(`Supprimer tout l'historique de ${campagnes.length} envoi${campagnes.length > 1 ? 's' : ''} ? Action irréversible.`)) return
    try {
      const res = await fetch('/api/emails/history', { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Historique vidé')
      refetch()
    } catch {
      toast.error('Erreur lors de la suppression')
    }
  }

  const deleteOne = async (c: HistoriqueCampagne) => {
    if (!confirm('Supprimer cet envoi de l\'historique ?')) return
    try {
      const body = c.campagne_id.startsWith('legacy-')
        ? { legacy_id: c.campagne_id }
        : { campagne_id: c.campagne_id }
      const res = await fetch('/api/emails/history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      toast.success('Envoi supprimé')
      refetch()
    } catch {
      toast.error('Erreur lors de la suppression')
    }
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher par sujet, candidat, destinataire, client…"
            style={{
              width: '100%', padding: '9px 12px 9px 36px', borderRadius: 10,
              border: '1.5px solid var(--border)', background: 'var(--background)',
              color: 'var(--foreground)', fontSize: 13, fontFamily: 'inherit', outline: 'none',
            }}
          />
        </div>
        <button
          onClick={() => refetch()}
          style={{
            padding: '9px 14px', borderRadius: 10, cursor: 'pointer',
            background: 'var(--secondary)', border: '1.5px solid var(--border)',
            color: 'var(--foreground)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
          }}
        >
          Actualiser
        </button>
        {campagnes.length > 0 && (
          <button
            onClick={deleteAll}
            title="Supprimer tout l'historique"
            style={{
              padding: '9px 14px', borderRadius: 10, cursor: 'pointer',
              background: 'var(--destructive-soft)', border: '1.5px solid var(--destructive-soft)',
              color: 'var(--destructive)', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <Trash2 size={13} />
            Vider
          </button>
        )}
      </div>

      {/* v1.9.66 — Filtres canal (tabs) */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {([
          { k: '',         label: 'Tous',     icon: '🗂️' },
          { k: 'email',    label: 'Email',    icon: '✉️' },
          { k: 'imessage', label: 'iMessage', icon: '💬' },
          { k: 'whatsapp', label: 'WhatsApp', icon: '📱' },
          { k: 'sms',      label: 'SMS',      icon: '📨' },
        ] as const).map(t => {
          const active = canalFilter === t.k
          return (
            <button
              key={t.k}
              onClick={() => setCanalFilter(t.k as any)}
              style={{
                padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                background: active ? 'var(--primary-soft)' : 'var(--card)',
                color: active ? 'var(--foreground)' : 'var(--muted-foreground)',
                fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <span>{t.icon}</span>{t.label}
            </button>
          )
        })}
      </div>

      {/* État chargement / vide */}
      {isLoading && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Chargement de l'historique…
        </div>
      )}
      {!isLoading && campagnes.length === 0 && (
        <div style={{
          padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13,
          border: '1.5px dashed var(--border)', borderRadius: 12,
        }}>
          Aucun envoi pour le moment.
          <br />
          Tes prochaines campagnes email apparaîtront ici.
        </div>
      )}

      {/* Liste */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {campagnes.map((c: HistoriqueCampagne) => {
          const isOpen = expanded === c.campagne_id
          const when = new Date(c.created_at)
          const dateStr = when.toLocaleDateString('fr-CH', { day: '2-digit', month: 'short', year: 'numeric' })
          const timeStr = when.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })
          return (
            <div
              key={c.campagne_id}
              style={{
                border: '1.5px solid var(--border)', borderRadius: 12,
                background: 'var(--card)', overflow: 'hidden',
                transition: 'border-color 0.15s',
                position: 'relative',
              }}
            >
              {/* Bouton supprimer — croix top-right.
                  v1.9.79 : Option A — team share global, chacun peut supprimer n'importe quel envoi (cohérent avec SELECT/team). */}
              <button
                onClick={(e) => { e.stopPropagation(); deleteOne(c) }}
                title="Supprimer cet envoi"
                style={{
                  position: 'absolute', top: 10, right: 10, zIndex: 2,
                  width: 28, height: 28, borderRadius: 8,
                  background: 'transparent', border: '1px solid transparent',
                  color: 'var(--muted-foreground)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--destructive-soft)'
                  e.currentTarget.style.color = 'var(--destructive)'
                  e.currentTarget.style.borderColor = 'var(--destructive-soft)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--muted-foreground)'
                  e.currentTarget.style.borderColor = 'transparent'
                }}
              >
                <Trash2 size={13} />
              </button>
              {/* Ligne principale */}
              <button
                onClick={() => setExpanded(isOpen ? null : c.campagne_id)}
                style={{
                  width: '100%', padding: '14px 48px 14px 16px', background: 'transparent',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'inherit',
                }}
              >
                <span style={{ color: 'var(--muted)', flexShrink: 0 }}>
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                    {(() => {
                      const meta = CANAL_META[c.canal] || CANAL_META.email
                      return (
                        <span style={{
                          fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 4,
                          background: meta.bg, color: meta.color,
                          textTransform: 'uppercase', letterSpacing: '0.04em',
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}>
                          <span>{meta.icon}</span>{meta.label}
                        </span>
                      )
                    })()}
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '55%' }}>
                      {c.sujet || (c.canal === 'email' ? '(sans sujet)' : `Message ${CANAL_META[c.canal]?.label || ''}`)}
                    </span>
                    {c.cv_personnalise && (
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 4, background: 'var(--info)', color: 'var(--destructive-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        CV personnalisé
                      </span>
                    )}
                    {/* v1.9.78 — Badges "1 certificat / 2 permis" quand des docs non-CV ont été joints.
                        Les entrées préfixées `doc:<type>:<url>` dans cv_urls_utilises les tracent. */}
                    {(() => {
                      const docEntries = (c.cv_urls_utilises || []).filter((u: string) => typeof u === 'string' && u.startsWith('doc:'))
                      if (docEntries.length === 0) return null
                      const counts: Record<string, number> = {}
                      for (const e of docEntries) {
                        const parts = (e as string).split(':')
                        const type = parts[1] || 'autre'
                        counts[type] = (counts[type] || 0) + 1
                      }
                      const typeLabel: Record<string, string> = {
                        certificat: 'certificat', diplome: 'diplôme', lettre_motivation: 'lettre',
                        formation: 'formation', permis: 'permis', reference: 'référence',
                        contrat: 'contrat', bulletin_salaire: 'bulletin', autre: 'document',
                      }
                      return Object.entries(counts).map(([type, count]) => {
                        const lbl = typeLabel[type] || 'document'
                        return (
                          <span key={type} style={{
                            fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
                            background: 'var(--info-soft)', color: 'var(--info)',
                            textTransform: 'uppercase', letterSpacing: '0.04em',
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                          }}>
                            <Paperclip size={9} /> {count} {lbl}{count > 1 ? 's' : ''}
                          </span>
                        )
                      })
                    })()}
                    {c.statut === 'tentative' && c.canal !== 'email' && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'var(--secondary)', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                        Tentative
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--muted-foreground)', flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Calendar size={11} /> {dateStr} · {timeStr}
                    </span>
                    {c.user_name && (
                      <span
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '1px 8px', borderRadius: 99,
                          background: c.is_own ? 'var(--primary-soft)' : 'var(--secondary)',
                          color: c.is_own ? 'var(--primary)' : 'var(--muted-foreground)',
                          fontWeight: 700, fontSize: 10, letterSpacing: '0.02em',
                        }}
                        title={c.is_own ? 'Envoyé par vous' : `Envoyé par ${c.user_name}`}
                      >
                        👤 {c.is_own ? 'Vous' : c.user_name}
                      </span>
                    )}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Users size={11} /> {c.nb_candidats} candidat{c.nb_candidats > 1 ? 's' : ''}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Mail size={11} /> {c.nb_destinataires} destinataire{c.nb_destinataires > 1 ? 's' : ''}
                    </span>
                    {c.client_nom && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Briefcase size={11} /> {c.client_nom}
                      </span>
                    )}
                  </div>
                </div>
              </button>

              {/* Détails expandus */}
              {isOpen && (
                <div style={{ padding: '12px 16px 16px 44px', borderTop: '1px solid var(--border)', background: 'var(--background)' }}>
                  {/* Candidats */}
                  {c.candidats.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                        Candidats ({c.candidats.length})
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {c.candidats.map((cand: HistoriqueCampagne['candidats'][number]) => (
                          <Link
                            key={cand.id}
                            href={`/candidats/${cand.id}?from=messages`}
                            style={{
                              fontSize: 12, padding: '3px 10px', borderRadius: 99,
                              background: 'var(--secondary)', color: 'var(--foreground)',
                              border: '1px solid var(--border)',
                              textDecoration: 'none', fontWeight: 600,
                            }}
                          >
                            {[cand.prenom, cand.nom].filter(Boolean).join(' ') || '(sans nom)'}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Destinataires */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                      Destinataires ({c.destinataires.length})
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {c.destinataires.map((d: string) => (
                        <span
                          key={d}
                          style={{
                            fontSize: 11, padding: '3px 8px', borderRadius: 6,
                            background: 'var(--secondary)', color: 'var(--foreground)',
                            border: '1px solid var(--border)',
                            fontFamily: 'monospace',
                          }}
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Extrait corps */}
                  {c.corps_extract && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                        Aperçu
                      </div>
                      <div style={{
                        fontSize: 12, color: 'var(--muted-foreground)', lineHeight: 1.5,
                        padding: '8px 10px', background: 'var(--card)', border: '1px solid var(--border)',
                        borderRadius: 6, whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto',
                      }}>
                        {c.corps_extract}
                        {c.corps_extract.length >= 220 && '…'}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────
   CandidateJoinRow — ligne compacte pour un candidat dans le mailing.
   Affiche nom + métier + 3 actions (Éditer / CV Original hover / Retirer).
   Hover preview du CV original via portal (iframe /api/cv/print).
   ──────────────────────────────────────────────────────────────────────── */
function CandidateJoinRow({
  candidat: c,
  isPerso, isOriginal, showBorderTop,
  onEdit, onToggleOriginal, onRemove,
  extraDocsSelected = [],
  candidatDocs,
  onLoadDocs,
  onToggleDoc,
}: {
  candidat: any
  isPerso: boolean
  isOriginal: boolean
  showBorderTop: boolean
  onEdit: () => void
  onToggleOriginal: () => void
  onRemove: () => void
  // v1.9.78 — docs non-CV joints
  extraDocsSelected?: string[]
  candidatDocs?: Array<{ url: string; name: string; type: string; uploaded_at?: string }>
  onLoadDocs?: () => Promise<Array<{ url: string; name: string; type: string; uploaded_at?: string }>>
  onToggleDoc?: (url: string) => void
}) {
  const [previewPos, setPreviewPos] = useState<{ x: number; y: number } | null>(null)
  const previewTimer = useRef<number | null>(null)
  const cvOriginalBtnRef = useRef<HTMLButtonElement | null>(null)
  // v1.9.78 — popover docs
  const [docsPopoverPos, setDocsPopoverPos] = useState<{ x: number; y: number } | null>(null)
  const [docsLoading, setDocsLoading] = useState(false)
  const docsBtnRef = useRef<HTMLButtonElement | null>(null)
  const docs = candidatDocs ?? []

  const openDocsPopover = async () => {
    if (docsPopoverPos) { setDocsPopoverPos(null); return }
    const btn = docsBtnRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    const W = 360, H = 320
    const x = Math.max(12, Math.min(window.innerWidth - W - 12, rect.right - W))
    const y = rect.bottom + 8 + H > window.innerHeight ? rect.top - H - 8 : rect.bottom + 8
    setDocsPopoverPos({ x, y })
    if (!candidatDocs && onLoadDocs) {
      setDocsLoading(true)
      try { await onLoadDocs() } finally { setDocsLoading(false) }
    }
  }

  useEffect(() => () => {
    if (previewTimer.current) window.clearTimeout(previewTimer.current)
  }, [])

  const PREVIEW_W = 640
  const PREVIEW_H = 820
  const handleEnter = () => {
    if (!c.cv_url) return
    if (previewTimer.current) window.clearTimeout(previewTimer.current)
    previewTimer.current = window.setTimeout(() => {
      const btn = cvOriginalBtnRef.current
      if (!btn) return
      const rect = btn.getBoundingClientRect()
      // Positionner à gauche du bouton, clamp vertical au viewport.
      const x = Math.max(12, rect.left - PREVIEW_W - 12)
      const y = Math.min(window.innerHeight - PREVIEW_H - 12, Math.max(12, rect.top - PREVIEW_H / 2 + rect.height / 2))
      setPreviewPos({ x, y })
    }, 200)
  }
  const handleLeave = () => {
    if (previewTimer.current) window.clearTimeout(previewTimer.current)
    // Délai 250ms pour permettre de déplacer la souris du bouton vers le popup
    previewTimer.current = window.setTimeout(() => setPreviewPos(null), 250)
  }
  const handlePreviewEnter = () => {
    if (previewTimer.current) window.clearTimeout(previewTimer.current)
  }
  const handlePreviewLeave = () => {
    if (previewTimer.current) window.clearTimeout(previewTimer.current)
    previewTimer.current = window.setTimeout(() => setPreviewPos(null), 150)
  }

  const badgeColor = isPerso ? 'var(--success)' : isOriginal ? 'var(--info)' : 'var(--muted-foreground)'
  const rowBg = isPerso ? 'var(--success-soft)' : isOriginal ? 'var(--info-soft)' : 'transparent'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 12px',
      borderTop: showBorderTop ? '1px solid var(--border)' : 'none',
      background: rowBg,
      transition: 'background 0.15s',
    }}>
      {/* Nom + métier */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%', background: badgeColor, flexShrink: 0,
        }} />
        <span style={{
          fontSize: 13, fontWeight: 700, color: 'var(--foreground)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {c.prenom} {c.nom}
        </span>
        {c.titre_poste && (
          <span style={{
            fontSize: 11, color: 'var(--muted-foreground)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            — {c.titre_poste}
          </span>
        )}
        {isPerso && (
          <span style={{
            fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 6,
            background: 'var(--success)', color: 'var(--destructive-foreground)',
            textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0,
          }}>
            CV perso
          </span>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <button
          type="button"
          onClick={onEdit}
          title={isPerso ? 'Modifier le CV personnalisé' : 'Personnaliser le CV'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 10px', borderRadius: 8,
            background: isPerso ? 'var(--success)' : 'var(--card)',
            color: isPerso ? 'var(--destructive-foreground)' : 'var(--foreground)',
            border: `1px solid ${isPerso ? 'var(--success)' : 'var(--border)'}`,
            fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {isPerso ? <Check size={12} /> : <FileText size={12} />}
          {isPerso ? 'Personnalisé' : 'Personnaliser'}
        </button>

        {c.cv_url && (
          <button
            ref={cvOriginalBtnRef}
            type="button"
            onClick={onToggleOriginal}
            onMouseEnter={handleEnter}
            onMouseLeave={handleLeave}
            title={isOriginal ? 'CV original joint — cliquer pour retirer' : 'Joindre le CV original (survol pour aperçu)'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', borderRadius: 8,
              background: isOriginal ? 'var(--info)' : 'var(--card)',
              color: isOriginal ? 'var(--destructive-foreground)' : 'var(--foreground)',
              border: `1px solid ${isOriginal ? 'var(--info)' : 'var(--border)'}`,
              fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <Paperclip size={12} />
            CV original
          </button>
        )}

        {/* v1.9.78 — bouton docs additionnels */}
        <button
          ref={docsBtnRef}
          type="button"
          onClick={openDocsPopover}
          title="Joindre des documents (certificats, permis, etc.)"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 10px', borderRadius: 8,
            background: extraDocsSelected.length > 0 ? 'var(--info)' : 'var(--card)',
            color: extraDocsSelected.length > 0 ? 'var(--destructive-foreground)' : 'var(--foreground)',
            border: `1px solid ${extraDocsSelected.length > 0 ? 'var(--info)' : 'var(--border)'}`,
            fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <Paperclip size={12} />
          Docs{extraDocsSelected.length > 0 ? ` (${extraDocsSelected.length})` : ''}
        </button>

        <button
          type="button"
          onClick={onRemove}
          title="Retirer ce candidat"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 8,
            background: 'transparent', color: 'var(--muted-foreground)',
            border: '1px solid var(--border)', cursor: 'pointer',
          }}
        >
          <X size={12} />
        </button>
      </div>

      {/* v1.9.78 — Popover docs additionnels (portal) */}
      {docsPopoverPos && typeof document !== 'undefined' && createPortal(
        <>
          {/* Backdrop pour fermer au clic extérieur */}
          <div
            onClick={() => setDocsPopoverPos(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'transparent' }}
          />
          <div
            style={{
              position: 'fixed', left: docsPopoverPos.x, top: docsPopoverPos.y,
              width: 360, maxHeight: 320, zIndex: 9999,
              background: 'var(--card)', border: '1.5px solid var(--border)',
              borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
          >
            <div style={{
              padding: '10px 14px', borderBottom: '1px solid var(--border)',
              background: 'var(--background)', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', gap: 6,
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>
                Documents de {c.prenom} {c.nom}
              </span>
              <button
                type="button"
                onClick={() => setDocsPopoverPos(null)}
                style={{
                  width: 22, height: 22, borderRadius: 6, border: 'none',
                  background: 'transparent', color: 'var(--muted-foreground)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={12} />
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 6 }}>
              {docsLoading && (
                <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--muted-foreground)' }}>
                  Chargement…
                </div>
              )}
              {!docsLoading && docs.length === 0 && (
                <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--muted-foreground)' }}>
                  Aucun document additionnel pour ce candidat.
                </div>
              )}
              {!docsLoading && docs.length > 0 && docs.map((d) => {
                const checked = extraDocsSelected.includes(d.url)
                const typeLabel: Record<string, string> = {
                  certificat: 'Certificat', diplome: 'Diplôme', lettre_motivation: 'Lettre',
                  formation: 'Formation', permis: 'Permis', reference: 'Référence',
                  contrat: 'Contrat', bulletin_salaire: 'Bulletin', autre: 'Autre',
                }
                return (
                  <label
                    key={d.url}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                      background: checked ? 'var(--info-soft)' : 'transparent',
                      border: `1px solid ${checked ? 'var(--info)' : 'transparent'}`,
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { if (!checked) e.currentTarget.style.background = 'var(--secondary)' }}
                    onMouseLeave={e => { if (!checked) e.currentTarget.style.background = 'transparent' }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleDoc?.(d.url)}
                      style={{ cursor: 'pointer', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12, fontWeight: 600, color: 'var(--foreground)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {d.name || 'Document'}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 1 }}>
                        {typeLabel[d.type] || d.type || 'Document'}
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>
        </>,
        document.body
      )}

      {/* Hover preview CV original (portal pour sortir du stacking) */}
      {previewPos && c.cv_url && typeof document !== 'undefined' && createPortal(
        <div
          onMouseEnter={handlePreviewEnter}
          onMouseLeave={handlePreviewLeave}
          style={{
            position: 'fixed', left: previewPos.x, top: previewPos.y,
            width: PREVIEW_W, height: PREVIEW_H, zIndex: 9999,
            background: 'var(--card)', border: '1.5px solid var(--border)',
            borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
            overflow: 'hidden',
          }}
        >
          <div style={{
            padding: '8px 12px', borderBottom: '1px solid var(--border)',
            background: 'var(--background)', fontSize: 12, fontWeight: 700,
            color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Paperclip size={12} />
            CV original — {c.prenom} {c.nom}
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted-foreground)', fontWeight: 500 }}>
              Cliquer pour ouvrir
            </span>
          </div>
          <iframe
            src={`/api/cv/print?url=${encodeURIComponent(c.cv_url)}#zoom=page-width`}
            style={{ width: '100%', height: 'calc(100% - 34px)', border: 'none' }}
          />
        </div>,
        document.body
      )}
    </div>
  )
}
