'use client'
// TalentFlow Mobile /m/rapports — Liste rapports hebdomadaires (v2.9.72)
import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Search, FileText, ExternalLink, Pause, CheckCircle2 } from 'lucide-react'
import MHeader from '../_components/MHeader'

interface ReportLink {
  id: string
  slug: string
  title?: string | null
  candidat_id?: string | null
  candidat_name?: string | null
  client_name?: string | null
  status: 'active' | 'paused' | 'revoked' | string
  created_at?: string
  updated_at?: string
}

type TabKey = 'active' | 'paused' | 'revoked' | 'all'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'active',  label: 'Actifs' },
  { key: 'paused',  label: 'En pause' },
  { key: 'revoked', label: 'Révoqués' },
  { key: 'all',     label: 'Tous' },
]

function statusBadge(s: string): { cls: string; label: string } {
  switch (s) {
    case 'active':  return { cls: 'completed', label: 'Actif' }
    case 'paused':  return { cls: 'progress',  label: 'Pause' }
    case 'revoked': return { cls: 'expired',   label: 'Révoqué' }
    default:        return { cls: 'draft',     label: s }
  }
}

function fmtDate(s?: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function initials(name?: string | null): string {
  if (!name) return '?'
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?'
}

export default function MobileRapportsPage() {
  const [tab, setTab] = useState<TabKey>('active')
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery<{ links: ReportLink[]; count?: number }>({
    queryKey: ['m', 'reports', tab, search],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100' })
      if (tab !== 'all') params.set('status', tab)
      if (search.trim()) params.set('search', search.trim())
      const r = await fetch(`/api/admin/reports?${params}`, { credentials: 'include' })
      if (!r.ok) return { links: [] }
      return r.json()
    },
    staleTime: 30_000,
  })

  const links = data?.links || []

  return (
    <>
      <MHeader title="Rapports hebdo" back="/m" />
      <div className="m-content">
        <div className="m-tabs">
          {TABS.map(t => (
            <button
              key={t.key}
              type="button"
              className={`m-tab${tab === t.key ? ' is-active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="m-search">
          <Search size={18} />
          <input
            type="search"
            placeholder="Rechercher candidat / titre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
        </div>

        {isLoading && <div className="m-loading">Chargement...</div>}

        {!isLoading && links.length === 0 && (
          <div className="m-empty">
            <div className="m-empty-emoji">📊</div>
            <div>Aucun rapport</div>
          </div>
        )}

        {!isLoading && links.map((l) => {
          const badge = statusBadge(l.status)
          const fullName = l.candidat_name || l.title || 'Sans nom'
          return (
            <div key={l.id} className="m-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="m-avatar">{initials(fullName)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="m-card-title">{fullName}</div>
                  <div className="m-card-sub">
                    {l.client_name || l.title || '—'}
                    {l.updated_at && ` · MAJ ${fmtDate(l.updated_at)}`}
                  </div>
                </div>
                <span className={`m-badge ${badge.cls}`}>{badge.label}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <a
                  href={`/report/${l.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="m-btn secondary"
                  style={{ flex: 1, fontSize: 12 }}
                >
                  <ExternalLink size={14} /> Lien candidat
                </a>
                <Link
                  href={`/sign/rapports/${l.id}`}
                  className="m-btn secondary"
                  style={{ flex: 1, fontSize: 12 }}
                >
                  <FileText size={14} /> Soumissions
                </Link>
              </div>
            </div>
          )
        })}

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--m-text-soft)' }}>
          <Link href="/sign/rapports" style={{ color: 'inherit' }}>Gestion complète (desktop) →</Link>
        </div>
      </div>
    </>
  )
}
