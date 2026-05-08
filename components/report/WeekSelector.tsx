// TalentFlow Rapports — Sélecteur de semaine (Phase 5)
// v2.2.6
//
// Dropdown listant les N dernières semaines + la semaine courante.
// Affiche un badge "Déjà envoyé ✓" / "Brouillon" / "Complété" selon le statut
// de la submission existante pour chaque semaine.
'use client'

import { useEffect, useRef, useState } from 'react'
import { Calendar, Check, ChevronDown, FileText } from 'lucide-react'
import { listRecentWeeks } from '@/lib/report/week-helpers'
import type { WeekDates, ReportSubmissionStatus } from '@/lib/report/types'

export interface WeekSubmissionInfo {
  weekStart: string
  status: ReportSubmissionStatus
}

interface Props {
  /** Semaine sélectionnée (week_start ISO) */
  value: string
  /** Callback quand l'utilisateur change de semaine */
  onChange: (weekStart: string) => void
  /** Statuts des submissions existantes pour afficher un badge par semaine */
  submissions?: WeekSubmissionInfo[]
  /** Nombre de semaines à afficher (défaut 8) */
  weekCount?: number
}

export default function WeekSelector({ value, onChange, submissions, weekCount = 8 }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const weeks = listRecentWeeks(weekCount)
  const submissionByWeek = new Map((submissions || []).map(s => [s.weekStart, s.status]))
  const selected = weeks.find(w => w.start === value) || weeks[0]
  const selectedStatus = submissionByWeek.get(selected?.start || '') || null

  // Ferme au click outside
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          width: '100%',
          padding: '14px 16px',
          background: '#fff',
          border: '1px solid #E5E7EB',
          borderRadius: 12,
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
          minHeight: 56,
          fontSize: 15,
        }}
      >
        <Calendar size={18} style={{ color: '#A16207', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Semaine {selected?.weekNumber}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1C1A14', marginTop: 2 }}>
            {selected?.label}
          </div>
        </div>
        {selectedStatus && <StatusBadge status={selectedStatus} />}
        <ChevronDown size={16} style={{ color: '#6B7280', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0, right: 0,
          background: '#fff',
          border: '1px solid #E5E7EB',
          borderRadius: 12,
          boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
          zIndex: 10,
          maxHeight: 360,
          overflowY: 'auto',
        }}>
          {weeks.map(w => (
            <WeekItem
              key={w.start}
              week={w}
              selected={w.start === value}
              status={submissionByWeek.get(w.start) || null}
              onClick={() => { onChange(w.start); setOpen(false) }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function WeekItem({
  week, selected, status, onClick,
}: {
  week: WeekDates
  selected: boolean
  status: ReportSubmissionStatus | null
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '12px 14px',
        background: selected ? '#FEF3C7' : 'transparent',
        border: 'none',
        borderBottom: '1px solid #F3F4F6',
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = '#FAFAF7' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{
        minWidth: 38, height: 38, borderRadius: 8,
        background: selected ? '#EAB308' : '#F3F4F6',
        color: selected ? '#1C1A14' : '#6B7280',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700,
        flexShrink: 0,
      }}>
        S{week.weekNumber}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13.5, fontWeight: selected ? 700 : 500,
          color: '#1C1A14',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {week.label}
        </div>
        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
          {week.start} → {week.end}
        </div>
      </div>
      {status && <StatusBadge status={status} />}
      {selected && !status && <Check size={14} style={{ color: '#A16207', flexShrink: 0 }} />}
    </button>
  )
}

function StatusBadge({ status }: { status: ReportSubmissionStatus }) {
  const cfg: Record<ReportSubmissionStatus, { bg: string; color: string; label: string; icon: React.ReactNode }> = {
    draft:            { bg: '#F3F4F6', color: '#6B7280', label: 'Brouillon',   icon: <FileText size={11} /> },
    candidate_signed: { bg: '#FEF3C7', color: '#A16207', label: 'En attente',  icon: <Check size={11} /> },
    client_signed:    { bg: '#DBEAFE', color: '#1E40AF', label: 'En cours',    icon: <Check size={11} /> },
    completed:        { bg: '#D1FAE5', color: '#059669', label: 'Complété',    icon: <Check size={11} /> },
    cancelled:        { bg: '#FEE2E2', color: '#DC2626', label: 'Annulé',      icon: null },
  }
  const c = cfg[status]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px',
      borderRadius: 999,
      background: c.bg,
      color: c.color,
      fontSize: 10.5,
      fontWeight: 700,
      letterSpacing: '0.02em',
      whiteSpace: 'nowrap',
      flexShrink: 0,
    }}>
      {c.icon}
      {c.label}
    </span>
  )
}
