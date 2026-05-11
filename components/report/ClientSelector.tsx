// TalentFlow Rapports — Sélecteur d'entreprise (Phase 1 multi-entreprise)
// v2.4.0
//
// Cards verticales pleine largeur mobile, tap → onSelect(client).
// Affiche contact + téléphone cliquable si dispo.
'use client'

import { Building2, Phone, ChevronRight } from 'lucide-react'
import { telUrl } from '@/lib/lagence-contact'
import type { ReportLinkClient } from '@/lib/report/types'

interface Props {
  clients: ReportLinkClient[]
  onSelect: (client: ReportLinkClient) => void
}

export default function ClientSelector({ clients, onSelect }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 16px' }}>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: '#6B7280',
        marginBottom: 4,
      }}>
        Pour quelle entreprise ?
      </div>
      {clients.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '16px 14px',
            background: '#fff',
            border: '1px solid #E5E7EB',
            borderRadius: 14,
            cursor: 'pointer',
            textAlign: 'left',
            width: '100%',
            minHeight: 72,
            fontFamily: 'inherit',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#EAB308' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E5E7EB' }}
        >
          <div style={{
            flexShrink: 0,
            width: 40,
            height: 40,
            borderRadius: 10,
            background: '#FEF3C7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#92400E',
          }}>
            <Building2 size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1C1A14', lineHeight: 1.3 }}>
              {c.client_name}
            </div>
            {c.client_contact_name && (
              <div style={{ marginTop: 3, fontSize: 13, color: '#6B7280' }}>
                {c.client_contact_name}
              </div>
            )}
            {c.client_phone && (
              <div style={{ marginTop: 4, fontSize: 12, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Phone size={11} />
                <a
                  href={telUrl(c.client_phone)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ color: '#6B7280', textDecoration: 'none' }}
                >
                  {c.client_phone}
                </a>
              </div>
            )}
          </div>
          <ChevronRight size={20} color="#9CA3AF" style={{ flexShrink: 0 }} />
        </button>
      ))}
    </div>
  )
}
