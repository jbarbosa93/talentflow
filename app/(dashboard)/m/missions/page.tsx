'use client'
// TalentFlow Mobile /m/missions — Liste missions simplifiée (v2.9.72)
import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp, Calendar, ExternalLink, Pencil } from 'lucide-react'
import MHeader from '../_components/MHeader'
import MMissionEditModal, { EditableMission } from '../_components/MMissionEditModal'

interface Mission {
  id: string
  candidat_id?: string | null
  candidat_nom?: string | null
  client_nom?: string | null
  metier_display?: string | null
  metier?: string | null
  date_debut?: string | null
  date_fin?: string | null
  marge_brute?: number | null
  coefficient?: number | null
  statut: 'en_cours' | 'terminee' | 'annulee' | 'planifiee' | string
  photo_url?: string | null
  client_canton?: string | null
  report_link_slug?: string | null
}

type TabKey = 'en_cours' | 'all' | 'terminee'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'en_cours', label: 'En cours' },
  { key: 'terminee', label: 'Terminées' },
  { key: 'all',      label: 'Toutes' },
]

function fmtDate(s?: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function statusBadge(s: string): { cls: string; label: string } {
  switch (s) {
    case 'en_cours':  return { cls: 'progress', label: 'En cours' }
    case 'terminee':  return { cls: 'completed', label: 'Terminée' }
    case 'annulee':   return { cls: 'cancelled', label: 'Annulée' }
    case 'planifiee': return { cls: 'sent', label: 'Planifiée' }
    default:          return { cls: 'draft', label: s }
  }
}

function initials(name?: string | null): string {
  if (!name) return '?'
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?'
}

export default function MobileMissionsPage() {
  const [tab, setTab] = useState<TabKey>('en_cours')

  const [editMission, setEditMission] = useState<EditableMission | null>(null)

  const { data, isLoading } = useQuery<{ missions: Mission[]; etp: number }>({
    queryKey: ['m', 'missions', tab],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (tab !== 'all') params.set('statut', tab)
      const url = '/api/missions' + (params.toString() ? `?${params}` : '')
      const r = await fetch(url, { credentials: 'include' })
      if (!r.ok) return { missions: [], etp: 0 }
      const j = await r.json()
      return {
        missions: Array.isArray(j) ? j : (j.missions || []),
        etp: Number(j?.stats?.total_etp ?? 0),
      }
    },
    staleTime: 30_000,
  })

  const missions = data?.missions || []
  const etp = data?.etp ?? 0
  const etpLabel = Number.isInteger(etp) ? String(etp) : etp.toFixed(1)

  return (
    <>
      <MHeader title="Missions" back="/m" />
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

        {etp > 0 && (
          <div className="m-kpi-row" style={{ marginBottom: 14 }}>
            <div className="m-kpi">
              <div className="m-kpi-val">{etpLabel}</div>
              <div className="m-kpi-lbl">ETP en cours</div>
            </div>
            <div className="m-kpi">
              <div className="m-kpi-val">{missions.length}</div>
              <div className="m-kpi-lbl">Missions</div>
            </div>
          </div>
        )}

        {isLoading && <div className="m-loading">Chargement...</div>}

        {!isLoading && missions.length === 0 && (
          <div className="m-empty">
            <div className="m-empty-emoji">📋</div>
            <div>Aucune mission</div>
          </div>
        )}

        {!isLoading && missions.map((m) => {
          const badge = statusBadge(m.statut)
          return (
            <div key={m.id} className="m-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="m-avatar">
                  {m.photo_url
                    ? <img src={m.photo_url} alt={m.candidat_nom || ''} loading="lazy" />
                    : initials(m.candidat_nom)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="m-card-title">{m.candidat_nom || 'Sans candidat'}</div>
                  <div className="m-card-sub">{m.client_nom || '—'}{m.client_canton ? ` · ${m.client_canton}` : ''}</div>
                </div>
                <span className={`m-badge ${badge.cls}`}>{badge.label}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: 'var(--m-text-soft)' }}>
                {(m.metier_display || m.metier) && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <TrendingUp size={13} /> {m.metier_display || m.metier}
                  </span>
                )}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Calendar size={13} /> {fmtDate(m.date_debut)} → {fmtDate(m.date_fin)}
                </span>
                {m.marge_brute != null && (
                  <span>Marge: {Number(m.marge_brute).toFixed(2)}</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  onClick={() => setEditMission(m)}
                  className="m-btn primary"
                  style={{ flex: 1, fontSize: 12 }}
                >
                  <Pencil size={14} /> Modifier
                </button>
                {m.candidat_id && (
                  <Link href={`/m/candidats/${m.candidat_id}`} className="m-btn secondary" style={{ flex: 1, fontSize: 12 }}>
                    <ExternalLink size={14} /> Candidat
                  </Link>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {editMission && (
        <MMissionEditModal mission={editMission} onClose={() => setEditMission(null)} />
      )}
    </>
  )
}
