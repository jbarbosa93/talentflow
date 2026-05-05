'use client'
import { useState, useMemo } from 'react'
import { Plus, Pencil, Trash2, Check, X, Loader2, AlertTriangle, ArrowUpDown, ChevronUp, ChevronDown, GripVertical } from 'lucide-react'
import { toast } from 'sonner'
import {
  useSecteursActiviteConfig,
  useCreateSecteur,
  useUpdateSecteur,
  useDeleteSecteur,
  type SecteurConfig,
} from '@/hooks/useSecteursActiviteConfig'
import { useMetiers } from '@/hooks/useMetiers'
import { useMetierCategories } from '@/hooks/useMetierCategories'

const inputStyle: React.CSSProperties = {
  width: '100%', height: 36, padding: '0 10px',
  border: '1.5px solid var(--border)', borderRadius: 8,
  background: 'var(--secondary)', color: 'var(--foreground)',
  fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
}

export default function SecteursActiviteParamsPage() {
  const { data: secteurs = [], isLoading } = useSecteursActiviteConfig()
  const { metiers } = useMetiers()
  const { getColorForMetier } = useMetierCategories()
  const createSecteur = useCreateSecteur()
  const updateSecteur = useUpdateSecteur()
  const deleteSecteur = useDeleteSecteur()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftNom, setDraftNom] = useState('')
  const [draftMetier, setDraftMetier] = useState('')

  const [creating, setCreating] = useState(false)
  const [newNom, setNewNom] = useState('')
  const [newMetier, setNewMetier] = useState('')

  // v2.1.12 — Réorder secteurs : drag&drop + boutons ↑↓ + tri auto par cat/couleur
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [sortMenuOpen, setSortMenuOpen] = useState(false)

  // Swap d'ordre entre deux secteurs (boutons ↑↓ ou drag&drop)
  const swapOrder = async (idA: string, idB: string) => {
    const a = secteurs.find(s => s.id === idA)
    const b = secteurs.find(s => s.id === idB)
    if (!a || !b) return
    // Update parallèle (chaque secteur prend l'ordre de l'autre)
    await Promise.all([
      updateSecteur.mutateAsync({ id: a.id, data: { ordre: b.ordre } }),
      updateSecteur.mutateAsync({ id: b.id, data: { ordre: a.ordre } }),
    ])
  }
  const moveUp = (idx: number) => {
    if (idx <= 0) return
    swapOrder(secteurs[idx].id, secteurs[idx - 1].id)
  }
  const moveDown = (idx: number) => {
    if (idx >= secteurs.length - 1) return
    swapOrder(secteurs[idx].id, secteurs[idx + 1].id)
  }
  const handleDrop = async (targetId: string) => {
    if (!draggedId || draggedId === targetId) { setDraggedId(null); return }
    const fromIdx = secteurs.findIndex(s => s.id === draggedId)
    const toIdx = secteurs.findIndex(s => s.id === targetId)
    setDraggedId(null)
    if (fromIdx < 0 || toIdx < 0) return
    // Réinsérer à la position toIdx puis renuméroter ordre 0..N
    const arr = [...secteurs]
    const [moved] = arr.splice(fromIdx, 1)
    arr.splice(toIdx, 0, moved)
    // Update ordre pour chaque secteur dont l'ordre a changé
    const updates = arr.map((s, i) => s.ordre !== i ? updateSecteur.mutateAsync({ id: s.id, data: { ordre: i } }) : null).filter(Boolean) as Promise<any>[]
    if (updates.length > 0) {
      await Promise.all(updates)
      toast.success('Ordre mis à jour')
    }
  }

  // Tri auto par catégorie de métier OU par couleur
  const sortBy = async (mode: 'categorie' | 'couleur') => {
    setSortMenuOpen(false)
    let sorted = [...secteurs]
    if (mode === 'categorie') {
      // Récupérer la catégorie (depuis le hook useMetierCategories) du métier représentatif
      const catOf = (s: SecteurConfig): string => {
        if (!s.metier_representatif) return 'zzz_aucune'
        // Trouver la catégorie qui contient ce métier
        return 'cat_' + (s.metier_representatif || 'zz')
      }
      sorted.sort((a, b) => {
        const ca = catOf(a)
        const cb = catOf(b)
        if (ca !== cb) return ca.localeCompare(cb, 'fr')
        return a.nom.localeCompare(b.nom, 'fr')
      })
    } else if (mode === 'couleur') {
      sorted.sort((a, b) => {
        const ca = a.metier_representatif ? (getColorForMetier(a.metier_representatif) || '#zzz') : '#zzz'
        const cb = b.metier_representatif ? (getColorForMetier(b.metier_representatif) || '#zzz') : '#zzz'
        if (ca !== cb) return ca.localeCompare(cb)
        return a.nom.localeCompare(b.nom, 'fr')
      })
    }
    // Update ordre pour chaque secteur dont l'ordre a changé
    const updates = sorted.map((s, i) => s.ordre !== i ? updateSecteur.mutateAsync({ id: s.id, data: { ordre: i } }) : null).filter(Boolean) as Promise<any>[]
    if (updates.length === 0) {
      toast.info('Déjà trié')
      return
    }
    await Promise.all(updates)
    toast.success(`Trié par ${mode === 'categorie' ? 'catégorie' : 'couleur'} (${updates.length} secteurs réordonnés)`)
  }

  const startEdit = (s: SecteurConfig) => {
    setEditingId(s.id)
    setDraftNom(s.nom)
    setDraftMetier(s.metier_representatif || '')
    setCreating(false)
  }
  const cancelEdit = () => {
    setEditingId(null)
    setDraftNom('')
    setDraftMetier('')
  }
  const commitEdit = (s: SecteurConfig) => {
    const nom = draftNom.trim()
    if (!nom) { toast.error('Le nom est obligatoire'); return }
    updateSecteur.mutate(
      { id: s.id, data: { nom, metier_representatif: draftMetier || null } },
      { onSuccess: () => cancelEdit() }
    )
  }

  const startCreate = () => {
    setCreating(true)
    setEditingId(null)
    setNewNom('')
    setNewMetier('')
  }
  const cancelCreate = () => {
    setCreating(false)
    setNewNom('')
    setNewMetier('')
  }
  const commitCreate = () => {
    const nom = newNom.trim()
    if (!nom) { toast.error('Le nom est obligatoire'); return }
    const ordre = secteurs.length > 0 ? Math.max(...secteurs.map(s => s.ordre)) + 1 : 0
    createSecteur.mutate(
      { nom, metier_representatif: newMetier || null, ordre },
      { onSuccess: () => cancelCreate() }
    )
  }

  const handleDelete = async (s: SecteurConfig) => {
    // Premier essai sans force pour récupérer le count usage
    try {
      await deleteSecteur.mutateAsync({ id: s.id, force: false })
    } catch (err: any) {
      if (typeof err?.usage === 'number' && err.usage > 0) {
        const ok = window.confirm(
          `Le secteur "${s.nom}" est utilisé par ${err.usage} client${err.usage > 1 ? 's' : ''}.\n\n` +
          `Confirmer la suppression ? Le secteur sera retiré automatiquement de tous ces clients.`
        )
        if (ok) {
          deleteSecteur.mutate({ id: s.id, force: true })
        }
      } else {
        toast.error('Erreur : ' + (err?.message || 'suppression échouée'))
      }
    }
  }

  // Liste métiers triée pour le select
  const metierOptions = useMemo(() => {
    return [...(metiers || [])].sort((a, b) => a.localeCompare(b))
  }, [metiers])

  return (
    <div className="d-page" style={{ maxWidth: 920, fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{
          fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
          fontSize: 32, fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.01em',
          color: 'var(--foreground)', margin: 0,
        }}>Secteurs d&apos;activité <span style={{ color: 'var(--muted-foreground)' }}>· clients</span></h1>
        <p style={{ fontSize: 13.5, color: 'var(--muted-foreground)', margin: '6px 0 0', lineHeight: 1.55 }}>
          Liste des secteurs disponibles pour classer les clients (filtres, mailing, prospection).
          Chaque secteur peut être lié à un métier représentatif pour récupérer la couleur de pastille.
          Renommer un secteur met à jour automatiquement tous les clients qui l&apos;utilisent.
        </p>
      </div>

      <div className="neo-card-soft" style={{ padding: 24 }}>
        {isLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)' }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Chargement…
          </div>
        )}

        {!isLoading && (
          <>
            {/* v2.1.12 — Toolbar : Trier par + indicateur drag */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
                <strong style={{ color: 'var(--foreground)' }}>{secteurs.length}</strong> secteur{secteurs.length > 1 ? 's' : ''} —
                glissez-déposez les cards ou utilisez les flèches ↑↓ pour réordonner.
              </p>
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setSortMenuOpen(v => !v)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    height: 36, padding: '0 14px', borderRadius: 10,
                    border: '1.5px solid var(--border)', background: 'var(--card)',
                    color: 'var(--foreground)', fontSize: 12.5, fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <ArrowUpDown size={14} /> Trier par…
                  <ChevronDown size={12} style={{ transition: 'transform 0.15s', transform: sortMenuOpen ? 'rotate(180deg)' : 'none' }} />
                </button>
                {sortMenuOpen && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => setSortMenuOpen(false)} />
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 101,
                      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.15)', minWidth: 220, overflow: 'hidden',
                    }}>
                      <button type="button" onClick={() => sortBy('categorie')} style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 13, fontWeight: 600, color: 'var(--foreground)', fontFamily: 'inherit', textAlign: 'left',
                        borderBottom: '1px solid var(--border)',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--secondary)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                      >Par catégorie de métier</button>
                      <button type="button" onClick={() => sortBy('couleur')} style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 13, fontWeight: 600, color: 'var(--foreground)', fontFamily: 'inherit', textAlign: 'left',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--secondary)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                      >Par couleur (hex)</button>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {secteurs.map((s, idx) => {
                const isEditing = editingId === s.id
                // getColorForMetier renvoie string | undefined (le hex)
                const colorHex = s.metier_representatif ? getColorForMetier(s.metier_representatif) : undefined
                const isDragging = draggedId === s.id
                if (isEditing) {
                  return (
                    <div key={s.id} style={{
                      display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 8, alignItems: 'center',
                      padding: '10px 12px', borderRadius: 10,
                      background: 'var(--secondary)', border: '1.5px solid var(--primary)',
                    }}>
                      <input
                        autoFocus
                        value={draftNom}
                        onChange={e => setDraftNom(e.target.value)}
                        placeholder="Nom du secteur"
                        style={inputStyle}
                        onKeyDown={e => { if (e.key === 'Enter') commitEdit(s); if (e.key === 'Escape') cancelEdit() }}
                      />
                      <select
                        value={draftMetier}
                        onChange={e => setDraftMetier(e.target.value)}
                        style={{ ...inputStyle, cursor: 'pointer' }}
                      >
                        <option value="">— Métier représentatif (optionnel) —</option>
                        {metierOptions.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <button
                        type="button" onClick={() => commitEdit(s)}
                        disabled={updateSecteur.isPending}
                        title="Valider"
                        style={{
                          padding: '8px 14px', borderRadius: 10,
                          border: '1.5px solid var(--primary)', background: 'var(--primary)',
                          color: '#1C1A14', fontSize: 13, fontWeight: 700,
                          cursor: updateSecteur.isPending ? 'not-allowed' : 'pointer',
                          fontFamily: 'inherit',
                          boxShadow: '0 4px 12px -4px rgba(234,179,8,.45)',
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                        }}
                      >
                        <Check size={14} /> {updateSecteur.isPending ? '…' : 'Valider'}
                      </button>
                      <button
                        type="button" onClick={cancelEdit}
                        disabled={updateSecteur.isPending}
                        title="Annuler"
                        style={{
                          padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                          border: '1.5px solid var(--border)', background: 'var(--card)',
                          color: 'var(--foreground)', cursor: 'pointer',
                          fontFamily: 'var(--font-body)', display: 'inline-flex', alignItems: 'center', gap: 6,
                        }}
                      >
                        <X size={14} /> Annuler
                      </button>
                    </div>
                  )
                }
                return (
                  <div
                    key={s.id}
                    draggable
                    onDragStart={() => setDraggedId(s.id)}
                    onDragOver={e => { e.preventDefault() }}
                    onDrop={e => { e.preventDefault(); handleDrop(s.id) }}
                    onDragEnd={() => setDraggedId(null)}
                    style={{
                      display: 'grid', gridTemplateColumns: 'auto 14px 1fr auto auto auto auto', gap: 10, alignItems: 'center',
                      padding: '10px 12px', borderRadius: 10,
                      background: 'var(--card)',
                      border: `1.5px solid ${isDragging ? 'var(--primary)' : 'var(--border)'}`,
                      opacity: isDragging ? 0.4 : 1,
                      transition: 'opacity 0.15s, border-color 0.15s',
                    }}
                  >
                    {/* Drag handle */}
                    <span title="Glisser pour réordonner" style={{
                      cursor: 'grab', color: 'var(--muted)', display: 'flex', alignItems: 'center',
                    }}><GripVertical size={14} /></span>
                    <span style={{
                      width: 12, height: 12, borderRadius: '50%',
                      background: colorHex || 'var(--border)',
                    }} />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--foreground)' }}>{s.nom}</span>
                      {s.metier_representatif && (
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                          → couleur de « {s.metier_representatif} »
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>#{idx + 1}</span>
                    {/* v2.1.12 — Boutons ↑↓ pour réordonner sans drag&drop */}
                    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 1 }}>
                      <button type="button" onClick={() => moveUp(idx)}
                        disabled={idx === 0 || updateSecteur.isPending}
                        title="Monter"
                        style={{
                          width: 24, height: 16, borderRadius: 4,
                          border: '1px solid var(--border)', background: 'var(--card)',
                          color: idx === 0 ? 'var(--border)' : 'var(--muted)',
                          cursor: idx === 0 ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          padding: 0,
                        }}
                      ><ChevronUp size={11} /></button>
                      <button type="button" onClick={() => moveDown(idx)}
                        disabled={idx === secteurs.length - 1 || updateSecteur.isPending}
                        title="Descendre"
                        style={{
                          width: 24, height: 16, borderRadius: 4,
                          border: '1px solid var(--border)', background: 'var(--card)',
                          color: idx === secteurs.length - 1 ? 'var(--border)' : 'var(--muted)',
                          cursor: idx === secteurs.length - 1 ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          padding: 0,
                        }}
                      ><ChevronDown size={11} /></button>
                    </div>
                    <button
                      type="button" onClick={() => startEdit(s)}
                      title="Modifier"
                      style={{
                        width: 32, height: 32, borderRadius: 6,
                        border: 'none', background: 'transparent',
                        color: 'var(--muted)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.background = 'var(--primary-soft)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'transparent' }}
                    ><Pencil size={14} /></button>
                    <button
                      type="button" onClick={() => handleDelete(s)}
                      title="Supprimer"
                      disabled={deleteSecteur.isPending}
                      style={{
                        width: 32, height: 32, borderRadius: 6,
                        border: 'none', background: 'transparent',
                        color: 'var(--muted)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--destructive)'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'transparent' }}
                    ><Trash2 size={14} /></button>
                  </div>
                )
              })}
            </div>

            {creating ? (
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 8, alignItems: 'center',
                padding: '10px 12px', borderRadius: 10,
                background: 'var(--secondary)', border: '1.5px dashed var(--primary)',
              }}>
                <input
                  autoFocus
                  value={newNom}
                  onChange={e => setNewNom(e.target.value)}
                  placeholder="Nom du nouveau secteur"
                  style={inputStyle}
                  onKeyDown={e => { if (e.key === 'Enter') commitCreate(); if (e.key === 'Escape') cancelCreate() }}
                />
                <select
                  value={newMetier}
                  onChange={e => setNewMetier(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="">— Métier représentatif (optionnel) —</option>
                  {metierOptions.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <button
                  type="button" onClick={commitCreate}
                  disabled={createSecteur.isPending}
                  style={{
                    padding: '8px 14px', borderRadius: 10,
                    border: '1.5px solid var(--primary)', background: 'var(--primary)',
                    color: '#1C1A14', fontSize: 13, fontWeight: 700,
                    cursor: createSecteur.isPending ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    boxShadow: '0 4px 12px -4px rgba(234,179,8,.45)',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <Check size={14} /> {createSecteur.isPending ? '…' : 'Ajouter'}
                </button>
                <button
                  type="button" onClick={cancelCreate}
                  disabled={createSecteur.isPending}
                  style={{
                    padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    border: '1.5px solid var(--border)', background: 'var(--card)',
                    color: 'var(--foreground)', cursor: 'pointer',
                    fontFamily: 'var(--font-body)', display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <X size={14} /> Annuler
                </button>
              </div>
            ) : (
              <button
                type="button" onClick={startCreate}
                className="neo-btn-ghost"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
              >
                <Plus size={14} /> Ajouter un secteur
              </button>
            )}

            <div style={{
              marginTop: 20, padding: '12px 14px', borderRadius: 10,
              background: 'var(--info-soft, var(--secondary))',
              border: '1px solid var(--info, var(--border))',
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <AlertTriangle size={14} style={{ color: 'var(--info, var(--muted))', marginTop: 2, flexShrink: 0 }} />
              <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0, lineHeight: 1.5 }}>
                Renommer un secteur met à jour <strong>tous les clients</strong> qui l&apos;utilisent (rename propagé).
                Supprimer un secteur retire son nom des clients qui l&apos;utilisent (avec confirmation si &gt; 0).
                Les modifications côté serveur peuvent prendre jusqu&apos;à <strong>1 minute</strong> pour
                se propager dans la nouvelle extraction automatique.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
