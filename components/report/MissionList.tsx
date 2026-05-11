// TalentFlow Rapports — Liste compacte rapports candidat (Phase 1)
// v2.4.0
//
// Cards verticales mobile. Tap → lecture seule du rapport (TODO Phase 2).
// Affiche statut, semaine, entreprise.
'use client'

import { CheckCircle2, Clock, FileEdit, ChevronRight } from 'lucide-react'
import { formatDateChDot } from '@/lib/report/text-format'
import type { ReportSubmission } from '@/lib/report/types'

export interface MissionItem {
  id: string
  week_start: string
  week_end: string
  week_number?: number | null
  status: ReportSubmission['status']
  client_name?: string | null
  client_contact_name?: string | null
  /** v2.4.2 — Permet à la page candidat de retrouver l'entreprise destinataire
   *  lors de la reprise d'un brouillon. NULL = legacy ou pas d'entreprise. */
  report_link_client_id?: string | null
}

interface Props {
  items: MissionItem[]
  onSelect?: (m: MissionItem) => void
  emptyText?: string
}

function statusBadge(status: ReportSubmission['status']) {
  if (status === 'completed' || status === 'client_signed') {
    return { label: 'Validé', bg: '#D1FAE5', color: '#059669', icon: <CheckCircle2 size={14} /> }
  }
  if (status === 'candidate_signed') {
    return { label: 'En attente', bg: '#FEF3C7', color: '#92400E', icon: <Clock size={14} /> }
  }
  if (status === 'draft') {
    return { label: 'Brouillon', bg: '#F3F4F6', color: '#6B7280', icon: <FileEdit size={14} /> }
  }
  return { label: 'Annulé', bg: '#FEE2E2', color: '#B91C1C', icon: null }
}

export default function MissionList({ items, onSelect, emptyText = 'Aucun rapport pour le moment.' }: Props) {
  if (!items.length) {
    return (
      <div style={{
        padding: '24px 16px',
        textAlign: 'center',
        fontSize: 14,
        color: '#9CA3AF',
        fontStyle: 'italic',
      }}>
        {emptyText}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 16px' }}>
      {items.map((m) => {
        const b = statusBadge(m.status)
        const dateRange = `${formatDateChDot(m.week_start).slice(0, 5)} → ${formatDateChDot(m.week_end).slice(0, 5)}`
        const wkLabel = m.week_number ? `S${m.week_number}` : ''
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect?.(m)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '14px 14px',
              background: '#fff',
              border: '1px solid #E5E7EB',
              borderRadius: 12,
              cursor: onSelect ? 'pointer' : 'default',
              textAlign: 'left',
              width: '100%',
              fontFamily: 'inherit',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1C1A14' }}>
                {wkLabel ? `${wkLabel} · ${dateRange}` : dateRange}
              </div>
              {m.client_name && (
                <div style={{ marginTop: 3, fontSize: 12.5, color: '#6B7280', lineHeight: 1.4 }}>
                  {m.client_name}{m.client_contact_name ? ` · ${m.client_contact_name}` : ''}
                </div>
              )}
            </div>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 9px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              background: b.bg,
              color: b.color,
              flexShrink: 0,
            }}>
              {b.icon} {b.label}
            </span>
            {onSelect && <ChevronRight size={16} color="#9CA3AF" style={{ flexShrink: 0 }} />}
          </button>
        )
      })}
    </div>
  )
}
