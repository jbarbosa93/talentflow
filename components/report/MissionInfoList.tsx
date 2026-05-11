// TalentFlow Rapports — Section "Mes missions" (page candidat)
// v2.6.1
//
// Affiche les entreprises autorisées AVEC leurs infos mission (responsable terrain,
// téléphone cliquable, dates de mission). Cards mobile-first.
// Tap sur une card → ouvre le flow form pour CETTE entreprise (auto-select).
'use client'

import { Building2, Phone, Calendar, ChevronRight } from 'lucide-react'
import type { ReportLinkClient } from '@/lib/report/types'
import { formatDateChDot } from '@/lib/report/text-format'

interface Props {
  clients: ReportLinkClient[]
  onSelect?: (client: ReportLinkClient) => void
}

function formatPeriod(start: string | null, end: string | null): string | null {
  if (!start && !end) return null
  const s = start ? formatDateChDot(start) : null
  const e = end ? formatDateChDot(end) : null
  if (s && e) return `Du ${s} au ${e}`
  if (s) return `Depuis le ${s}`
  if (e) return `Jusqu'au ${e}`
  return null
}

export default function MissionInfoList({ clients, onSelect }: Props) {
  // N'affiche que les entreprises qui ont AU MOINS un champ mission rempli
  // (sinon section vide / mêmes infos que le ClientSelector → inutile)
  const visible = clients.filter(c =>
    c.mission_contact_name || c.mission_phone || c.mission_start_date || c.mission_end_date,
  )
  if (!visible.length) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 16px' }}>
      {visible.map((c) => {
        const period = formatPeriod(c.mission_start_date, c.mission_end_date)
        const interactive = !!onSelect
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect?.(c)}
            disabled={!interactive}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 14px',
              background: '#fff',
              border: '1px solid #E5E7EB',
              borderRadius: 14,
              cursor: interactive ? 'pointer' : 'default',
              textAlign: 'left',
              width: '100%',
              fontFamily: 'inherit',
              boxShadow: '0 1px 2px rgba(28,26,20,0.04)',
            }}
          >
            <div style={{
              flexShrink: 0,
              width: 42, height: 42, borderRadius: 12,
              background: '#FEF3C7',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: '#92400E',
            }}>
              <Building2 size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: '#1C1A14', lineHeight: 1.3 }}>
                {c.client_name}
              </div>
              {c.mission_contact_name && (
                <div style={{ marginTop: 4, fontSize: 12.5, color: '#1C1A14', lineHeight: 1.4 }}>
                  {c.mission_contact_name}
                </div>
              )}
              {(c.mission_phone || period) && (
                <div style={{ marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12, color: '#6B7280', lineHeight: 1.4 }}>
                  {c.mission_phone && (
                    <a
                      href={`tel:${c.mission_phone.replace(/\s/g, '')}`}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        color: '#1C1A14', fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      <Phone size={12} /> {c.mission_phone}
                    </a>
                  )}
                  {period && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Calendar size={12} /> {period}
                    </span>
                  )}
                </div>
              )}
            </div>
            {interactive && <ChevronRight size={18} color="#9CA3AF" style={{ flexShrink: 0 }} />}
          </button>
        )
      })}
    </div>
  )
}
