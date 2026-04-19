'use client'
import { useState, useEffect, useRef } from 'react'
import { Save, Loader2, CheckCircle, Briefcase, X, Pencil, ChevronUp, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { useMetiers } from '@/hooks/useMetiers'
import { useMetierCategories, type MetierCategory } from '@/hooks/useMetierCategories'

function SectionCard({ title, description, children, onSave, saving, saved }: {
  title: string; description?: string; children: React.ReactNode;
  onSave?: () => void; saving?: boolean; saved?: boolean
}) {
  return (
    <div className="neo-card-soft" style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 className="neo-section-title" style={{ marginBottom: 4 }}>{title}</h2>
        {description && <p style={{ fontSize: 12, color: 'var(--muted)' }}>{description}</p>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
      {onSave && (
        <div style={{
          marginTop: 24, paddingTop: 20,
          borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12,
        }}>
          {saved && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>
              <CheckCircle size={13} /> Sauvegardé
            </span>
          )}
          <button
            className="neo-btn-primary"
            onClick={onSave}
            disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: saving ? 0.7 : 1 }}
          >
            {saving
              ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />Sauvegarde...</>
              : <><Save size={13} />Sauvegarder</>
            }
          </button>
        </div>
      )}
    </div>
  )
}

export default function MetiersPage() {
  return (
    <div className="d-page" style={{ maxWidth: 860 }}>
      <div className="d-page-header" style={{ marginBottom: 28 }}>
        <h1 className="d-page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Briefcase size={22} style={{ color: 'var(--primary)' }} />
          Configuration des métiers
        </h1>
        <p className="d-page-sub">Gérez les métiers et leurs catégories</p>
      </div>
      <MetiersSection />
    </div>
  )
}

