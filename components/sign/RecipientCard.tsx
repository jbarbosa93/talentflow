// TalentFlow Sign — Card destinataire pour /sign/new
// v2.2.1
//
// Card avec bordure gauche colorée (par ordre), drag handle, autocomplete
// candidat TalentFlow, champ rôle libre (Candidat/Consultant/RH...),
// dropdown action (signer / cc), bouton supprimer.
'use client'

import { useState, useEffect, useRef } from 'react'
import {
  GripVertical, Trash2, Search, User, X, ChevronUp, ChevronDown,
  PenLine, Eye,
} from 'lucide-react'
import { RECIPIENT_COLORS, type SignRecipient } from '@/lib/sign/types'

export type RecipientCandidat = SignRecipient & { candidat_id?: string | null }

// v2.2.3 — Exporté pour usage externe (RoleFixedRecipients)
export interface CandidateResult {
  id: string
  prenom: string | null
  nom: string | null
  email: string | null
  telephone: string | null
}

interface Props {
  idx: number
  total: number
  recipient: RecipientCandidat
  showOrder: boolean             // si l'ordre de signature est activé
  draggable?: boolean
  /** Index actuellement en cours de drag (depuis le parent) */
  dragSrcIdx: number | null
  setDragSrcIdx: (i: number | null) => void
  onUpdate: (patch: Partial<RecipientCandidat>) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
  /** Drag interne au parent : appelle ça quand on drop sur cette card */
  onDropTo: (fromIdx: number, toIdx: number) => void
}

