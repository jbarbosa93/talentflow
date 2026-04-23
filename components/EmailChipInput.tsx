'use client'
import { useState, useRef, KeyboardEvent, useEffect, useMemo } from 'react'
import { X } from 'lucide-react'

// Regex basique pour valider un email
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// v1.9.70 — Autocomplete style Outlook
type Suggestion = { email: string; label: string; type: 'client' | 'team' | 'recent' }

let CACHED_SUGGESTIONS: Suggestion[] | null = null
let CACHE_PROMISE: Promise<Suggestion[]> | null = null

async function fetchSuggestions(): Promise<Suggestion[]> {
  if (CACHED_SUGGESTIONS) return CACHED_SUGGESTIONS
  if (CACHE_PROMISE) return CACHE_PROMISE
  CACHE_PROMISE = (async () => {
    try {
      const res = await fetch('/api/emails/suggest', { credentials: 'include' })
      if (!res.ok) return []
      const data = await res.json()
      CACHED_SUGGESTIONS = Array.isArray(data.suggestions) ? data.suggestions : []
      return CACHED_SUGGESTIONS ?? []
    } catch { return [] }
    finally { CACHE_PROMISE = null }
  })()
  return CACHE_PROMISE
}

const normalize = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

interface EmailChipInputProps {
  value: string[]
  onChange: (emails: string[]) => void
  placeholder?: string
  /** Désactive l'autocomplete si besoin (par défaut : activé) */
  disableAutocomplete?: boolean
  /** v1.9.88 — filtre visuel (n'affiche que les chips matchant la query). Casse-insensible + unaccent. */
  filterQuery?: string
}

