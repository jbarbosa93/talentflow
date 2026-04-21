'use client'
// v1.9.73 — Extraction du MetierPicker historiquement privé dans pipeline/page.tsx.
// Utilisé désormais par : Pipeline (AddToPipelineModal) + CandidatsList (bulk pipeline modal).
// UX : barre de recherche + liste groupée par catégories (avec header coloré) + "— Aucun métier".

import { useMemo, useState } from 'react'
import { Search, Check } from 'lucide-react'

export default function MetierPicker({
  metiers,
  categories,
  value,
  onChange,
  showNoneOption = true,
}: {
  metiers: string[]
  categories: { name: string; color: string; metiers: string[] }[]
  value: string
  onChange: (m: string) => void
  showNoneOption?: boolean
}) {
  const [q, setQ] = useState('')
  const filtered = q.trim()
    ? metiers.filter(m => m.toLowerCase().includes(q.toLowerCase()))
    : metiers

  const grouped = useMemo(() => {
    if (q.trim()) return [{ name: '', color: '', metiers: filtered }]
    if (categories.length === 0) return [{ name: '', color: '', metiers: filtered }]
    const result: { name: string; color: string; metiers: string[] }[] = []
    const assigned = new Set<string>()
    for (const cat of categories) {
      const ms = cat.metiers.filter(m => filtered.includes(m))
      if (ms.length) { result.push({ ...cat, metiers: ms }); ms.forEach(m => assigned.add(m)) }
    }
    const others = filtered.filter(m => !assigned.has(m))
    if (others.length) result.push({ name: 'Autres', color: 'var(--muted-foreground)', metiers: others })
    return result
  }, [filtered, categories, q])

  return (
    <div>
      <div style={{ position: 'relative', marginBottom: 8 }}>
        <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Filtrer les métiers…"
          style={{
            width: '100%', border: '1.5px solid var(--border)', borderRadius: 7,
            padding: '6px 8px 6px 28px', fontSize: 13,
            background: 'var(--secondary)', color: 'var(--foreground)',
            boxSizing: 'border-box', outline: 'none',
          }}
        />
      </div>
      <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {showNoneOption && (
          <button
            type="button"
            onClick={() => onChange('')}
            style={{
              textAlign: 'left', padding: '5px 8px', borderRadius: 6, fontSize: 12,
              border: 'none', cursor: 'pointer',
              background: value === '' ? '#F5A62330' : 'transparent',
              color: value === '' ? '#c07a00' : 'var(--muted-foreground)',
              fontWeight: value === '' ? 700 : 400,
              fontFamily: 'inherit',
            }}
          >
            — Aucun métier
          </button>
        )}
        {grouped.map(group => (
          <div key={group.name || '__ungrouped__'}>
            {group.name && (
              <div style={{
                fontSize: 10, fontWeight: 700, color: group.color || 'var(--muted-foreground)',
                textTransform: 'uppercase', letterSpacing: '0.06em',
                padding: '6px 8px 2px',
              }}>
                {group.name}
              </div>
            )}
            {group.metiers.map(m => (
              <button
                key={m}
                type="button"
                onClick={() => onChange(m)}
                style={{
                  width: '100%', textAlign: 'left', padding: '5px 8px', borderRadius: 6,
                  fontSize: 13, border: 'none', cursor: 'pointer',
                  background: value === m ? '#F5A62330' : 'transparent',
                  color: value === m ? '#c07a00' : 'var(--foreground)',
                  fontWeight: value === m ? 700 : 400,
                  fontFamily: 'inherit',
                }}
              >
                {value === m && <Check size={11} style={{ display: 'inline', marginRight: 5 }} />}
                {m}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
