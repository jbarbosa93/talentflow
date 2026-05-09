// TalentFlow Rapports — Mini-sidebar secondaire pour /sign/rapports
// v2.3.8 — clone de SignSidebar adapté aux 3 statuts de liens rapport.
'use client'

import { Inbox, CheckCircle2, Pause, AlertTriangle, FolderClosed } from 'lucide-react'

export type ReportSection = 'all' | 'active' | 'paused' | 'revoked'

interface Counts {
  all: number
  active: number
  paused: number
  revoked: number
}

interface Props {
  active: ReportSection
  onChange: (s: ReportSection) => void
  counts: Counts
}

const ITEMS: { key: ReportSection; label: string; icon: typeof Inbox }[] = [
  { key: 'all',     label: 'Tous les liens', icon: Inbox },
  { key: 'active',  label: 'Actifs',         icon: CheckCircle2 },
  { key: 'paused',  label: 'En pause',       icon: Pause },
  { key: 'revoked', label: 'Révoqués',       icon: AlertTriangle },
]

export default function ReportsSidebar({ active, onChange, counts }: Props) {
  return (
    <aside style={{
      width: 220,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      paddingTop: 4,
    }}>
      <SectionLabel>Liens rapports</SectionLabel>
      {ITEMS.map(it => {
        const isActive = active === it.key
        const Icon = it.icon
        const count = counts[it.key] || 0
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
              border: 'none',
              borderRadius: 10,
              background: isActive ? 'var(--primary-soft)' : 'transparent',
              color: isActive ? 'var(--accent-foreground)' : 'var(--text-2, var(--foreground))',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 13,
              fontWeight: isActive ? 700 : 500,
              textAlign: 'left',
              transition: 'background 0.15s',
              position: 'relative',
            }}
            onMouseEnter={e => {
              if (!isActive) e.currentTarget.style.background = 'var(--surface-2)'
            }}
            onMouseLeave={e => {
              if (!isActive) e.currentTarget.style.background = 'transparent'
            }}
          >
            <Icon size={15} style={{ color: isActive ? 'var(--primary)' : 'var(--muted)', flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>{it.label}</span>
            {count > 0 && (
              <span style={{
                minWidth: 22,
                height: 18,
                padding: '0 6px',
                borderRadius: 999,
                background: isActive ? 'var(--primary)' : 'var(--surface-2)',
                color: isActive ? 'var(--primary-foreground)' : 'var(--muted)',
                fontSize: 10.5,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {count > 999 ? '999+' : count}
              </span>
            )}
          </button>
        )
      })}

      <div style={{ height: 16 }} />
      <SectionLabel>Dossiers</SectionLabel>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        fontSize: 12,
        color: 'var(--muted)',
        fontStyle: 'italic',
      }}>
        <FolderClosed size={14} />
        Bientôt disponible
      </div>
    </aside>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10.5,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: 'var(--muted)',
      padding: '0 12px 6px',
    }}>
      {children}
    </div>
  )
}
