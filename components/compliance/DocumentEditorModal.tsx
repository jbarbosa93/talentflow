'use client'

// TalentFlow Compliance — Modal édition/création document
// v2.7.1 — Multi-select sous-catégories pour permis de conduire (B + C + CE...)
// avec date d'échéance individuelle par catégorie.

import { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { X, Upload, Loader2, Plus, Trash2 } from 'lucide-react'
import type {
  DocumentType,
  CandidatDocumentWithStatus,
  PermisSubCategory,
} from '@/lib/compliance/types'
import { PERMIS_GROUPS } from '@/lib/compliance/types'

interface DocumentEditorModalProps {
  types: DocumentType[]
  candidatId: string
  existingDoc?: CandidatDocumentWithStatus | null
  prefilledTypeId?: string
  onClose: () => void
  onSaved: () => void
}

interface PermitEntry {
  sub_category: PermisSubCategory | ''
  expiry_date: string
  document_number: string
}

export default function DocumentEditorModal({
  types, candidatId, existingDoc, prefilledTypeId, onClose, onSaved,
}: DocumentEditorModalProps) {
  const isEdit = !!existingDoc
  const initialTypeId = existingDoc?.document_type_id || prefilledTypeId || (types[0]?.id || '')

  const [typeId, setTypeId] = useState(initialTypeId)
  const [label, setLabel] = useState(existingDoc?.label || '')
  const [subCategory, setSubCategory] = useState(existingDoc?.sub_category || '')
  const [issuedDate, setIssuedDate] = useState(existingDoc?.issued_date || '')
  const [expiryDate, setExpiryDate] = useState(existingDoc?.expiry_date || '')
  const [documentNumber, setDocumentNumber] = useState(existingDoc?.document_number || '')
  const [notes, setNotes] = useState(existingDoc?.notes || '')
  const [fileRecto, setFileRecto] = useState<File | null>(null)
  const [fileVerso, setFileVerso] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  // v2.7.1 — Mode multi-permis (création uniquement)
  const [permitEntries, setPermitEntries] = useState<PermitEntry[]>([])

  const currentType = useMemo(() => types.find(t => t.id === typeId), [types, typeId])
  const isPermis = currentType?.category === 'permis_conduire'
  const useMultiPermis = isPermis && !isEdit  // multi-select uniquement en création

  // Auto-remplir le label avec le nom du type quand on sélectionne (mode single)
  useEffect(() => {
    if (!isEdit && currentType && !useMultiPermis && (!label || types.some(t => t.name === label))) {
      const suffix = isPermis && subCategory ? ` ${subCategory}` : ''
      setLabel(currentType.name + suffix)
    }
  }, [typeId, currentType, isPermis, subCategory, isEdit, label, types, useMultiPermis])

  const togglePermitSub = (sub: PermisSubCategory) => {
    setPermitEntries(prev => {
      const exists = prev.find(e => e.sub_category === sub)
      if (exists) return prev.filter(e => e.sub_category !== sub)
      return [...prev, { sub_category: sub, expiry_date: '', document_number: '' }]
    })
  }
  const updatePermitEntry = (sub: PermisSubCategory, patch: Partial<PermitEntry>) => {
    setPermitEntries(prev => prev.map(e => e.sub_category === sub ? { ...e, ...patch } : e))
  }
  const removePermitEntry = (sub: PermisSubCategory) => {
    setPermitEntries(prev => prev.filter(e => e.sub_category !== sub))
  }

  const handleSave = async () => {
    if (!typeId) { toast.error('Type de document requis'); return }

    if (useMultiPermis) {
      if (permitEntries.length === 0) { toast.error('Sélectionne au moins une catégorie de permis'); return }
      if (currentType?.requires_photo && !fileRecto) { toast.error('Fichier recto requis'); return }

      setSaving(true)
      try {
        const form = new FormData()
        form.append('document_type_id', typeId)
        const entries = permitEntries.map(e => ({
          label: `${currentType?.name || 'Permis'} ${e.sub_category}`.trim(),
          sub_category: e.sub_category,
          expiry_date: e.expiry_date || null,
          issued_date: issuedDate || null,
          document_number: e.document_number || documentNumber || null,
          notes: notes.trim() || null,
        }))
        form.append('entries', JSON.stringify(entries))
        if (fileRecto) form.append('file_recto', fileRecto)
        if (fileVerso) form.append('file_verso', fileVerso)

        const res = await fetch(`/api/candidats/${candidatId}/documents/batch`, {
          method: 'POST', body: form,
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Erreur')
        toast.success(`${data.count || permitEntries.length} permis ajouté${permitEntries.length > 1 ? 's' : ''}`)
        onSaved()
      } catch (e: any) {
        toast.error(e.message)
      } finally {
        setSaving(false)
      }
      return
    }

    // Mode single (autres types ou édition)
    if (!label.trim()) { toast.error('Libellé requis'); return }
    if (currentType?.requires_expiry && !expiryDate) {
      toast.error(`Date d'échéance requise pour ${currentType.name}`)
      return
    }
    if (!isEdit && currentType?.requires_photo && !fileRecto) {
      toast.error('Fichier recto requis')
      return
    }

    setSaving(true)
    try {
      const form = new FormData()
      form.append('document_type_id', typeId)
      form.append('label', label.trim())
      if (subCategory) form.append('sub_category', subCategory)
      if (issuedDate) form.append('issued_date', issuedDate)
      if (expiryDate) form.append('expiry_date', expiryDate)
      if (documentNumber.trim()) form.append('document_number', documentNumber.trim())
      if (notes.trim()) form.append('notes', notes.trim())
      if (fileRecto) form.append('file_recto', fileRecto)
      if (fileVerso) form.append('file_verso', fileVerso)

      const url = isEdit
        ? `/api/candidats/${candidatId}/documents/${existingDoc!.id}`
        : `/api/candidats/${candidatId}/documents`
      const res = await fetch(url, { method: isEdit ? 'PATCH' : 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur')

      toast.success(isEdit ? 'Document modifié' : 'Document ajouté')
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (typeof window === 'undefined') return null

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9500,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(720px, 95vw)', maxHeight: '92vh',
          background: 'var(--card)', borderRadius: 16,
          boxShadow: '0 24px 64px rgba(0,0,0,0.30)',
          border: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px 18px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h2 style={{
            fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
            fontSize: 22, fontWeight: 400, margin: 0, color: 'var(--foreground)',
          }}>{isEdit ? 'Modifier le document' : 'Ajouter un document'}</h2>
          <button onClick={onClose} style={closeBtnStyle}><X size={16} /></button>
        </div>

        {/* Body */}
        <div style={{ overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Type de document *</label>
            <select value={typeId} onChange={e => { setTypeId(e.target.value); setPermitEntries([]) }} style={inputStyle as any}>
              {types.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {currentType?.description && (
              <div style={hintStyle}>{currentType.description}</div>
            )}
          </div>

          {useMultiPermis ? (
            // v2.7.1 — MODE MULTI-PERMIS : grille chips + détail par catégorie sélectionnée
            <>
              <div>
                <label style={labelStyle}>Catégories du permis * (sélection multiple)</label>
                <div style={hintStyle}>
                  Coche toutes les catégories indiquées sur le permis. Chaque catégorie aura sa propre date d&apos;échéance.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                  {PERMIS_GROUPS.map(group => (
                    <div key={group.label}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                        {group.label}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {group.items.map(sub => {
                          const isSelected = permitEntries.some(e => e.sub_category === sub)
                          return (
                            <button
                              key={sub}
                              type="button"
                              onClick={() => togglePermitSub(sub)}
                              style={{
                                ...pillBtnStyle,
                                background: isSelected ? 'var(--primary)' : 'var(--secondary)',
                                borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
                                color: isSelected ? '#1C1A14' : 'var(--foreground)',
                                fontWeight: 700,
                              }}
                            >{sub}</button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {permitEntries.length > 0 && (
                <div>
                  <label style={labelStyle}>Détails par catégorie</label>
                  <div style={hintStyle}>
                    Date d&apos;échéance par permis (optionnel — laisser vide si pas d&apos;échéance).
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    {permitEntries.map(e => (
                      <div key={e.sub_category} style={{
                        display: 'grid',
                        gridTemplateColumns: '70px 1fr 1fr 32px',
                        gap: 8, alignItems: 'center',
                        padding: 10, borderRadius: 10,
                        background: 'var(--secondary)', border: '1px solid var(--border)',
                      }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          padding: '6px 10px', borderRadius: 99,
                          background: 'var(--primary)', color: '#1C1A14',
                          fontSize: 13, fontWeight: 800,
                        }}>{e.sub_category}</span>
                        <input
                          type="date"
                          value={e.expiry_date}
                          onChange={ev => updatePermitEntry(e.sub_category as PermisSubCategory, { expiry_date: ev.target.value })}
                          placeholder="Échéance"
                          style={{ ...inputStyle, padding: '7px 10px', fontSize: 13 }}
                        />
                        <input
                          type="text"
                          value={e.document_number}
                          onChange={ev => updatePermitEntry(e.sub_category as PermisSubCategory, { document_number: ev.target.value })}
                          placeholder="N° (optionnel)"
                          maxLength={50}
                          style={{ ...inputStyle, padding: '7px 10px', fontSize: 13 }}
                        />
                        <button
                          type="button"
                          onClick={() => removePermitEntry(e.sub_category as PermisSubCategory)}
                          style={{
                            width: 32, height: 32, borderRadius: 8,
                            background: 'transparent', border: '1px solid var(--border)',
                            color: 'var(--destructive)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                          title="Retirer cette catégorie"
                        ><Trash2 size={13} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label style={labelStyle}>Date d&apos;émission (commune)</label>
                <input type="date" value={issuedDate} onChange={e => setIssuedDate(e.target.value)} style={inputStyle} />
                <div style={hintStyle}>Optionnel — appliqué à toutes les catégories sélectionnées.</div>
              </div>
            </>
          ) : (
            // MODE SINGLE (autres types ou édition)
            <>
              {isPermis && (
                <div>
                  <label style={labelStyle}>Sous-catégorie</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {PERMIS_GROUPS.flatMap(g => g.items).map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setSubCategory(c)}
                        style={{
                          ...pillBtnStyle,
                          background: subCategory === c ? 'var(--primary)' : 'var(--secondary)',
                          borderColor: subCategory === c ? 'var(--primary)' : 'var(--border)',
                          color: subCategory === c ? '#1C1A14' : 'var(--foreground)',
                        }}
                      >{c}</button>
                    ))}
                    {subCategory && (
                      <button type="button" onClick={() => setSubCategory('')} style={{ ...pillBtnStyle, background: 'transparent', borderColor: 'var(--border)' }}>
                        × Effacer
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label style={labelStyle}>Libellé *</label>
                <input
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder="Ex: Permis C, CQC, Carte conducteur…"
                  style={inputStyle}
                  maxLength={120}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Date d&apos;émission</label>
                  <input type="date" value={issuedDate} onChange={e => setIssuedDate(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>
                    Date d&apos;échéance{currentType?.requires_expiry ? ' *' : ' (optionnel)'}
                  </label>
                  <input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} style={inputStyle} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Numéro du document (optionnel)</label>
                <input
                  value={documentNumber}
                  onChange={e => setDocumentNumber(e.target.value)}
                  placeholder="Ex: 123456789"
                  style={inputStyle}
                  maxLength={50}
                />
              </div>
            </>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FileUpload
              label={`Recto / fichier principal${!isEdit && currentType?.requires_photo ? ' *' : ''}`}
              file={fileRecto}
              onChange={setFileRecto}
              hint={isEdit && existingDoc?.file_recto_path
                ? 'Remplace le fichier existant'
                : 'PDF / JPG / PNG · 10 MB max · Recto-verso possible dans le même PDF'}
            />
            <FileUpload
              label="Verso (uniquement si fichier séparé)"
              file={fileVerso}
              onChange={setFileVerso}
              hint={isEdit && existingDoc?.file_verso_path
                ? 'Remplace le fichier existant'
                : 'Laisse vide si recto+verso déjà dans le 1er fichier'}
            />
          </div>

          <div>
            <label style={labelStyle}>Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Notes internes…"
              style={{ ...inputStyle, resize: 'vertical' as const, minHeight: 60 }}
              maxLength={500}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
          flexShrink: 0, background: 'var(--card)',
        }}>
          <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
            {useMultiPermis && permitEntries.length > 0 && (
              <>📋 {permitEntries.length} permis seront créés</>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={secondaryBtnStyle} disabled={saving}>Annuler</button>
            <button onClick={handleSave} style={primaryBtnStyle} disabled={saving}>
              {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
              {isEdit ? 'Enregistrer' : useMultiPermis && permitEntries.length > 1 ? `Ajouter ${permitEntries.length} permis` : 'Ajouter'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

function FileUpload({ label, file, onChange, hint }: {
  label: string
  file: File | null
  onChange: (f: File | null) => void
  hint?: string
}) {
  const inputId = `f-${label.replace(/\W+/g, '')}`
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <label
        htmlFor={inputId}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 12px', borderRadius: 8,
          background: 'var(--secondary)', border: '1px dashed var(--border)',
          cursor: 'pointer', fontSize: 12, color: 'var(--muted-foreground)',
          minHeight: 38, overflow: 'hidden',
        }}
      >
        <Upload size={14} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {file ? file.name : 'Choisir un fichier…'}
        </span>
      </label>
      <input
        id={inputId} type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        onChange={e => onChange(e.target.files?.[0] || null)}
        style={{ display: 'none' }}
      />
      {hint && <div style={hintStyle}>{hint}</div>}
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)',
  marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box',
  background: 'var(--secondary)', border: '1px solid var(--border)',
  color: 'var(--foreground)', fontSize: 14, outline: 'none',
  fontFamily: 'inherit',
}

const hintStyle: React.CSSProperties = {
  fontSize: 10, color: 'var(--muted)', marginTop: 4, lineHeight: 1.4,
}

const pillBtnStyle: React.CSSProperties = {
  height: 32, padding: '0 12px', borderRadius: 99,
  border: '1px solid', fontSize: 12, fontWeight: 700,
  cursor: 'pointer', minWidth: 42,
  fontFamily: 'inherit',
}

const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  height: 36, padding: '0 16px', borderRadius: 10,
  background: 'var(--primary)', border: '1.5px solid var(--primary)',
  color: '#1C1A14', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  fontFamily: 'inherit',
}

const secondaryBtnStyle: React.CSSProperties = {
  height: 36, padding: '0 14px', borderRadius: 10,
  background: 'transparent', border: '1px solid var(--border)',
  color: 'var(--foreground)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}

const closeBtnStyle: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 10,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent', border: '1px solid var(--border)',
  cursor: 'pointer', color: 'var(--muted-foreground)',
}
