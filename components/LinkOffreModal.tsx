'use client'
// v1.9.71 — Modal pour lier un ou plusieurs candidats à une commande ouverte.
// Utilisé depuis la barre d'actions bulk de la liste candidats (et potentiellement ailleurs).
// - Recherche flexible (insensible accents/casse, booléenne ET/OU/SAUF) sur les commandes ouvertes
// - Sélection d'1 commande → POST /api/offres-candidats { offre_id, candidat_ids }
// - Si candidat déjà lié à la commande → ignoré (UNIQUE constraint)
// - Statut par défaut : "à envoyer"

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Briefcase, X, Search, MapPin, Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { parseBooleanSearch, normalize } from '@/lib/boolean-search'

interface OffreLight {
  id: string
  titre: string
  client_nom?: string | null
  localisation?: string | null
  nb_postes?: number | null
  statut?: string | null
  competences?: string[] | null
}

interface Props {
  candidatIds: string[]
  onClose: () => void
  onSuccess?: (linkedCount: number, offreTitre: string) => void
}

export default function LinkOffreModal({ candidatIds, onClose, onSuccess }: Props) {
  const [offres, setOffres] = useState<OffreLight[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedOffreId, setSelectedOffreId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        // /api/offres retourne toutes les offres, on filtre par statut 'ouverte' côté client
        const res = await fetch('/api/offres', { credentials: 'include' })
        if (!res.ok) throw new Error()
        const data = await res.json()
        const all: OffreLight[] = Array.isArray(data?.offres) ? data.offres : []
        const ouvertes = all.filter(o => (o.statut || '').toLowerCase() === 'ouverte')
        if (!cancelled) setOffres(ouvertes)
      } catch {
        if (!cancelled) toast.error('Erreur chargement commandes')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const booleanMatcher = useMemo(() => parseBooleanSearch(search), [search])
  const q = useMemo(() => normalize(search), [search])

  const filtered = useMemo(() => {
    if (!search.trim()) return offres
    return offres.filter(o => {
      const hay = `${o.titre} ${o.client_nom || ''} ${o.localisation || ''} ${(o.competences || []).join(' ')}`
      if (booleanMatcher) return booleanMatcher(hay)
      return normalize(hay).includes(q)
    })
  }, [offres, search, booleanMatcher, q])

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
      const offre = offres.find(o => o.id === selectedOffreId)
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

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--card)', borderRadius: 16,
          width: '100%', maxWidth: 640, maxHeight: '85vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          border: '1px solid var(--border)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Briefcase size={16} color="var(--primary-foreground)" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--foreground)' }}>Lier à une commande</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {candidatIds.length} candidat{candidatIds.length > 1 ? 's' : ''} sélectionné{candidatIds.length > 1 ? 's' : ''}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '14px 22px 8px', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher : titre, client, ville, compétence… ET/OU/SAUF"
              style={{
                width: '100%', height: 38, paddingLeft: 32, paddingRight: 12,
                border: '1.5px solid var(--border)', borderRadius: 10,
                background: 'var(--secondary)', color: 'var(--foreground)',
                fontSize: 13, fontFamily: 'inherit', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Liste */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 22px 10px', minHeight: 200 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, fontSize: 13, color: 'var(--muted)' }}>
              {offres.length === 0 ? 'Aucune commande ouverte' : 'Aucune commande ne correspond à la recherche'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filtered.map(o => {
                const active = selectedOffreId === o.id
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setSelectedOffreId(o.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                      padding: '12px 14px', borderRadius: 10,
                      border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                      background: active ? 'var(--primary-soft)' : 'var(--card)',
                      cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                      transition: 'all 0.12s',
                    }}
                  >
                    <div style={{
                      width: 20, height: 20, borderRadius: 6,
                      border: `2px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                      background: active ? 'var(--primary)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {active && <Check size={12} color="var(--primary-foreground)" strokeWidth={3} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>{o.titre}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted-foreground)', display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                        {o.client_nom && <span>👤 {o.client_nom}</span>}
                        {o.localisation && <span><MapPin size={10} style={{ display: 'inline', marginRight: 2 }} />{o.localisation}</span>}
                        {o.nb_postes && o.nb_postes > 1 && <span>👥 {o.nb_postes} postes</span>}
                      </div>
                      {o.competences && o.competences.length > 0 && (
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 4 }}>
                          {o.competences.slice(0, 5).map(c => (
                            <span key={c} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: 'var(--secondary)', color: 'var(--muted-foreground)' }}>{c}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 22px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            className="neo-btn-ghost"
            style={{ flex: 1, justifyContent: 'center' }}
          >
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedOffreId || saving}
            className="neo-btn-yellow"
            style={{
              flex: 2, justifyContent: 'center',
              opacity: (!selectedOffreId || saving) ? 0.5 : 1,
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
