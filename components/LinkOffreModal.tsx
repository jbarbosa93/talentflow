'use client'
// v1.9.71+v1.9.72 — Modal pour lier un ou plusieurs candidats à une commande active.
// - Dropdown <select> des commandes actives (simple, pas de barre de recherche — user request v1.9.72)
// - Sélection d'1 commande → POST /api/offres-candidats { offre_id, candidat_ids }
// - Statut par défaut : "à envoyer"

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Briefcase, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useOffres } from '@/hooks/useOffres'

interface Props {
  candidatIds: string[]
  onClose: () => void
  onSuccess?: (linkedCount: number, offreTitre: string) => void
}

export default function LinkOffreModal({ candidatIds, onClose, onSuccess }: Props) {
  // v1.9.72 : useOffres(false) filtre déjà statut='active' côté Supabase
  const { data: offres, isLoading } = useOffres(false)
  const [selectedOffreId, setSelectedOffreId] = useState<string>('')
  const [saving, setSaving] = useState(false)

  const sortedOffres = useMemo(() => {
    const list = offres || []
    // Tri par nom_client puis titre (plus lisible dans un <select>)
    return [...list].sort((a: any, b: any) => {
      const ca = (a.client_nom || '').toLowerCase()
      const cb = (b.client_nom || '').toLowerCase()
      if (ca !== cb) return ca.localeCompare(cb)
      return (a.titre || '').toLowerCase().localeCompare((b.titre || '').toLowerCase())
    })
  }, [offres])

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
          width: '100%', maxWidth: 520,
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

        {/* Dropdown sélection commande (v1.9.72 : remplace barre de recherche) */}
        <div style={{ padding: '18px 22px' }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Choisir la commande
          </label>
          {isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12 }}>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Chargement…</span>
            </div>
          ) : sortedOffres.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: 16, background: 'var(--secondary)', borderRadius: 8 }}>
              Aucune commande active pour le moment
            </div>
          ) : (
            <select
              autoFocus
              value={selectedOffreId}
              onChange={e => setSelectedOffreId(e.target.value)}
              style={{
                width: '100%', height: 42, padding: '0 14px',
                border: '1.5px solid var(--border)', borderRadius: 10,
                background: 'var(--card)', color: 'var(--foreground)',
                fontSize: 13, fontFamily: 'inherit', outline: 'none',
                cursor: 'pointer', boxSizing: 'border-box',
                appearance: 'auto',
              }}
            >
              <option value="">— Sélectionner une commande —</option>
              {sortedOffres.map((o: any) => {
                const parts = [
                  o.client_nom ? `${o.client_nom}` : null,
                  o.titre,
                  o.localisation ? `· ${o.localisation}` : null,
                ].filter(Boolean)
                return (
                  <option key={o.id} value={o.id}>
                    {parts.join(' — ')}
                  </option>
                )
              })}
            </select>
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