export default function EmailChipInput({ value, onChange, placeholder = 'Ajouter un email...', disableAutocomplete = false, filterQuery = '' }: EmailChipInputProps) {
  const [input, setInput] = useState('')
  const [focused, setFocused] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [allSuggestions, setAllSuggestions] = useState<Suggestion[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Charger les suggestions 1x au mount (cache module-level)
  useEffect(() => {
    if (disableAutocomplete) return
    let cancelled = false
    fetchSuggestions().then(s => { if (!cancelled) setAllSuggestions(s) })
    return () => { cancelled = true }
  }, [disableAutocomplete])

  // Filtrer selon input
  const filteredSuggestions = useMemo(() => {
    if (disableAutocomplete) return []
    const q = normalize(input.trim())
    if (q.length < 2) return []
    const alreadyIn = new Set(value.map(v => v.toLowerCase()))
    const out: Suggestion[] = []
    for (const s of allSuggestions) {
      if (alreadyIn.has(s.email)) continue
      const hay = normalize(`${s.email} ${s.label}`)
      if (hay.includes(q)) {
        out.push(s)
        if (out.length >= 8) break
      }
    }
    return out
  }, [input, value, allSuggestions, disableAutocomplete])

  useEffect(() => { setActiveIdx(0) }, [filteredSuggestions.length])

  // Fermer les suggestions au click extérieur
  useEffect(() => {
    if (!focused) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [focused])

  function addEmail(raw: string) {
    const email = raw.trim().toLowerCase()
    if (!email) return
    if (!EMAIL_RE.test(email)) return
    if (value.includes(email)) return
    onChange([...value, email])
  }

  function addFromInput() {
    const parts = input.split(/[,;\s]+/).filter(Boolean)
    const newEmails = [...value]
    for (const p of parts) {
      const e = p.trim().toLowerCase()
      if (EMAIL_RE.test(e) && !newEmails.includes(e)) newEmails.push(e)
    }
    onChange(newEmails)
    setInput('')
  }

  function selectSuggestion(s: Suggestion) {
    if (!value.includes(s.email)) onChange([...value, s.email])
    setInput('')
    inputRef.current?.focus()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const showSuggestions = focused && filteredSuggestions.length > 0
    if (showSuggestions && e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => (i + 1) % filteredSuggestions.length)
      return
    }
    if (showSuggestions && e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => (i - 1 + filteredSuggestions.length) % filteredSuggestions.length)
      return
    }
    if (showSuggestions && e.key === 'Enter') {
      e.preventDefault()
      selectSuggestion(filteredSuggestions[activeIdx])
      return
    }
    if (showSuggestions && e.key === 'Escape') {
      setFocused(false)
      return
    }
    if (['Enter', 'Tab', ',', ';'].includes(e.key)) {
      e.preventDefault()
      addFromInput()
    }
    if (e.key === 'Backspace' && !input && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const text = e.clipboardData.getData('text')
    const parts = text.split(/[,;\s\n]+/).filter(Boolean)
    const newEmails = [...value]
    for (const p of parts) {
      const em = p.trim().toLowerCase()
      if (EMAIL_RE.test(em) && !newEmails.includes(em)) newEmails.push(em)
    }
    onChange(newEmails)
  }

  function remove(email: string) {
    onChange(value.filter(e => e !== email))
  }

  const showSuggestions = focused && filteredSuggestions.length > 0

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div
        onClick={() => inputRef.current?.focus()}
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
          padding: '6px 10px', minHeight: 42,
          border: '1.5px solid var(--border)', borderRadius: 8,
          background: 'var(--secondary)', cursor: 'text',
        }}
      >
        {value
          .filter(email => {
            const q = (filterQuery || '').trim()
            if (!q) return true
            return normalize(email).includes(normalize(q))
          })
          .map(email => (
          <span key={email} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'var(--primary-soft)', border: '1px solid var(--primary)',
            borderRadius: 100, padding: '2px 6px 2px 10px',
            fontSize: 12, fontWeight: 600, color: 'var(--foreground)',
            whiteSpace: 'nowrap',
          }}>
            {email}
            <button
              onClick={(e) => { e.stopPropagation(); remove(email) }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--muted)', padding: 2, display: 'flex',
                borderRadius: '50%', transition: 'color 0.1s',
              }}
              onMouseOver={e => (e.currentTarget.style.color = 'var(--foreground)')}
              onMouseOut={e => (e.currentTarget.style.color = 'var(--muted)')}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            // Délai pour permettre le click sur une suggestion avant de fermer
            setTimeout(() => {
              addFromInput()
              // Ne fermer que si le click n'a pas été capturé
            }, 120)
          }}
          placeholder={value.length === 0 ? placeholder : ''}
          style={{
            flex: 1, minWidth: 120, border: 'none', outline: 'none',
            background: 'transparent', fontSize: 13, fontFamily: 'var(--font-body)',
            color: 'var(--foreground)', padding: '4px 0',
          }}
        />
      </div>

      {/* Dropdown suggestions */}
      {showSuggestions && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
            background: 'var(--card)', border: '1.5px solid var(--border)',
            borderRadius: 10, boxShadow: '0 8px 28px rgba(0,0,0,0.15)',
            zIndex: 100, maxHeight: 280, overflowY: 'auto', padding: 4,
          }}
        >
          {filteredSuggestions.map((s, idx) => {
            const active = idx === activeIdx
            const typeMeta = {
              client: { label: 'Client',  bg: 'var(--info-soft)',     color: 'var(--info)' },
              team:   { label: 'Team',    bg: 'var(--primary-soft)',  color: 'var(--primary)' },
              recent: { label: 'Récent',  bg: 'var(--warning-soft)',  color: 'var(--warning)' },
            }[s.type]
            return (
              <button
                key={s.email}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s) }}
                onMouseEnter={() => setActiveIdx(idx)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '8px 10px', borderRadius: 7, border: 'none',
                  background: active ? 'var(--primary-soft)' : 'transparent',
                  color: 'var(--foreground)', cursor: 'pointer',
                  fontFamily: 'inherit', textAlign: 'left',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.email}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted-foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.label}
                  </div>
                </div>
                <span style={{
                  flexShrink: 0, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                  background: typeMeta.bg, color: typeMeta.color,
                }}>
                  {typeMeta.label}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
