'use client'

// /alertes — Page liste complète des alertes documents conformité
// v2.7.0

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { IdCard, AlertTriangle, Clock, XCircle, ChevronRight, Loader2 } from 'lucide-react'
import { formatExpiryDate } from '@/lib/compliance/document-status'

type Severity = 'expired' | 'urgent_14' | 'warning_30'

interface DocumentAlertFull {
  document: { id: string; label: string; expiry_date: string | null; document_number: string | null }
  document_type: { name: string; category: string } | null
  candidat: { id: string; prenom: string | null; nom: string | null; photo_url: string | null; pipeline_consultant: string | null }
  days_until_expiry: number
  severity: Severity
  has_active_mission: boolean
}

interface AlertsResponse {
  total: number
  expired: number
  urgent: number
  warning: number
  alerts: DocumentAlertFull[]
}

type FilterKey = 'all' | 'expired' | 'urgent' | 'warning'

export default function AlertesPage() {
  const [filter, setFilter] = useState<FilterKey>('all')
  const [mineOnly, setMineOnly] = useState(false)

  const { data, isLoading, isError, refetch } = useQuery<AlertsResponse>({
    queryKey: ['alertes', mineOnly ? 'mine' : 'all'],
    queryFn: async () => {
      const url = `/api/document-alerts?mode=full${mineOnly ? '&mine=1' : ''}`
      const r = await fetch(url)
      if (!r.ok) throw new Error('Erreur chargement')
      return r.json()
    },
    refetchInterval: 5 * 60_000,
  })

  // Bandeau erreur si l'API échoue (réseau, 500, 401)
  if (isError) {
    return (
      <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
        <p style={{ fontSize: 16, color: 'var(--foreground)', marginBottom: 12 }}>
          ⚠️ Impossible de charger les alertes.
        </p>
        <p style={{ fontSize: 14, color: 'var(--muted-foreground)', marginBottom: 20 }}>
          Vérifie ta connexion ou réessaye.
        </p>
        <button
          onClick={() => refetch()}
          style={{
            padding: '8px 16px',
            background: 'var(--primary)',
            color: 'var(--primary-foreground)',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Réessayer
        </button>
      </div>
    )
  }

  const filteredAlerts = useMemo(() => {
    if (!data) return []
    if (filter === 'all') return data.alerts
    if (filter === 'expired') return data.alerts.filter(a => a.severity === 'expired')
    if (filter === 'urgent') return data.alerts.filter(a => a.severity === 'urgent_14')
    if (filter === 'warning') return data.alerts.filter(a => a.severity === 'warning_30')
    return data.alerts
  }, [data, filter])

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{
          margin: 0,
          fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
          fontSize: 32, fontWeight: 400, color: 'var(--foreground)',
          letterSpacing: '-0.01em',
        }}>
          Alertes conformité
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--muted-foreground)', margin: '6px 0 0' }}>
          Documents (permis, CQC, identité, formations) expirés ou expirant dans les 30 prochains jours.
        </p>
      </div>

      {/* Stats KPI */}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
          <KpiCard label="Total" value={data.total} icon={IdCard} color="var(--muted-foreground)" />
          <KpiCard label="Expirés" value={data.expired} icon={XCircle} color="var(--destructive)" />
          <KpiCard label="< 14 jours" value={data.urgent} icon={AlertTriangle} color="#F97316" />
          <KpiCard label="15 - 30 jours" value={data.warning} icon={Clock} color="#A16207" />
        </div>
      )}

      {/* Filtres */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <FilterPill active={filter === 'all'} onClick={() => setFilter('all')}>Tous ({data?.total || 0})</FilterPill>
        <FilterPill active={filter === 'expired'} onClick={() => setFilter('expired')} color="var(--destructive)">Expirés ({data?.expired || 0})</FilterPill>
        <FilterPill active={filter === 'urgent'} onClick={() => setFilter('urgent')} color="#F97316">Urgents &lt; 14j ({data?.urgent || 0})</FilterPill>
        <FilterPill active={filter === 'warning'} onClick={() => setFilter('warning')} color="#A16207">Attention 15-30j ({data?.warning || 0})</FilterPill>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--muted-foreground)' }}>
            <input
              type="checkbox"
              checked={mineOnly}
              onChange={e => setMineOnly(e.target.checked)}
              style={{ width: 14, height: 14, accentColor: 'var(--primary)', cursor: 'pointer' }}
            />
            Mes candidats uniquement
          </label>
        </div>
      </div>

      {/* Liste */}
      {isLoading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted-foreground)' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : filteredAlerts.length === 0 ? (
        <div style={{
          padding: 60, textAlign: 'center', borderRadius: 12,
          background: 'var(--surface)', border: '1px dashed var(--border)',
          color: 'var(--muted-foreground)', fontSize: 13,
        }}>
          {filter === 'all' && !mineOnly ? '🎉 Aucune alerte — tous les documents sont à jour' : 'Aucune alerte pour ce filtre'}
        </div>
      ) : (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden',
        }}>
          {filteredAlerts.map(a => (
            <AlertRow key={a.document.id} alert={a} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  return (
    <div style={{
      padding: 16, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: color === 'var(--destructive)' ? 'rgba(239,68,68,0.12)' : color === '#F97316' ? 'rgba(249,115,22,0.12)' : color === '#A16207' ? 'rgba(234,179,8,0.14)' : 'var(--secondary)',
        color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={18} />
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          {value}
        </div>
      </div>
    </div>
  )
}

// ─── Filter Pill ───────────────────────────────────────────────────────────────

function FilterPill({ active, onClick, color, children }: { active: boolean; onClick: () => void; color?: string; children: React.ReactNode }) {
  const c = color || 'var(--foreground)'
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px', borderRadius: 99,
        background: active ? c : 'transparent',
        border: `1px solid ${active ? c : 'var(--border)'}`,
        color: active ? (color === '#F97316' || color === '#A16207' ? '#fff' : color === 'var(--destructive)' ? '#fff' : 'var(--primary-foreground, #1C1A14)') : 'var(--muted-foreground)',
        fontSize: 12, fontWeight: 700, cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  )
}

// ─── Alert Row ─────────────────────────────────────────────────────────────────

function AlertRow({ alert }: { alert: DocumentAlertFull }) {
  const candName = `${alert.candidat.prenom || ''} ${alert.candidat.nom || ''}`.trim() || 'Candidat'
  const docLabel = alert.document.label || alert.document_type?.name || 'Document'
  const days = alert.days_until_expiry

  let statusText = ''
  let statusColor = 'var(--muted-foreground)'
  let dotColor = '#A16207'
  if (alert.severity === 'expired') {
    statusText = days === 0 ? 'Expiré aujourd\'hui' : `Expiré depuis ${Math.abs(days)}j`
    statusColor = 'var(--destructive)'
    dotColor = '#EF4444'
  } else if (alert.severity === 'urgent_14') {
    statusText = days === 0 ? 'Expire aujourd\'hui' : days === 1 ? 'Expire demain' : `Expire dans ${days}j`
    statusColor = '#C2410C'
    dotColor = '#F97316'
  } else {
    statusText = `Expire dans ${days}j`
    statusColor = '#A16207'
    dotColor = '#EAB308'
  }

  return (
    <Link
      href={`/candidats/${alert.candidat.id}?from=alertes`}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 18px', borderBottom: '1px solid var(--border)',
        textDecoration: 'none', color: 'inherit',
        transition: 'background 0.15s',
      }}
    >
      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: dotColor, flexShrink: 0 }} />

      {/* Avatar */}
      <div style={{
        width: 42, height: 42, borderRadius: 10, overflow: 'hidden',
        background: 'var(--secondary)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {alert.candidat.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={alert.candidat.photo_url} alt={candName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted-foreground)' }}>
            {(alert.candidat.prenom?.[0] || '').toUpperCase()}{(alert.candidat.nom?.[0] || '').toUpperCase()}
          </span>
        )}
      </div>

      {/* Texte */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {candName}
          </div>
          {alert.has_active_mission && (
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
              background: 'rgba(34,197,94,0.15)', color: '#22C55E', flexShrink: 0,
            }}>
              EN MISSION
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 2 }}>
          {docLabel}
          {alert.document.document_number && (
            <span style={{ color: 'var(--muted)', marginLeft: 8 }}>· N° {alert.document.document_number}</span>
          )}
        </div>
      </div>

      {/* Statut */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: statusColor }}>
          {statusText}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
          {formatExpiryDate(alert.document.expiry_date)}
        </div>
      </div>

      <ChevronRight size={14} color="var(--muted-foreground)" style={{ flexShrink: 0 }} />
    </Link>
  )
}