function MetiersSection() {
  const { metiers: remoteMetiers, isLoading, saveMetiers, isSaving } = useMetiers()
  const [metiers, setMetiers] = useState<string[]>([])
  const [newMetier, setNewMetier] = useState('')
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!isLoading && !dirty) {
      setMetiers(remoteMetiers)
    }
  }, [remoteMetiers, isLoading, dirty])

  const add = () => {
    const trimmed = newMetier.trim()
    if (!trimmed || metiers.includes(trimmed)) return
    const next = [...metiers, trimmed]
    setMetiers(next)
    setNewMetier('')
    setDirty(true)
    setSaved(false)
  }

  const remove = (m: string) => {
    setMetiers(prev => prev.filter(x => x !== m))
    setDirty(true)
    setSaved(false)
  }

  const handleSave = () => {
    saveMetiers(metiers, {
      onSuccess: () => {
        setSaved(true)
        setDirty(false)
        toast.success('Métiers enregistrés (partagés avec tous les utilisateurs)')
        setTimeout(() => setSaved(false), 3000)
      },
      onError: () => {
        toast.error('Erreur lors de la sauvegarde des métiers')
      },
    })
  }

  return (
    <>
      <SectionCard title="Métiers de l'agence" description="Définissez vos catégories de métiers pour classer les candidats" onSave={handleSave} saving={isSaving} saved={saved}>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
          Ces métiers sont partagés entre tous les utilisateurs. Toute modification sera visible par l&apos;ensemble de l&apos;équipe.
        </p>
        {isLoading ? (
          <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', textAlign: 'center', padding: '12px 0' }}>
            Chargement des métiers...
          </p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input
                className="neo-input"
                style={{ flex: 1, height: 36, fontSize: 13 }}
                placeholder="Ajouter un métier (ex: Électricien, Ventilateur...)"
                value={newMetier}
                onChange={e => setNewMetier(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') add() }}
              />
              <button onClick={add} disabled={!newMetier.trim()} className="neo-btn-yellow" style={{ height: 36, padding: '0 16px', fontSize: 13 }}>
                Ajouter
              </button>
            </div>
            {metiers.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', textAlign: 'center', padding: '12px 0' }}>
                Aucun métier défini. Ajoutez vos catégories ci-dessus.
              </p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {metiers.map(m => (
                  <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 20, background: 'var(--primary-soft)', border: '1.5px solid var(--primary)', fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
                    {m}
                    <button onClick={() => remove(m)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--muted)', lineHeight: 1 }}>
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </SectionCard>

      <CategoriesMetiersSection metiers={metiers} onRenameMetier={(oldName, newName) => {
        setMetiers(prev => prev.map(m => m === oldName ? newName : m))
        setDirty(true)
        setSaved(false)
      }} />
    </>
  )
}

// ─── Catégories de métiers avec couleurs ─────────────────────────────────────

const PRESET_COLORS = [
  '#EAB308', '#F97316', '#EF4444', '#EC4899', '#A855F7',
  '#6366F1', '#3B82F6', '#06B6D4', '#14B8A6', '#22C55E',
  '#84CC16', '#78716C', '#64748B', '#0EA5E9', '#D946EF',
]

function CategoriesMetiersSection({ metiers, onRenameMetier }: { metiers: string[]; onRenameMetier?: (oldName: string, newName: string) => void }) {
  const { categories: remoteCategories, isLoading, saveCategories, isSaving } = useMetierCategories()
  const [categories, setCategories] = useState<MetierCategory[]>([])
  const [newCatName, setNewCatName] = useState('')
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [renamingCat, setRenamingCat] = useState<{ name: string; value: string } | null>(null)
  const [renamingMetier, setRenamingMetier] = useState<{ catName: string; metier: string; value: string } | null>(null)
  const [dragOverCat, setDragOverCat] = useState<string | null>(null)
  const [colorPickerOpen, setColorPickerOpen] = useState<string | null>(null)
  const dragRef = useRef<{ catName: string; metier: string } | null>(null)

  useEffect(() => {
    if (!isLoading && !dirty) {
      setCategories(remoteCategories)
    }
  }, [remoteCategories, isLoading, dirty])

  // Métiers non assignés à aucune catégorie
  const assignedMetiers = new Set(categories.flatMap(c => c.metiers))
  const unassignedMetiers = metiers.filter(m => !assignedMetiers.has(m))

  const mark = () => { setDirty(true); setSaved(false) }

  const addCategory = () => {
    const trimmed = newCatName.trim()
    if (!trimmed || categories.some(c => c.name === trimmed)) return
    const usedColors = new Set(categories.map(c => c.color))
    const availableColor = PRESET_COLORS.find(c => !usedColors.has(c)) || PRESET_COLORS[0]
    setCategories([...categories, { name: trimmed, color: availableColor, metiers: [] }])
    setNewCatName('')
    mark()
  }

  const removeCategory = (name: string) => {
    setCategories(prev => prev.filter(c => c.name !== name))
    mark()
  }

  const updateCategoryColor = (name: string, color: string) => {
    setCategories(prev => prev.map(c => c.name === name ? { ...c, color } : c))
    mark()
  }

  const moveCategory = (name: string, dir: -1 | 1) => {
    const idx = categories.findIndex(c => c.name === name)
    const next = [...categories]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setCategories(next)
    mark()
  }

  const renameCategory = (oldName: string, newName: string) => {
    const trimmed = newName.trim()
    setRenamingCat(null)
    if (!trimmed || trimmed === oldName) return
    if (categories.some(c => c.name === trimmed)) { toast.error('Ce nom existe déjà'); return }
    setCategories(prev => prev.map(c => c.name === oldName ? { ...c, name: trimmed } : c))
    mark()
  }

  const renameMetierInCat = (catName: string, oldMetier: string, newMetier: string) => {
    const trimmed = newMetier.trim()
    setRenamingMetier(null)
    if (!trimmed || trimmed === oldMetier) return
    setCategories(prev => prev.map(c =>
      c.name === catName ? { ...c, metiers: c.metiers.map(m => m === oldMetier ? trimmed : m) } : c
    ))
    onRenameMetier?.(oldMetier, trimmed)
    mark()
  }

  const addMetierToCategory = (catName: string, metier: string) => {
    setCategories(prev => prev.map(c => {
      if (c.name === catName && !c.metiers.includes(metier)) return { ...c, metiers: [...c.metiers, metier] }
      return c
    }))
    mark()
  }

  const removeMetierFromCategory = (catName: string, metier: string) => {
    setCategories(prev => prev.map(c =>
      c.name === catName ? { ...c, metiers: c.metiers.filter(m => m !== metier) } : c
    ))
    mark()
  }

  const handleDrop = (toCat: string) => {
    if (!dragRef.current) return
    const { catName: fromCat, metier } = dragRef.current
    dragRef.current = null
    setDragOverCat(null)
    if (fromCat === toCat) return
    setCategories(prev => prev.map(c => {
      if (c.name === fromCat) return { ...c, metiers: c.metiers.filter(m => m !== metier) }
      if (c.name === toCat && !c.metiers.includes(metier)) return { ...c, metiers: [...c.metiers, metier] }
      return c
    }))
    mark()
  }

  const handleSave = () => {
    saveCategories(categories, {
      onSuccess: () => {
        setSaved(true)
        setDirty(false)
        toast.success('Catégories enregistrées')
        setTimeout(() => setSaved(false), 3000)
      },
      onError: () => {
        toast.error('Erreur lors de la sauvegarde des catégories')
      },
    })
  }

  return (
    <SectionCard title="Catégories de métiers" description="Regroupez vos métiers par catégorie avec une couleur pour mieux les identifier" onSave={handleSave} saving={isSaving} saved={saved}>
      {isLoading ? (
        <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', textAlign: 'center', padding: '12px 0' }}>
          Chargement...
        </p>
      ) : (
        <>
          {/* Ajouter une catégorie */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <input
              className="neo-input"
              style={{ flex: 1, height: 36, fontSize: 13 }}
              placeholder="Nouvelle catégorie (ex: Second oeuvre, Gros oeuvre...)"
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addCategory() }}
            />
            <button onClick={addCategory} disabled={!newCatName.trim()} className="neo-btn-yellow" style={{ height: 36, padding: '0 16px', fontSize: 13 }}>
              Ajouter
            </button>
          </div>

          {/* Liste des catégories */}
          {categories.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', textAlign: 'center', padding: '12px 0' }}>
              Aucune catégorie. Créez-en une pour regrouper vos métiers par couleur.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {categories.map((cat, catIdx) => (
                <div
                  key={cat.name}
                  onDragOver={e => { e.preventDefault(); setDragOverCat(cat.name) }}
                  onDragLeave={() => setDragOverCat(null)}
                  onDrop={() => handleDrop(cat.name)}
                  style={{
                    border: `2px solid ${dragOverCat === cat.name ? cat.color : cat.color}`,
                    borderRadius: 12,
                    padding: 14,
                    background: dragOverCat === cat.name ? `${cat.color}22` : `${cat.color}08`,
                    transition: 'background 0.15s',
                  }}
                >
                  {/* Header catégorie */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    {/* Nom — éditable */}
                    {renamingCat?.name === cat.name ? (
                      <input
                        autoFocus
                        value={renamingCat.value}
                        onChange={e => setRenamingCat({ name: cat.name, value: e.target.value })}
                        onBlur={() => renameCategory(cat.name, renamingCat.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') renameCategory(cat.name, renamingCat.value)
                          if (e.key === 'Escape') setRenamingCat(null)
                        }}
                        style={{
                          flex: 1, fontSize: 14, fontWeight: 700, height: 30, padding: '0 8px',
                          borderRadius: 6, border: '2px solid var(--primary)', background: 'var(--background)',
                          color: 'var(--foreground)', fontFamily: 'inherit', outline: 'none',
                        }}
                      />
                    ) : (
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)', flex: 1 }}>
                        {cat.name}
                      </span>
                    )}

                    {/* Actions: rename, couleur, reorder, delete */}
                    <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexShrink: 0 }}>
                      <button
                        onClick={() => setRenamingCat(renamingCat?.name === cat.name ? null : { name: cat.name, value: cat.name })}
                        title="Renommer"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', color: 'var(--muted)' }}
                      >
                        <Pencil size={13} />
                      </button>
                      {/* Bouton couleur + popover swatches */}
                      <div style={{ position: 'relative' }}>
                        <button
                          onClick={() => setColorPickerOpen(colorPickerOpen === cat.name ? null : cat.name)}
                          title="Changer la couleur"
                          style={{ width: 20, height: 20, borderRadius: '50%', background: cat.color, border: '2px solid var(--border)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                        />
                        {colorPickerOpen === cat.name && (
                          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)', zIndex: 200, background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 10, padding: 10, boxShadow: '0 6px 20px rgba(0,0,0,0.15)', display: 'flex', flexWrap: 'wrap', gap: 5, width: 142 }}>
                            {PRESET_COLORS.map(color => (
                              <button
                                key={color}
                                onClick={() => { updateCategoryColor(cat.name, color); setColorPickerOpen(null) }}
                                style={{ width: 22, height: 22, borderRadius: '50%', background: color, border: cat.color === color ? '2.5px solid var(--foreground)' : '2px solid transparent', cursor: 'pointer', padding: 0 }}
                                title={color}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => moveCategory(cat.name, -1)}
                        disabled={catIdx === 0}
                        title="Monter"
                        style={{ background: 'none', border: 'none', cursor: catIdx === 0 ? 'default' : 'pointer', padding: 4, display: 'flex', color: 'var(--muted)', opacity: catIdx === 0 ? 0.3 : 1 }}
                      >
                        <ChevronUp size={13} />
                      </button>
                      <button
                        onClick={() => moveCategory(cat.name, 1)}
                        disabled={catIdx === categories.length - 1}
                        title="Descendre"
                        style={{ background: 'none', border: 'none', cursor: catIdx === categories.length - 1 ? 'default' : 'pointer', padding: 4, display: 'flex', color: 'var(--muted)', opacity: catIdx === categories.length - 1 ? 0.3 : 1 }}
                      >
                        <ChevronDown size={13} />
                      </button>
                      <button
                        onClick={() => removeCategory(cat.name)}
                        title="Supprimer"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', color: 'var(--destructive)' }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Métiers dans cette catégorie */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, minHeight: 28 }}>
                    {cat.metiers.map(m => (
                      <span
                        key={m}
                        draggable
                        onDragStart={() => { dragRef.current = { catName: cat.name, metier: m } }}
                        onDragEnd={() => { dragRef.current = null; setDragOverCat(null) }}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          padding: '3px 8px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                          background: cat.color, color: 'white', cursor: 'grab',
                        }}
                      >
                        {renamingMetier?.catName === cat.name && renamingMetier.metier === m ? (
                          <input
                            autoFocus
                            value={renamingMetier.value}
                            onChange={e => setRenamingMetier({ catName: cat.name, metier: m, value: e.target.value })}
                            onBlur={() => renameMetierInCat(cat.name, m, renamingMetier.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') renameMetierInCat(cat.name, m, renamingMetier.value)
                              if (e.key === 'Escape') setRenamingMetier(null)
                            }}
                            onMouseDown={e => e.stopPropagation()}
                            onClick={e => e.stopPropagation()}
                            style={{
                              fontSize: 12, fontWeight: 600, height: 20, padding: '0 4px',
                              borderRadius: 4, border: '1.5px solid white', background: 'transparent',
                              color: 'white', fontFamily: 'inherit', outline: 'none', width: Math.max(60, renamingMetier.value.length * 8),
                            }}
                          />
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <span style={{ userSelect: 'none' }}>{m}</span>
                            <button
                              draggable={false}
                              title="Renommer"
                              onMouseDown={e => { e.stopPropagation(); e.preventDefault() }}
                              onClick={e => { e.stopPropagation(); setRenamingMetier({ catName: cat.name, metier: m, value: m }) }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'white', opacity: 0.75, flexShrink: 0 }}
                            >
                              <Pencil size={9} />
                            </button>
                          </span>
                        )}
                        <button onClick={() => removeMetierFromCategory(cat.name, m)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'white', opacity: 0.8, flexShrink: 0 }}>
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                    {cat.metiers.length === 0 && (
                      <span style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
                        Aucun métier — ajoutez-en ou déposez-en depuis une autre catégorie
                      </span>
                    )}
                  </div>

                  {/* Dropdown pour ajouter un métier */}
                  {unassignedMetiers.length > 0 && (
                    <select
                      className="neo-input-soft"
                      style={{ height: 32, fontSize: 12, width: 'auto', minWidth: 180 }}
                      value=""
                      onChange={e => { if (e.target.value) addMetierToCategory(cat.name, e.target.value) }}
                    >
                      <option value="">+ Ajouter un métier...</option>
                      {unassignedMetiers.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Métiers non assignés */}
          {unassignedMetiers.length > 0 && categories.length > 0 && (
            <div style={{ marginTop: 16, padding: 12, background: 'var(--secondary)', borderRadius: 10 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                Métiers sans catégorie ({unassignedMetiers.length})
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {unassignedMetiers.map(m => (
                  <span key={m} style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                    background: 'var(--surface)', border: '1px dashed var(--border)', color: 'var(--muted)',
                  }}>
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </SectionCard>
  )
}