export default function RecipientCard({
  idx, total, recipient, showOrder, draggable, dragSrcIdx, setDragSrcIdx,
  onUpdate, onMove, onRemove, onDropTo,
}: Props) {
  const palette = RECIPIENT_COLORS[idx % RECIPIENT_COLORS.length]
  const isCC = recipient.role === 'cc'
  const isLinked = !!recipient.candidat_id
  const isDraggingThis = dragSrcIdx === idx
  const isDragOver = dragSrcIdx !== null && dragSrcIdx !== idx

  return (
    <div
      draggable={draggable}
      onDragStart={() => draggable && setDragSrcIdx(idx)}
      onDragOver={e => { if (draggable && dragSrcIdx !== null && dragSrcIdx !== idx) e.preventDefault() }}
      onDrop={e => {
        e.preventDefault()
        if (dragSrcIdx !== null && dragSrcIdx !== idx) onDropTo(dragSrcIdx, idx)
        setDragSrcIdx(null)
      }}
      onDragEnd={() => setDragSrcIdx(null)}
      style={{
        display: 'flex',
        gap: 12,
        padding: '14px 16px 14px 14px',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderLeft: `4px solid ${palette.stroke}`,
        borderRadius: 12,
        opacity: isDraggingThis ? 0.4 : 1,
        boxShadow: isDragOver ? `0 0 0 2px ${palette.stroke}` : undefined,
        transition: 'opacity 0.15s, box-shadow 0.15s',
      }}
    >
      {/* Drag handle + ordre */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        flexShrink: 0,
        paddingTop: 6,
        cursor: draggable ? 'grab' : 'default',
      }}>
        {draggable && <GripVertical size={14} style={{ color: 'var(--muted)' }} />}
        {showOrder && (
          <div style={{
            width: 26, height: 26, borderRadius: 999,
            background: palette.stroke,
            color: '#fff',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 800,
          }}>
            {idx + 1}
          </div>
        )}
      </div>

      {/* Champs */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Ligne 1 : Rôle + Prénom (autocomplete) + Nom */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 160px) 1fr 1fr', gap: 8 }}>
          <input
            type="text"
            value={recipient.roleName || ''}
            placeholder="Rôle (ex: Candidat)"
            onChange={e => onUpdate({ roleName: e.target.value })}
            className="neo-input"
            style={{ height: 38, fontSize: 13 }}
          />
          {/* Prénom + autocomplete candidat (cherche dans la DB) */}
          <FirstNameAutocomplete
            value={recipient.firstName ?? deriveFirstName(recipient.name)}
            isLinked={isLinked}
            onChange={(firstName, candidat) => {
              if (candidat) {
                const fn = candidat.prenom || firstName
                const ln = candidat.nom || ''
                onUpdate({
                  firstName: fn,
                  lastName: ln,
                  name: [fn, ln].filter(Boolean).join(' ').trim() || fn,
                  email: candidat.email || recipient.email,
                  candidat_id: candidat.id,
                })
              } else {
                const ln = recipient.lastName ?? deriveLastName(recipient.name)
                onUpdate({
                  firstName,
                  name: [firstName, ln].filter(Boolean).join(' ').trim(),
                  candidat_id: null,
                })
              }
            }}
            onUnlink={() => onUpdate({ candidat_id: null })}
          />
          {/* Nom (saisie libre, pas d'autocomplete) */}
          <input
            type="text"
            value={recipient.lastName ?? deriveLastName(recipient.name)}
            placeholder="Nom"
            disabled={isLinked}
            onChange={e => {
              const lastName = e.target.value
              const fn = recipient.firstName ?? deriveFirstName(recipient.name)
              onUpdate({
                lastName,
                name: [fn, lastName].filter(Boolean).join(' ').trim(),
              })
            }}
            className="neo-input"
            style={{
              height: 38,
              fontSize: 13,
              opacity: isLinked ? 0.7 : 1,
              cursor: isLinked ? 'not-allowed' : 'text',
            }}
          />
        </div>
        {/* Ligne 2 : Email pleine largeur */}
        <input
          type="email"
          value={recipient.email}
          onChange={e => onUpdate({ email: e.target.value })}
          placeholder="email@example.com"
          className="neo-input"
          style={{ height: 38, fontSize: 13 }}
        />

        {/* Action select + buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <select
            value={isCC ? 'cc' : 'signer'}
            onChange={e => onUpdate({ role: e.target.value })}
            style={{
              height: 32,
              padding: '0 10px',
              fontSize: 12.5,
              fontWeight: 600,
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--foreground)',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <option value="signer">✍️ Doit signer</option>
            <option value="cc">CC — Reçoit une copie</option>
          </select>

          {/* Aperçu visuel rôle */}
          {isCC ? (
            <span style={{
              fontSize: 11, color: 'var(--muted)',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <Eye size={11} />
              Pas de signature requise
            </span>
          ) : (
            <span style={{
              fontSize: 11, color: 'var(--muted)',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <PenLine size={11} />
              Doit signer le document
            </span>
          )}

          <span style={{ flex: 1 }} />

          {/* Reorder fallback */}
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={idx === 0}
            title="Monter"
            style={iconBtnStyle(idx === 0)}
          >
            <ChevronUp size={13} />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={idx === total - 1}
            title="Descendre"
            style={iconBtnStyle(idx === total - 1)}
          >
            <ChevronDown size={13} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            title="Retirer"
            style={{ ...iconBtnStyle(false), color: 'var(--destructive)' }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

const iconBtnStyle = (disabled: boolean): React.CSSProperties => ({
  width: 30, height: 30,
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--card)',
  color: 'var(--muted)',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.3 : 1,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
})

// ─── Helpers split nom complet → prénom / nom ─────────────────────────
function deriveFirstName(fullName: string): string {
  const parts = (fullName || '').trim().split(/\s+/)
  return parts[0] || ''
}
function deriveLastName(fullName: string): string {
  const parts = (fullName || '').trim().split(/\s+/)
  return parts.slice(1).join(' ')
}

// ─── FirstNameAutocomplete — input prénom avec dropdown candidats ─────
// v2.2.3 — Exporté pour réutilisation dans RoleFixedRecipients (mode template)
export function FirstNameAutocomplete({
  value, isLinked, onChange, onUnlink,
}: {
  value: string
  isLinked: boolean
  onChange: (firstName: string, candidat?: CandidateResult) => void
  onUnlink: () => void
}) {
  const [results, setResults] = useState<CandidateResult[]>([])
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
        const r = await fetch(`/api/candidats?search=${encodeURIComponent(q)}&per_page=8&sort=date_desc`)
        const d = await r.json()
        setResults((d.candidats || []).slice(0, 8))
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

  const pick = (c: CandidateResult) => {
    const firstName = c.prenom || c.email || ''
    onChange(firstName, c)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {/* Wrapper flex propre — pas de positionnement absolu douteux */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        height: 38,
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
          display: 'inline-flex',
          alignItems: 'center',
          flexShrink: 0,
        }}>
          {isLinked ? <User size={13} /> : <Search size={13} />}
        </span>
        <input
          type="text"
          value={value}
          placeholder="Prénom"
          onChange={e => onChange(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true) }}
          style={{
            flex: 1,
            minWidth: 0,
            height: '100%',
            padding: '0 8px 0 4px',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'var(--foreground)',
            fontSize: 13,
            fontFamily: 'inherit',
          }}
        />
        {isLinked && (
          <button
            type="button"
            onClick={onUnlink}
            title="Délier le candidat"
            style={{
              padding: '0 8px',
              height: '100%',
              border: 'none',
              background: 'transparent',
              color: 'var(--muted)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {open && !isLinked && (results.length > 0 || searching) && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          zIndex: 100,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
          maxHeight: 280, overflowY: 'auto',
          fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
        }}>
          {searching && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>Recherche…</div>
          )}
          {!searching && results.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
              Aucun candidat trouvé
            </div>
          )}
          {!searching && results.map(c => {
            const fullName = [c.prenom, c.nom].filter(Boolean).join(' ').trim() || '(sans nom)'
            return (
              <button
                key={c.id}
                type="button"
                onMouseDown={e => { e.preventDefault(); pick(c) }}
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
                  width: 28, height: 28, borderRadius: 999,
                  background: 'var(--primary-soft)', color: 'var(--primary)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <User size={13} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>{fullName}</div>
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
  )
}
