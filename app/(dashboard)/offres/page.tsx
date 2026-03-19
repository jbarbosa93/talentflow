'use client'
import { useState } from 'react'
import { Plus, MapPin, Pencil, Trash2, ChevronDown, Check } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useOffres, useCreateOffre, useUpdateOffre } from '@/hooks/useOffres'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Offre, OffreStatut } from '@/types/database'

const supabase = createClient()

const STATUT_BADGE: Record<OffreStatut, string> = {
  active:   'neo-badge neo-badge-green',
  pourvue:  'neo-badge neo-badge-blue',
  archivee: 'neo-badge neo-badge-gray',
}
const STATUT_LABELS: Record<OffreStatut, string> = {
  active: 'Active', pourvue: 'Pourvue', archivee: 'Archivée',
}
const STATUTS: OffreStatut[] = ['active', 'pourvue', 'archivee']

function useDeleteOffre() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('offres').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offres'] })
      toast.success('Offre supprimée')
    },
    onError: () => toast.error('Erreur suppression'),
  })
}

export default function OffresPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [editOffre, setEditOffre] = useState<Offre | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const { data: offres, isLoading } = useOffres(true)
  const updateOffre = useUpdateOffre()
  const deleteOffre = useDeleteOffre()

  const handleStatusChange = (id: string, statut: OffreStatut) => {
    updateOffre.mutate({ id, statut })
  }

  return (
    <div className="d-page">
      <div className="d-page-header">
        <div>
          <h1 className="d-page-title">Offres d&apos;emploi</h1>
          <p className="d-page-sub">{offres?.length || 0} offre{(offres?.length || 0) > 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="neo-btn">
          <Plus style={{ width: 15, height: 15 }} />
          Nouvelle offre
        </button>
      </div>

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{ height: 200, background: 'white', border: '2px solid #E8E0C8', borderRadius: 16, opacity: 0.5 }} />
          ))}
        </div>
      ) : offres?.length === 0 ? (
        <div className="neo-empty">
          <div className="neo-empty-icon">📋</div>
          <div className="neo-empty-title">Aucune offre</div>
          <div className="neo-empty-sub">Créez votre première offre d&apos;emploi</div>
          <button onClick={() => setShowCreate(true)} className="neo-btn" style={{ marginTop: 20 }}>
            <Plus style={{ width: 15, height: 15 }} /> Créer une offre
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {offres?.map(offre => (
            <div key={offre.id} className="neo-card-soft" style={{ padding: 24, position: 'relative' }}>
              {/* Actions top-right */}
              <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', gap: 6, alignItems: 'center' }}>
                {/* Status dropdown */}
                <div style={{ position: 'relative' }}>
                  <StatusDropdown
                    current={offre.statut}
                    onSelect={(s) => handleStatusChange(offre.id, s)}
                  />
                </div>
                {/* Edit */}
                <button
                  onClick={() => setEditOffre(offre)}
                  title="Modifier"
                  style={{
                    background: 'none', border: '1.5px solid #E8E0C8', cursor: 'pointer',
                    color: '#7A7060', padding: '4px 7px', borderRadius: 7, display: 'flex',
                    alignItems: 'center', transition: 'all 0.12s',
                  }}
                  onMouseOver={e => { e.currentTarget.style.background = '#F5F0E0'; e.currentTarget.style.color = '#1C1A14' }}
                  onMouseOut={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#7A7060' }}
                >
                  <Pencil size={12} />
                </button>
                {/* Delete */}
                {confirmDelete === offre.id ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      onClick={() => { deleteOffre.mutate(offre.id); setConfirmDelete(null) }}
                      style={{ fontSize: 10, fontWeight: 700, background: '#DC2626', color: 'white', border: 'none', cursor: 'pointer', padding: '3px 7px', borderRadius: 5 }}
                    >Oui</button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      style={{ fontSize: 10, fontWeight: 700, background: 'none', color: '#7A7060', border: '1px solid #E8E0C8', cursor: 'pointer', padding: '3px 7px', borderRadius: 5 }}
                    >Non</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(offre.id)}
                    title="Supprimer"
                    style={{
                      background: 'none', border: '1.5px solid #E8E0C8', cursor: 'pointer',
                      color: '#7A7060', padding: '4px 7px', borderRadius: 7, display: 'flex',
                      alignItems: 'center', transition: 'all 0.12s',
                    }}
                    onMouseOver={e => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.color = '#DC2626'; e.currentTarget.style.borderColor = '#FECACA' }}
                    onMouseOut={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#7A7060'; e.currentTarget.style.borderColor = '#E8E0C8' }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>

              {/* Title */}
              <div style={{ marginBottom: 16, paddingRight: 110 }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2 }}>
                  {offre.titre}
                </h3>
              </div>

              {/* Competences */}
              {offre.competences.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                  {offre.competences.slice(0, 4).map(c => (
                    <span key={c} className="neo-tag" style={{ fontSize: 10, padding: '3px 10px' }}>{c}</span>
                  ))}
                  {offre.competences.length > 4 && (
                    <span style={{ fontSize: 11, color: 'var(--ink2)', padding: '4px 0' }}>+{offre.competences.length - 4}</span>
                  )}
                </div>
              )}

              {/* Infos */}
              {offre.localisation && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: 'var(--ink2)', fontWeight: 600 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <MapPin style={{ width: 11, height: 11 }} />{offre.localisation}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'var(--font-heading)', fontSize: 22 }}>Nouvelle offre d&apos;emploi</DialogTitle>
          </DialogHeader>
          <OffreForm onSuccess={() => setShowCreate(false)} />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editOffre} onOpenChange={v => { if (!v) setEditOffre(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'var(--font-heading)', fontSize: 22 }}>Modifier l&apos;offre</DialogTitle>
          </DialogHeader>
          {editOffre && (
            <OffreForm
              initial={editOffre}
              onSuccess={() => setEditOffre(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Status Dropdown ─────────────────────────────────────────────────────────

function StatusDropdown({ current, onSelect }: { current: OffreStatut; onSelect: (s: OffreStatut) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className={STATUT_BADGE[current] || 'neo-badge neo-badge-gray'}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, border: 'none', fontFamily: 'inherit' }}
      >
        {STATUT_LABELS[current]}
        <ChevronDown size={10} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '110%', left: 0, zIndex: 50,
          background: 'white', border: '1.5px solid #E8E0C8', borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)', minWidth: 110, overflow: 'hidden',
        }}>
          {STATUTS.map(s => (
            <button
              key={s}
              onClick={() => { onSelect(s); setOpen(false) }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600, color: 'var(--ink)', fontFamily: 'inherit',
                borderBottom: s !== 'archivee' ? '1px solid #F0EAD8' : 'none',
              }}
              onMouseOver={e => e.currentTarget.style.background = '#F9F5E8'}
              onMouseOut={e => e.currentTarget.style.background = 'none'}
            >
              {STATUT_LABELS[s]}
              {current === s && <Check size={12} color="#7A7060" />}
            </button>
          ))}
        </div>
      )}
      {open && <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />}
    </div>
  )
}

