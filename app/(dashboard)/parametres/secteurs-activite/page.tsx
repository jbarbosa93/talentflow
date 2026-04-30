'use client'
import { useState, useMemo } from 'react'
import { Plus, Pencil, Trash2, Check, X, Loader2, AlertTriangle } from 'lucide-react'
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
    <div className="d-page" style={{ maxWidth: 860 }}>
      <div className="d-page-header" style={{ marginBottom: 28 }}>
        <div>
          <h1 className="d-page-title">Secteurs d&apos;activité (clients)</h1>
          <p className="d-page-sub">
            Liste des secteurs disponibles pour classer les clients (filtres, mailing, prospection).
            Chaque secteur peut être lié à un métier représentatif pour récupérer la couleur de pastille.
            Renommer un secteur met à jour automatiquement tous les clients qui l&apos;utilisent.
          </p>
        </div>
      </div>

      <div className="neo-card-soft" style={{ padding: 24 }}>
        {isLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)' }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Chargement…
          </div>
        )}

        {!isLoading && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {secteurs.map((s) => {
                const isEditing = editingId === s.id
                // getColorForMetier renvoie string | undefined (le hex)
                const colorHex = s.metier_representatif ? getColorForMetier(s.metier_representatif) : undefined
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
                        className="neo-btn-primary"
                        style={{ padding: '8px 12px', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
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
                  <div key={s.id} style={{
                    display: 'grid', gridTemplateColumns: '14px 1fr auto auto auto', gap: 12, alignItems: 'center',
                    padding: '10px 12px', borderRadius: 10,
                    background: 'var(--card)', border: '1.5px solid var(--border)',
                  }}>
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
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>#{s.ordre}</span>
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
                  className="neo-btn-primary"
                  style={{ padding: '8px 12px', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
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
