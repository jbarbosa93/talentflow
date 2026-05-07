// TalentFlow Sign — Barre de filtres au-dessus du tableau
// v2.2.1
'use client'

import { Search, X, Calendar, Tag, FileText } from 'lucide-react'
import type { SignCategory, SignStatus } from '@/lib/sign/types'
import { CATEGORY_LABELS, STATUS_LABELS } from '@/lib/sign/types'

export type DatePreset = 'all' | 'today' | '7d' | '30d' | '6m'

const DATE_LABELS: Record<DatePreset, string> = {
  all:    'Toutes dates',
  today:  'Aujourd\'hui',
  '7d':   '7 derniers jours',
  '30d':  '30 derniers jours',
  '6m':   '6 derniers mois',
}

const STATUS_OPTIONS: { value: SignStatus | 'all'; label: string }[] = [
  { value: 'all',         label: 'Tous statuts' },
  { value: 'draft',       label: STATUS_LABELS.draft },
  { value: 'sent',        label: STATUS_LABELS.sent },
  { value: 'in_progress', label: STATUS_LABELS.in_progress },
  { value: 'completed',   label: STATUS_LABELS.completed },
  { value: 'expired',     label: STATUS_LABELS.expired },
  { value: 'declined',    label: STATUS_LABELS.declined },
  { value: 'cancelled',   label: STATUS_LABELS.cancelled },
]

interface Props {
  search: string
  setSearch: (s: string) => void
  datePreset: DatePreset
  setDatePreset: (d: DatePreset) => void
  status: SignStatus | 'all'
  setStatus: (s: SignStatus | 'all') => void
  category: SignCategory | 'all'
  setCategory: (c: SignCategory | 'all') => void
  resultCount: number
}

export default function EnvelopesFilters({
  search, setSearch, datePreset, setDatePreset,
  status, setStatus, category, setCategory, resultCount,
}: Props) {
  const hasFilter = !!search.trim() || datePreset !== 'all' || status !== 'all' || category !== 'all'
  const clearAll = () => {
    setSearch('')
    setDatePreset('all')
    setStatus('all')
    setCategory('all')
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flexWrap: 'wrap',
      padding: '14px 0',
    }}>
      {/* Search avec loupe en wrapper flex propre (plus de positionnement absolu douteux) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        flex: '1 1 280px',
        minWidth: 200,
        maxWidth: 380,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        height: 38,
        overflow: 'hidden',
      }}>
        <span style={{
          padding: '0 8px 0 14px',
          color: 'var(--muted)',
          display: 'inline-flex',
          alignItems: 'center',
          flexShrink: 0,
        }}>
          <Search size={15} />
        </span>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un titre…"
          style={{
            flex: 1,
            minWidth: 0,
            padding: '0 12px 0 4px',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'var(--foreground)',
            fontSize: 13,
            fontFamily: 'inherit',
            height: '100%',
          }}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            style={{
              padding: '0 10px', height: '100%',
              background: 'transparent', border: 'none',
              color: 'var(--muted)', cursor: 'pointer',
            }}
            title="Effacer"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Date preset */}
      <FilterSelect icon={Calendar} value={datePreset} onChange={v => setDatePreset(v as DatePreset)} label="Date">
        {(Object.keys(DATE_LABELS) as DatePreset[]).map(k => (
          <option key={k} value={k}>{DATE_LABELS[k]}</option>
        ))}
      </FilterSelect>

      {/* Status */}
      <FilterSelect icon={Tag} value={status} onChange={v => setStatus(v as SignStatus | 'all')} label="État">
        {STATUS_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </FilterSelect>

      {/* Catégorie */}
      <FilterSelect icon={FileText} value={category} onChange={v => setCategory(v as SignCategory | 'all')} label="Catégorie">
        <option value="all">Toutes catégories</option>
        {(Object.keys(CATEGORY_LABELS) as SignCategory[]).map(k => (
          <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>
        ))}
      </FilterSelect>

      {hasFilter && (
        <button
          type="button"
          onClick={clearAll}
          style={{
            padding: '8px 12px',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--muted)',
            fontSize: 12.5,
            cursor: 'pointer',
            fontFamily: 'inherit',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <X size={12} />
          Tout effacer
        </button>
      )}

      <span style={{ flex: 1 }} />

      <span style={{
        fontSize: 12,
        color: 'var(--muted)',
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}>
        {resultCount} envoi{resultCount > 1 ? 's' : ''}
      </span>
    </div>
  )
}

function FilterSelect({
  icon: Icon, value, onChange, label, children,
}: {
  icon: typeof Search
  value: string
  onChange: (v: string) => void
  label: string
  children: React.ReactNode
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      height: 38,
      overflow: 'hidden',
    }}>
      <span style={{
        padding: '0 4px 0 12px',
        color: 'var(--muted)',
        display: 'inline-flex',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <Icon size={13} />
      </span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label={label}
        style={{
          height: '100%',
          padding: '0 28px 0 6px',
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: 'var(--foreground)',
          fontSize: 12.5,
          fontFamily: 'inherit',
          cursor: 'pointer',
          appearance: 'none',
          backgroundImage: 'linear-gradient(45deg, transparent 50%, var(--muted) 50%), linear-gradient(135deg, var(--muted) 50%, transparent 50%)',
          backgroundPosition: 'calc(100% - 16px) 16px, calc(100% - 11px) 16px',
          backgroundSize: '5px 5px, 5px 5px',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {children}
      </select>
    </div>
  )
}
