// TalentFlow Rapports — Autocomplete client + contact (v2.3.8 Bug 2)
//
// Hit GET /api/clients?search=X&per_page=15 puis liste 1 ligne par contact :
//   "Construction SA — Marie Dupont (marie@...)"
// Si client sans contacts : 1 ligne "Construction SA — pas de contact"
//
// onSelect callback : { clientName, clientId, contactName?, contactEmail? }
'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, Building2, X } from 'lucide-react'

interface ContactRow {
  prenom?: string | null
  nom?: string | null
  email?: string | null
  telephone?: string | null
  fonction?: string | null
}

interface ClientResult {
  id: string
  nom_entreprise: string
  ville?: string | null
  email?: string | null
  contacts?: ContactRow[] | null
}

export interface ClientContactPick {
  clientId: string | null
  clientName: string
  contactName: string | null
  contactEmail: string | null
}

interface Props {
  /** Valeur affichée dans l'input (clientName) */
  value: string
  /** True si un client/contact a déjà été sélectionné en DB */
  isLinked: boolean
  /** Callback : (clientName text, pick? si sélection dans dropdown) */
  onChange: (clientName: string, pick?: ClientContactPick) => void
  /** Callback : délier (icône X) */
  onUnlink: () => void
  placeholder?: string
}

export default function ClientContactAutocomplete({
  value, isLinked, onChange, onUnlink, placeholder,
}: Props) {
  const [results, setResults] = useState<ClientResult[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isLinked) return
    const q = value.trim()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.length < 2) { setResults([]); setOpen(false); return }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await fetch(`/api/clients?search=${encodeURIComponent(q)}&per_page=15&sort=az`)
        const d = await r.json()
        setResults((d.clients || []) as ClientResult[])
        setOpen(true)
      } catch {
        setResults([])
      } finally { setSearching(false) }
    }, 250)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [value, isLinked])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const pickContact = (client: ClientResult, contact: ContactRow | null) => {
    const contactName = contact
      ? [contact.prenom, contact.nom].filter(Boolean).join(' ').trim() || null
      : null
    const contactEmail = contact?.email?.trim() || null
    onChange(client.nom_entreprise, {
      clientId: client.id,
      clientName: client.nom_entreprise,
      contactName,
      contactEmail,
    })
    setOpen(false)
  }

  // Aplatit les clients en N lignes (1 par contact, ou 1 si pas de contact)
  type Row = { client: ClientResult; contact: ContactRow | null; key: string }
  const rows: Row[] = []
  for (const c of results) {
    const contacts = Array.isArray(c.contacts) ? c.contacts : []
    if (contacts.length === 0) {
      rows.push({ client: c, contact: null, key: `${c.id}-none` })
    } else {
      contacts.forEach((ct, idx) => rows.push({ client: c, contact: ct, key: `${c.id}-${idx}` }))
    }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        height: 42,
        background: isLinked ? 'rgba(34,197,94,0.06)' : 'var(--card)',
        border: '1px solid',
        borderColor: isLinked ? '#86EFAC' : 'var(--border)',
        borderRadius: 8,
        overflow: 'hidden',
        transition: 'border-color 0.15s, background 0.15s',
      }}>
        <span style={{
          padding: '0 6px 0 12px',
          color: isLinked ? '#15803D' : 'var(--muted)',
          display: 'inline-flex', alignItems: 'center', flexShrink: 0,
        }}>
          {isLinked ? <Building2 size={14} /> : <Search size={14} />}
        </span>
        <input
          type="text"
          value={value}
          placeholder={placeholder || 'Nom de l\'entreprise…'}
          onChange={e => onChange(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true) }}
          style={{
            flex: 1, minWidth: 0, height: '100%',
            padding: '0 8px 0 4px',
            border: 'none', outline: 'none', background: 'transparent',
            color: 'var(--foreground)', fontSize: 13, fontFamily: 'inherit',
          }}
        />
        {isLinked && (
          <button
            type="button"
            onClick={onUnlink}
            title="Délier le client"
            style={{
              padding: '0 10px', height: '100%', border: 'none',
              background: 'transparent', color: 'var(--muted)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', flexShrink: 0,
            }}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {open && !isLinked && (rows.length > 0 || searching) && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          zIndex: 100,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
          maxHeight: 320, overflowY: 'auto',
          fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
        }}>
          {searching && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>
              Recherche…
            </div>
          )}
          {!searching && rows.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
              Aucun client trouvé. Tape un nom complet pour créer un nouveau client.
            </div>
          )}
          {!searching && rows.map(({ client, contact, key }) => {
            const contactName = contact
              ? [contact.prenom, contact.nom].filter(Boolean).join(' ').trim()
              : ''
            const detail = contact
              ? [contactName, contact.email, contact.fonction].filter(Boolean).join(' · ')
              : (client.email || 'Pas de contact')
            return (
              <button
                key={key}
                type="button"
                onMouseDown={e => { e.preventDefault(); pickContact(client, contact) }}
                style={{
                  width: '100%', textAlign: 'left',
                  padding: '8px 12px',
                  background: 'transparent',
                  border: 'none', borderBottom: '1px solid var(--border)',
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 7,
                  background: 'var(--primary-soft)', color: 'var(--primary, #A16207)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Building2 size={13} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: 'var(--foreground)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {client.nom_entreprise}
                    {client.ville && (
                      <span style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: 6 }}>
                        — {client.ville}
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 11, color: 'var(--muted)', marginTop: 2,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {detail}
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
