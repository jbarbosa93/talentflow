// TalentFlow Sign — Éditeur tableau destinataires (style v2 : neo-input)
// v2.2.0 — Phase 1 + Phase 4a-bis-5 (recherche candidats DB + auto-fill)
//
// L'ordre des destinataires détermine l'ordre de signature séquentiel.
// Rôle = 'signer' (doit signer) ou 'cc' (reçoit juste la copie finale).
// Le 1er signer peut être lié à un candidat de la DB → ses infos pré-remplissent
// les fields wizard côté signature.
'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Search, User, X } from 'lucide-react'
import type { SignRecipient } from '@/lib/sign/types'

// Étendu localement : peut transporter un candidat lié pour pré-fill
export type SignRecipientExt = SignRecipient & { candidat_id?: string | null }

interface Props {
  recipients: SignRecipientExt[]
  onChange: (recipients: SignRecipientExt[]) => void
  disabled?: boolean
}

const ROLE_OPTIONS: { value: 'signer' | 'cc'; label: string }[] = [
  { value: 'signer', label: 'Signataire' },
  { value: 'cc',     label: 'Copie' },
]

interface CandidateSearchResult {
  id: string
  prenom: string | null
  nom: string | null
  email: string | null
  telephone: string | null
}

export default function RecipientsEditor({ recipients, onChange, disabled }: Props) {
  const update = (idx: number, patch: Partial<SignRecipientExt>) => {
    onChange(recipients.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  const remove = (idx: number) => {
    onChange(recipients.filter((_, i) => i !== idx).map((r, i) => ({ ...r, order: i })))
  }

  const add = () => {
    onChange([
      ...recipients,
      { name: '', email: '', role: 'signer', order: recipients.length, status: 'pending', signed_at: null },
    ])
  }

  return (
    <div style={{ fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {recipients.map((r, idx) => (
          <RecipientRow
            key={idx}
            idx={idx}
            recipient={r}
            disabled={disabled}
            onUpdate={patch => update(idx, patch)}
            onRemove={() => remove(idx)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={add}
        disabled={disabled}
        className="neo-btn-ghost neo-btn-sm"
        style={{ marginTop: 10 }}
      >
        <Plus size={13} />
        Ajouter un destinataire
      </button>

      <p style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
        💡 Tape un nom dans le champ pour chercher un candidat dans ta base — ses infos seront pré-remplies dans le formulaire.
        L&apos;ordre détermine la séquence de signature : le 1er signe en premier, puis le 2ème, etc.
      </p>
    </div>
  )
}

// ─── RecipientRow — 1 ligne avec autocomplete candidat ────────────────
interface RowProps {
  idx: number
  recipient: SignRecipientExt
  disabled?: boolean
  onUpdate: (patch: Partial<SignRecipientExt>) => void
  onRemove: () => void
}

function RecipientRow({ idx, recipient, disabled, onUpdate, onRemove }: RowProps) {
  const [results, setResults] = useState<CandidateSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [linked, setLinked] = useState<boolean>(!!recipient.candidat_id)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Recherche debounced quand l'utilisateur tape un nom (≥ 2 chars)
  useEffect(() => {
    if (linked || disabled) return
    const q = recipient.name.trim()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.length < 2) {
      setResults([])
      setShowResults(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await fetch(`/api/candidats?search=${encodeURIComponent(q)}&per_page=8&sort=date_desc`)
        const d = await r.json()
        setResults((d.candidats || []).slice(0, 8))
        setShowResults(true)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 250)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [recipient.name, linked, disabled])

  // Click outside ferme dropdown
  useEffect(() => {
    if (!showResults) return
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [showResults])

  const pickCandidate = (c: CandidateSearchResult) => {
    const fullName = [c.prenom, c.nom].filter(Boolean).join(' ').trim() || c.email || ''
    onUpdate({
      name: fullName,
      email: c.email || '',
      candidat_id: c.id,
    })
    setLinked(true)
    setShowResults(false)
  }

  const unlinkCandidate = () => {
    onUpdate({ candidat_id: null })
    setLinked(false)
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <span
        style={{
          flex: '0 0 24px',
          fontSize: 12.5,
          fontWeight: 700,
          color: 'var(--muted)',
          textAlign: 'center',
          paddingTop: 12,
        }}
      >
        {idx + 1}
      </span>

      {/* Champ Nom + autocomplete candidats */}
      <div ref={wrapRef} style={{ flex: 1, position: 'relative' }}>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="Nom (ou tape pour chercher un candidat)"
            value={recipient.name}
            disabled={disabled}
            onChange={e => {
              if (linked && e.target.value !== recipient.name) {
                // Si l'utilisateur modifie un nom déjà lié, on délie
                setLinked(false)
                onUpdate({ name: e.target.value, candidat_id: null })
              } else {
                onUpdate({ name: e.target.value })
              }
            }}
            onFocus={() => { if (results.length > 0) setShowResults(true) }}
            className="neo-input"
            style={{
              width: '100%',
              paddingLeft: linked ? 32 : 32,
              paddingRight: linked ? 30 : 8,
              borderColor: linked ? '#86EFAC' : undefined,
              background: linked ? 'rgba(34,197,94,0.06)' : undefined,
            }}
          />
          <span style={{
            position: 'absolute',
            left: 10, top: '50%', transform: 'translateY(-50%)',
            color: linked ? '#15803D' : 'var(--muted)',
            pointerEvents: 'none',
          }}>
            {linked ? <User size={13} /> : <Search size={13} />}
          </span>
          {linked && (
            <button
              type="button"
              onClick={unlinkCandidate}
              title="Délier le candidat"
              style={{
                position: 'absolute',
                right: 6, top: '50%', transform: 'translateY(-50%)',
                width: 22, height: 22,
                border: 'none', background: 'transparent',
                color: 'var(--muted)', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 4,
              }}
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Dropdown résultats */}
        {showResults && !linked && (results.length > 0 || searching) && (
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0, right: 0,
            zIndex: 100,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
            maxHeight: 280,
            overflowY: 'auto',
          }}>
            {searching && (
              <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>
                Recherche…
              </div>
            )}
            {!searching && results.length === 0 && (
              <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                Aucun candidat trouvé — tape un nom et un email manuels
              </div>
            )}
            {!searching && results.map(c => {
              const fullName = [c.prenom, c.nom].filter(Boolean).join(' ').trim() || '(sans nom)'
              return (
                <button
                  key={c.id}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); pickCandidate(c) }}
                  style={{
                    width: '100%', textAlign: 'left',
                    padding: '8px 12px',
                    background: 'transparent',
                    border: 'none', borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2, #F3F4F6)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 999,
                    background: 'var(--primary-soft)',
                    color: 'var(--primary)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <User size={13} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
                      {fullName}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {c.email || 'sans email'}{c.telephone ? ` · ${c.telephone}` : ''}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <input
        type="email"
        placeholder="email@example.com"
        value={recipient.email}
        disabled={disabled}
        onChange={e => onUpdate({ email: e.target.value })}
        className="neo-input"
        style={{ flex: 1 }}
      />
      <select
        value={recipient.role === 'cc' ? 'cc' : 'signer'}
        disabled={disabled}
        onChange={e => onUpdate({ role: e.target.value })}
        className="neo-input"
        style={{ flex: '0 0 130px', cursor: disabled ? 'not-allowed' : 'pointer' }}
      >
        {ROLE_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        title="Retirer"
        style={{
          flex: '0 0 40px',
          height: 40,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'var(--card)',
          color: 'var(--destructive)',
          cursor: 'pointer',
        }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}
