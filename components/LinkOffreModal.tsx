'use client'
// v1.9.71+v1.9.72 — Modal pour lier un ou plusieurs candidats à une commande active.
// v1.9.127 — Refonte V2 : police Jakarta, dropdown custom (plus de <select> macOS),
// boutons border 1px + glow brand au lieu de neo-brutalist.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Briefcase, X, Loader2, ChevronDown, Search, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useOffres } from '@/hooks/useOffres'

interface Props {
  candidatIds: string[]
  onClose: () => void
  onSuccess?: (linkedCount: number, offreTitre: string) => void
}

export default function LinkOffreModal({ candidatIds, onClose, onSuccess }: Props) {
  const { data: offres, isLoading } = useOffres(false)
  const [selectedOffreId, setSelectedOffreId] = useState<string>('')
  const [saving, setSaving] = useState(false)

  const sortedOffres = useMemo(() => {
    const list = offres || []
    return [...list].sort((a: any, b: any) => {
      const ca = (a.client_nom || '').toLowerCase()
      const cb = (b.client_nom || '').toLowerCase()
      if (ca !== cb) return ca.localeCompare(cb)
      return (a.titre || '').toLowerCase().localeCompare((b.titre || '').toLowerCase())
    })
  }, [offres])

  const selected = sortedOffres.find((o: any) => o.id === selectedOffreId)

  const handleConfirm = async () => {
    if (!selectedOffreId) return
    setSaving(true)
    try {
      const res = await fetch('/api/offres-candidats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ offre_id: selectedOffreId, candidat_ids: candidatIds }),
      })
      if (!res.ok) throw new Error('Erreur serveur')
      const data = await res.json()
      const offre = sortedOffres.find((o: any) => o.id === selectedOffreId)
      const count = data.linked ?? 0
      toast.success(
        count === 0
          ? 'Tous les candidats sont déjà liés à cette commande'
          : `${count} candidat${count > 1 ? 's' : ''} lié${count > 1 ? 's' : ''} à ${offre?.titre || 'la commande'}`
      )
      onSuccess?.(count, offre?.titre || '')
      onClose()
    } catch (e: any) {
      toast.error(e?.message || 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  // Esc
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
        fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface, var(--card))', borderRadius: 16,
          width: '100%', maxWidth: 520,
          display: 'flex', flexDirection: 'column', overflow: 'visible',
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
          border: '1px solid var(--border)',
        }}
      >
        {/* Header V2 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(245,166,35,0.12)', color: '#F5A623',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Briefcase size={17} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--foreground)' }}>Lier à une commande</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                {candidatIds.length} candidat{candidatIds.length > 1 ? 's' : ''} sélectionné{candidatIds.length > 1 ? 's' : ''}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--surface, var(--card))',
              color: 'var(--muted)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Dropdown custom V2 */}
        <div style={{ padding: '20px 22px', position: 'relative' }}>
          <label style={{
            display: 'block', fontSize: 12, fontWeight: 600,
            color: 'var(--muted)', marginBottom: 8,
          }}>
            Choisir la commande
          </label>
          {isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12 }}>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Chargement…</span>
            </div>
          ) : sortedOffres.length === 0 ? (
            <div style={{
              fontSize: 13, color: 'var(--muted)', textAlign: 'center',
              padding: 20, background: 'var(--background)', borderRadius: 10,
              border: '1px dashed var(--border)',
            }}>
              Aucune commande active pour le moment
            </div>
          ) : (
            <CommandePickerV2
              offres={sortedOffres}
              value={selectedOffreId}
              onChange={setSelectedOffreId}
              selectedOffre={selected}
            />
          )}
        </div>

        {/* Footer V2 */}
        <div style={{ padding: '12px 22px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, height: 38, borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--surface, var(--card))',
              color: 'var(--foreground)', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedOffreId || saving}
            style={{
              flex: 2, height: 38, borderRadius: 10,
              border: '1px solid var(--primary)', background: 'var(--primary)',
              color: '#1C1A14', fontSize: 13, fontWeight: 600,
              cursor: (!selectedOffreId || saving) ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              opacity: (!selectedOffreId || saving) ? 0.5 : 1,
              boxShadow: (!selectedOffreId || saving) ? 'none' : '0 4px 12px -4px rgba(234,179,8,.35)',
            }}
          >
            {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Liaison…</> : <><Briefcase size={14} /> Lier {candidatIds.length} candidat{candidatIds.length > 1 ? 's' : ''}</>}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Dropdown custom V2 (commandes) ──────────────────────────────────────────
function CommandePickerV2({
  offres, value, onChange, selectedOffre,
}: {
  offres: any[]
  value: string
  onChange: (id: string) => void
  selectedOffre: any
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const q = norm(search.trim())
  const filtered = offres.filter(o => {
    if (!q) return true
    const hay = norm(`${o.client_nom || ''} ${o.titre || ''} ${o.localisation || ''}`)
    return hay.includes(q)
  })

  const renderLabel = (o: any) => {
    const parts = [o.client_nom, o.titre, o.localisation].filter(Boolean)
    return parts.join(' — ')
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', height: 42, padding: '0 14px',
          border: `1px solid ${open ? 'var(--primary)' : 'var(--border)'}`,
          background: 'var(--surface, var(--card))',
          borderRadius: 10, color: selectedOffre ? 'var(--foreground)' : 'var(--muted)',
          fontSize: 13, fontWeight: selectedOffre ? 600 : 500,
          cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          transition: 'border-color 0.15s',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedOffre ? renderLabel(selectedOffre) : 'Sélectionner une commande...'}
        </span>
        <ChevronDown size={14} style={{ color: 'var(--muted)', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
          background: 'var(--surface, var(--card))',
          border: '1px solid var(--border)', borderRadius: 12,
          boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
          maxHeight: 320, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher…"
                style={{
                  width: '100%', height: 32, paddingLeft: 30, paddingRight: 10,
                  border: '1px solid var(--border)', borderRadius: 8,
                  background: 'var(--background)', color: 'var(--foreground)',
                  fontSize: 12, outline: 'none', fontFamily: 'inherit',
                }}
              />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
            {filtered.length === 0 && (
              <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
                Aucun résultat
              </div>
            )}
            {filtered.map((o: any) => {
              const isSelected = o.id === value
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => { onChange(o.id); setOpen(false); setSearch('') }}
                  style={{
                    width: '100%', textAlign: 'left',
                    padding: '8px 10px', borderRadius: 7,
                    background: isSelected ? 'var(--primary-soft, rgba(245,166,35,0.12))' : 'transparent',
                    border: isSelected ? '1px solid rgba(245,166,35,0.45)' : '1px solid transparent',
                    cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 8,
                    color: isSelected ? 'var(--primary)' : 'var(--foreground)',
                    fontSize: 13, fontWeight: isSelected ? 600 : 500,
                    marginBottom: 2,
                  }}
                  onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--secondary)' }}
                  onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {renderLabel(o)}
                  </span>
                  {isSelected && <Check size={13} style={{ flexShrink: 0 }} />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
