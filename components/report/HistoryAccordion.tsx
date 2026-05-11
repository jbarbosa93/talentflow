// TalentFlow Rapports — Accordion historique complet (groupé par mois)
// v2.4.1 — Phase 2
//
// Affiche tous les rapports candidat groupés par mois avec totaux mensuels.
// Réutilise MissionList cards pour chaque rapport. Mobile-first.
'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import MissionList, { type MissionItem } from './MissionList'
import { groupByMonth } from '@/lib/report/recap'

interface Props {
  items: MissionItem[]
  /** Index de groupe(s) ouvert(s) par défaut. -1 = aucun. Mettre 0 pour ouvrir le 1ᵉʳ. */
  defaultOpenIndex?: number
  /** Optionnel : affiche un total compact par mois si la prop est fournie. */
  monthSubtitleFn?: (items: MissionItem[]) => string | null
  /** v2.4.2 — Callback de tap sur une mission (propagé à MissionList). */
  onSelect?: (m: MissionItem) => void
}

export default function HistoryAccordion({ items, defaultOpenIndex = 0, monthSubtitleFn, onSelect }: Props) {
  const groups = useMemo(() => groupByMonth(items), [items])
  const [openSet, setOpenSet] = useState<Set<string>>(() => {
    if (defaultOpenIndex < 0 || !groups[defaultOpenIndex]) return new Set()
    return new Set([groups[defaultOpenIndex].key])
  })

  const toggle = (key: string) => {
    setOpenSet(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (!items.length) {
    return (
      <div style={{
        padding: '20px 16px',
        textAlign: 'center', fontSize: 13, color: '#9CA3AF', fontStyle: 'italic',
      }}>
        Aucun rapport pour le moment.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {groups.map(g => {
        const isOpen = openSet.has(g.key)
        const subtitle = monthSubtitleFn?.(g.items) || null
        return (
          <div key={g.key} style={{ borderBottom: '1px solid #E5E7EB' }}>
            <button
              type="button"
              onClick={() => toggle(g.key)}
              aria-expanded={isOpen}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 16px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
                minHeight: 48,
              }}
            >
              {isOpen ? <ChevronDown size={16} color="#6B7280" /> : <ChevronRight size={16} color="#6B7280" />}
              <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: '#1C1A14' }}>
                {g.label}
              </span>
              <span style={{ fontSize: 11.5, color: '#6B7280', fontWeight: 500 }}>
                {g.items.length} rapport{g.items.length > 1 ? 's' : ''}
              </span>
            </button>
            {isOpen && (
              <>
                {subtitle && (
                  <div style={{
                    padding: '0 16px 8px 36px',
                    fontSize: 12, color: '#6B7280', fontStyle: 'italic',
                  }}>
                    {subtitle}
                  </div>
                )}
                <div style={{ paddingBottom: 10 }}>
                  <MissionList items={g.items} onSelect={onSelect} />
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
