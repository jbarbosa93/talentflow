'use client'
// Multi-select en bottom-sheet (conserve la liste déroulante, autorise plusieurs choix).
// Utilisé pour : métiers (candidats), secteurs d'activité (clients).
import { useState, useMemo } from 'react'
import { ChevronDown, Check, X, Search } from 'lucide-react'

export default function MMultiSelectSheet({
  options,
  selected,
  onChange,
  placeholder = 'Tous',
  title = 'Sélection',
  searchable = true,
}: {
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  title?: string
  searchable?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return options
    return options.filter((o) => o.toLowerCase().includes(t))
  }, [options, q])

  const toggle = (o: string) =>
    onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o])

  const triggerLabel = selected.length === 0
    ? placeholder
    : selected.length === 1
      ? selected[0]
      : `${selected.length} sélectionnés`

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 14px', borderRadius: 12, fontSize: 15,
          border: `1px solid ${selected.length ? 'var(--m-yellow, #F7C948)' : 'var(--m-border, #e7e5df)'}`,
          background: '#fff', color: selected.length ? '#1C1A14' : 'var(--m-text-soft, #6b6657)',
          fontWeight: selected.length ? 600 : 400,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{triggerLabel}</span>
        <ChevronDown size={18} style={{ flexShrink: 0 }} />
      </button>

      {open && (
        <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 96, background: 'rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1 }} onClick={() => setOpen(false)} />
          <div style={{
            background: 'var(--m-bg, #FAFAF7)', borderTopLeftRadius: 20, borderTopRightRadius: 20,
            maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - 20px)', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 8px' }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{title}</div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {selected.length > 0 && (
                  <button onClick={() => onChange([])} style={{ background: 'none', border: 'none', color: 'var(--m-text-soft, #6b6657)', fontSize: 13, fontWeight: 600 }}>Effacer</button>
                )}
                <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', padding: 4 }} aria-label="Fermer"><X size={22} /></button>
              </div>
            </div>

            {searchable && (
              <div style={{ padding: '0 16px 8px' }}>
                <div className="m-search" style={{ margin: 0 }}>
                  <Search size={18} />
                  <input type="search" placeholder="Rechercher..." value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
                </div>
              </div>
            )}

            <div style={{ overflowY: 'auto', padding: '0 8px calc(16px + env(safe-area-inset-bottom, 0px))' }}>
              {filtered.map((o) => {
                const on = selected.includes(o)
                return (
                  <button
                    key={o}
                    onClick={() => toggle(o)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '13px 12px', background: 'none', border: 'none', textAlign: 'left',
                      borderBottom: '1px solid var(--m-border, #efeee9)', fontSize: 15,
                      color: on ? '#1C1A14' : 'inherit', fontWeight: on ? 600 : 400,
                    }}
                  >
                    <span>{o}</span>
                    {on && <Check size={18} style={{ color: 'var(--m-yellow, #d4a017)' }} />}
                  </button>
                )
              })}
              {filtered.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--m-text-soft, #6b6657)' }}>Aucun résultat</div>
              )}
            </div>

            <div style={{ padding: '10px 16px calc(14px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid var(--m-border, #efeee9)' }}>
              <button onClick={() => setOpen(false)} className="m-btn primary full">Appliquer ({selected.length})</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
