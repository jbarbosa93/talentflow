// TalentFlow Sign — Vue principale (refonte v2.2.1 inspirée DocuSign)
// Layout : mini-sidebar gauche (sections) + main (filtres + tableau)
'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, FileSignature, FolderCog } from 'lucide-react'
import SignSidebar, { type SignSection } from '@/components/sign/SignSidebar'
import EnvelopesFilters, { type DatePreset } from '@/components/sign/EnvelopesFilters'
import EnvelopesTable from '@/components/sign/EnvelopesTable'
import BulkActionsBar from '@/components/sign/BulkActionsBar'
import type { SignCategory, SignEnvelope, SignStatus } from '@/lib/sign/types'

const SECTION_TO_STATUSES: Record<SignSection, SignStatus[]> = {
  all:               [],   // [] = pas de filtre statut
  in_progress:       ['sent', 'in_progress'],
  completed:         ['completed'],
  draft:             ['draft'],
  expired_declined:  ['expired', 'declined', 'cancelled'],
}

interface Counts {
  all: number
  in_progress: number
  completed: number
  draft: number
  expired_declined: number
}

const EMPTY_COUNTS: Counts = { all: 0, in_progress: 0, completed: 0, draft: 0, expired_declined: 0 }

function isMobileWindow() {
  return typeof window !== 'undefined' && window.innerWidth < 900
}

export default function SignPage() {
  const router = useRouter()
  const [envelopes, setEnvelopes] = useState<SignEnvelope[]>([])
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS)
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState<SignSection>('all')
  const [search, setSearch] = useState('')
  const [datePreset, setDatePreset] = useState<DatePreset>('all')
  const [status, setStatus] = useState<SignStatus | 'all'>('all')
  const [category, setCategory] = useState<SignCategory | 'all'>('all')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(isMobileWindow())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      params.set('limit', '200')
      const r = await fetch(`/api/sign/envelopes?${params.toString()}`)
      const d = await r.json()
      setEnvelopes(d.envelopes || [])
    } catch {
      setEnvelopes([])
    } finally {
      setLoading(false)
    }
  }, [search])

  const fetchCounts = useCallback(async () => {
    try {
      const r = await fetch('/api/sign/envelopes/counts')
      const d = await r.json()
      if (d.counts) setCounts(d.counts)
    } catch { /* */ }
  }, [])

  useEffect(() => {
    fetchCounts()
  }, [fetchCounts, envelopes])

  // Debounce search 300ms
  useEffect(() => {
    const t = setTimeout(fetchData, 300)
    return () => clearTimeout(t)
  }, [fetchData])

  // Filtrage côté client : section + status + category + datePreset
  const filtered = useMemo(() => {
    const sectionStatuses = SECTION_TO_STATUSES[section]
    const now = Date.now()
    const dateThreshold: Record<DatePreset, number> = {
      all:    0,
      today:  now - 24 * 60 * 60 * 1000,
      '7d':   now - 7 * 24 * 60 * 60 * 1000,
      '30d':  now - 30 * 24 * 60 * 60 * 1000,
      '6m':   now - 180 * 24 * 60 * 60 * 1000,
    }
    return envelopes.filter(e => {
      if (sectionStatuses.length > 0 && !sectionStatuses.includes(e.status)) return false
      if (status !== 'all' && e.status !== status) return false
      if (category !== 'all' && e.document_category !== category) return false
      if (datePreset !== 'all') {
        const t = new Date(e.updated_at || e.created_at).getTime()
        if (t < dateThreshold[datePreset]) return false
      }
      return true
    })
  }, [envelopes, section, status, category, datePreset])

  // Selection
  const toggleSelect = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  const toggleAll = () => {
    if (selectedIds.length === filtered.length) setSelectedIds([])
    else setSelectedIds(filtered.map(e => e.id))
  }
  const clearSelection = () => setSelectedIds([])

  // Reset selection quand section change
  useEffect(() => { clearSelection() }, [section])

  return (
    <div className="d-page" style={{ fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>
      {/* Header */}
      <div className="d-page-header">
        <div>
          <h1 className="d-page-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <FileSignature size={22} color="var(--primary)" />
            <span>Signatures</span>
            {!loading && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--muted-foreground)',
                background: 'var(--secondary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '3px 10px',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {counts.all.toLocaleString('fr-CH')}
              </span>
            )}
          </h1>
          <p className="d-page-sub">
            Documents à signer — mappes, contrats de travail et autres
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* v2.9.67 — Bouton « Rapports » retiré : Rapports a désormais son propre onglet sidebar */}
          <Link href="/sign/templates" className="neo-btn-ghost">
            <FolderCog size={14} />
            Templates
          </Link>
          <button type="button" onClick={() => router.push('/sign/new')} className="neo-btn-yellow">
            <Plus size={15} />
            Nouvel envoi
          </button>
        </div>
      </div>

      {/* Layout 2 cols : sidebar + main */}
      <div style={{
        display: 'flex',
        gap: 24,
        alignItems: 'flex-start',
      }}>
        {!isMobile && (
          <SignSidebar active={section} onChange={setSection} counts={counts} />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Sur mobile : tabs horizontaux à la place de la sidebar */}
          {isMobile && (
            <MobileSectionTabs active={section} onChange={setSection} counts={counts} />
          )}

          <EnvelopesFilters
            search={search} setSearch={setSearch}
            datePreset={datePreset} setDatePreset={setDatePreset}
            status={status} setStatus={setStatus}
            category={category} setCategory={setCategory}
            resultCount={filtered.length}
          />

          <BulkActionsBar
            selectedIds={selectedIds}
            onClear={clearSelection}
            onChange={() => { fetchData(); fetchCounts() }}
          />

          {loading ? (
            <div className="neo-empty">
              <div className="neo-empty-icon">⏳</div>
              <div className="neo-empty-sub">Chargement...</div>
            </div>
          ) : (
            <EnvelopesTable
              envelopes={filtered}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleAll={toggleAll}
              onChange={() => { fetchData(); fetchCounts() }}
            />
          )}
        </div>
      </div>

    </div>
  )
}

// ─── Mobile section tabs (au lieu de la sidebar) ─────────────────────
function MobileSectionTabs({
  active, onChange, counts,
}: {
  active: SignSection; onChange: (s: SignSection) => void; counts: Counts
}) {
  const items: { key: SignSection; label: string }[] = [
    { key: 'all',              label: 'Tous' },
    { key: 'in_progress',      label: 'En cours' },
    { key: 'completed',        label: 'Complétés' },
    { key: 'draft',            label: 'Brouillons' },
    { key: 'expired_declined', label: 'Expirés' },
  ]
  return (
    <div style={{
      display: 'flex',
      gap: 4,
      marginBottom: 8,
      overflowX: 'auto',
      paddingBottom: 4,
      WebkitOverflowScrolling: 'touch',
    }}>
      {items.map(it => {
        const isActive = active === it.key
        const c = counts[it.key]
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            style={{
              flexShrink: 0,
              padding: '7px 12px',
              fontSize: 12.5,
              fontWeight: isActive ? 700 : 500,
              border: '1px solid',
              borderColor: isActive ? 'var(--primary)' : 'var(--border)',
              background: isActive ? 'var(--primary-soft)' : 'var(--card)',
              color: isActive ? 'var(--accent-foreground)' : 'var(--text-2, var(--foreground))',
              borderRadius: 999,
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {it.label}
            {c > 0 && <span style={{ opacity: 0.7 }}>({c})</span>}
          </button>
        )
      })}
    </div>
  )
}