// ─── Create / Edit Form ───────────────────────────────────────────────────────

function OffreForm({ initial, onSuccess }: { initial?: Offre; onSuccess: () => void }) {
  const [titre, setTitre]             = useState(initial?.titre || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [competences, setCompetences] = useState(initial?.competences?.join(', ') || '')
  const [localisation, setLocalisation] = useState(initial?.localisation || '')

  const createOffre = useCreateOffre()
  const updateOffre = useUpdateOffre()

  const isEdit = !!initial
  const isPending = createOffre.isPending || updateOffre.isPending

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      titre,
      description: description || undefined,
      competences: competences.split(',').map(c => c.trim()).filter(Boolean),
      localisation: localisation || undefined,
      exp_requise: 0,
    }

    if (isEdit) {
      updateOffre.mutate({ id: initial.id, ...payload }, { onSuccess })
    } else {
      createOffre.mutate(payload, { onSuccess })
    }
  }

  const inputStyle = {
    width: '100%', padding: '9px 12px', border: '1.5px solid #E8E0C8',
    borderRadius: 8, fontSize: 14, fontFamily: 'var(--font-body)',
    color: 'var(--ink)', background: 'white', outline: 'none',
    boxSizing: 'border-box' as const,
  }
  const labelStyle = {
    display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)',
    marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.05em',
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={labelStyle}>Titre du poste *</label>
        <input style={inputStyle} value={titre} onChange={e => setTitre(e.target.value)} placeholder="ex: Électricien CFC" required />
      </div>
      <div>
        <label style={labelStyle}>Localisation</label>
        <input style={inputStyle} value={localisation} onChange={e => setLocalisation(e.target.value)} placeholder="Genève, Lausanne..." />
      </div>
      <div>
        <label style={labelStyle}>Compétences (séparées par virgule)</label>
        <input style={inputStyle} value={competences} onChange={e => setCompetences(e.target.value)} placeholder="Électricité, CFC, AutoCAD..." />
      </div>
      <div>
        <label style={labelStyle}>Description</label>
        <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)} placeholder="Description du poste..." />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
        <button type="submit" disabled={!titre || isPending} className="neo-btn">
          {isPending ? 'Sauvegarde...' : isEdit ? 'Enregistrer les modifications' : "Créer l'offre"}
        </button>
      </div>
    </form>
  )
}
