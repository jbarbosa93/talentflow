'use client'
import { useState, useRef, useEffect } from 'react'
import { Search, X, Check, Building2 } from 'lucide-react'

interface ClientItem {
  id: string
  nom_entreprise: string
  ville?: string | null
  email?: string | null
  canton?: string | null
}

interface ClientSearchProps {
  clients: ClientItem[] | undefined
  selectedIds: string[]
  onChange: (ids: string[]) => void
  placeholder?: string
}

const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export default function ClientSearch({
  clients,
  selectedIds,
  onChange,
  placeholder = 'Rechercher des clients...',
}: ClientSearchProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const selected = (clients || []).filter(c => selectedIds.includes(c.id))

  const filtered = (clients || []).filter(c => {
    if (!query.trim()) return true
    const q = normalize(query)
    return (
      normalize(c.nom_entreprise || '').includes(q) ||
      normalize(c.ville || '').includes(q) ||
      normalize(c.email || '').includes(q) ||
      normalize(c.canton || '').includes(q)
    )
  }).slice(0, query.trim() ? 50 : 20)

  function toggle(id: string) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter(i => i !== id)
        : [...selectedIds, id]
    )
  }

  function remove(id: string) {
    onChange(selectedIds.filter(i => i !== id))
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Selected chips */}
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
          {selected.map(c => (
            <span key={c.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: 'var(--primary-soft)', border: '1px solid var(--primary)',
              borderRadius: 100, padding: '3px 6px 3px 10px',
              fontSize: 12, fontWeight: 600, color: 'var(--foreground)',
              whiteSpace: 'nowrap',
            }}>
              {c.nom_entreprise}
              {c.ville ? <span style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: 4 }}>— {c.ville}</span> : null}
              <button
                onClick={() => remove(c.id)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--muted)', padding: 2, display: 'flex',
                  borderRadius: '50%',
                }}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div style={{ position: 'relative' }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
        <input
          ref={inputRef}
          value={query}
          placeholder={placeholder}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          style={{
            width: '100%', height: 38, paddingLeft: 32, paddingRight: 10,
            border: '1.5px solid var(--border)', borderRadius: 8,
            background: 'var(--secondary)', color: 'var(--foreground)',
            fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
          background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.1)', maxHeight: 260, overflowY: 'auto',
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
              Aucun client trouve
            </div>
          ) : filtered.map(c => {
            const isSelected = selectedIds.includes(c.id)
            return (
              <button
                key={c.id}
                onMouseDown={e => { e.preventDefault(); toggle(c.id) }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', background: isSelected ? 'var(--primary-soft)' : 'none',
                  border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                  fontSize: 13, fontFamily: 'var(--font-body)', textAlign: 'left',
                }}
                onMouseOver={e => { if (!isSelected) e.currentTarget.style.background = 'var(--secondary)' }}
                onMouseOut={e => { if (!isSelected) e.currentTarget.style.background = 'none' }}
              >
                {/* Checkbox */}
                <div style={{
                  width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                  border: isSelected ? '2px solid var(--primary)' : '2px solid var(--border)',
                  background: isSelected ? 'var(--primary)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {isSelected && <Check size={12} color="var(--ink)" strokeWidth={3} />}
                </div>
                {/* Avatar */}
                <div style={{
                  width: 30, height: 30, borderRadius: 6, background: 'var(--primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800, color: 'var(--ink, #1C1A14)', flexShrink: 0,
                }}>
                  {(c.nom_entreprise?.[0] || '?').toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.nom_entreprise}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {c.ville || 'Sans ville'}
                    {c.canton ? ` (${c.canton})` : ''}
                    {c.email ? ` · ${c.email}` : ''}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
