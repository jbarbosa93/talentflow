// TalentFlow Sign — Zone drag&drop + liste documents (réutilisable)
// v2.2.1
// v2.8.0 — Toggle "Papier à en-tête L-Agence" (stamp logo + footer page 1 à l'upload)
'use client'

import { useState, useCallback } from 'react'
import { Upload, FileText, Trash2, Loader2, GripVertical, ChevronUp, ChevronDown, Lock, FileBadge } from 'lucide-react'
import { toast } from 'sonner'
import type { SignDocument } from '@/lib/sign/types'

interface Props {
  documents: SignDocument[]
  onChange: (docs: SignDocument[]) => void
  /** Si true, lecture seule (template sélectionné par exemple) */
  readOnly?: boolean
  /** v2.8.0 — Mode "template contrat" : affiche la zone d'upload + le toggle
   *  stamp en temps réel (par doc). Sinon comportement classique. */
  contractMode?: boolean
}

export default function DocumentUploader({ documents, onChange, readOnly, contractMode }: Props) {
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  // v2.8.0 — En mode contrat, on upload TOUJOURS avec letterhead=lagence pour
  // créer les 2 versions Storage (original + stampé). Le toggle par doc swap
  // ensuite localement entre storage_path_original et storage_path_stamped,
  // sans nouvel appel serveur.

  const upload = async (file: File) => {
    if (file.type !== 'application/pdf') {
      toast.error(`"${file.name}" : PDF uniquement`)
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error(`"${file.name}" > 50 MB`)
      return
    }
    const fd = new FormData()
    fd.append('file', file)
    fd.append('folder', 'envelopes')
    fd.append('ownerId', 'draft')
    // En mode contrat : génère les 2 versions Storage à chaque upload
    if (contractMode) fd.append('letterhead', 'lagence')
    const r = await fetch('/api/sign/upload', { method: 'POST', body: fd })
    const data = await r.json()
    if (!r.ok) throw new Error(data.error || 'Erreur upload')
    // v2.8.5 — En mode contrat, on upload TOUJOURS les 2 versions (original
     // + stamped) mais le storage_path INITIAL pointe sur l'ORIGINAL (stamp
     // OFF par défaut). L'utilisateur active manuellement via le pill.
    const doc: SignDocument = {
      name: file.name,
      storage_path: contractMode && data.path_original ? data.path_original : data.path,
      order: documents.length,
      ...(contractMode && data.path_original ? {
        storage_path_original: data.path_original,
        storage_path_stamped: data.path_stamped,
        // Pas de `letterhead` ici → toggle UI affiche "+ Stamp L-Agence" (OFF)
      } : {}),
    }
    onChange([...documents, doc])
  }

  // v2.8.0 — Toggle stamp en temps réel sur un doc déjà uploadé.
  // Swap storage_path entre original ↔ stamped (les 2 versions sont déjà en
  // Storage depuis l'upload initial). Si stamped pas dispo (échec upload),
  // ne fait rien.
  const toggleStamp = (idx: number) => {
    const d = documents[idx]
    if (!d.storage_path_original) return // pas en mode contrat, ignore
    const isStamped = d.letterhead === 'lagence'
    const next = isStamped
      ? { ...d, storage_path: d.storage_path_original, letterhead: undefined as undefined }
      : d.storage_path_stamped
        ? { ...d, storage_path: d.storage_path_stamped, letterhead: 'lagence' as const }
        : d
    onChange(documents.map((doc, i) => i === idx ? next : doc))
  }

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    if (readOnly) return
    const arr = Array.from(files)
    if (arr.length === 0) return
    setUploading(true)
    let ok = 0
    for (const f of arr) {
      try { await upload(f); ok += 1 } catch (e: any) { toast.error(`${f.name}: ${e.message}`) }
    }
    setUploading(false)
    if (ok > 0) toast.success(`${ok} PDF${ok > 1 ? 's' : ''} ajouté${ok > 1 ? 's' : ''}`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents, readOnly])

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); if (!readOnly && !dragging) setDragging(true) }
  const onDragLeave = (e: React.DragEvent) => { if (e.currentTarget === e.target) setDragging(false) }
  const onDropFiles = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    if (readOnly) return
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files)
  }

  const remove = (idx: number) => onChange(documents.filter((_, i) => i !== idx).map((d, i) => ({ ...d, order: i })))
  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || to >= documents.length) return
    const next = documents.slice()
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onChange(next.map((d, i) => ({ ...d, order: i })))
  }

  return (
    <div>
      {/* Liste documents */}
      {documents.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: readOnly ? 0 : 12 }}>
          {documents.map((d, idx) => {
            const isDragging = dragIdx === idx
            return (
              <div
                key={idx}
                draggable={!readOnly}
                onDragStart={() => !readOnly && setDragIdx(idx)}
                onDragOver={(e) => { e.preventDefault(); if (dragIdx !== null && dragIdx !== idx) e.dataTransfer.dropEffect = 'move' }}
                onDrop={(e) => { e.preventDefault(); if (dragIdx !== null && dragIdx !== idx) move(dragIdx, idx); setDragIdx(null) }}
                onDragEnd={() => setDragIdx(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  background: 'var(--surface-2)',
                  opacity: isDragging ? 0.4 : 1,
                  cursor: readOnly ? 'default' : 'grab',
                  transition: 'opacity 0.15s',
                }}
              >
                {!readOnly && <GripVertical size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />}
                <FileText size={14} style={{ color: 'var(--info)', flexShrink: 0 }} />
                <span style={{
                  flex: 1, minWidth: 0,
                  fontSize: 13, color: 'var(--foreground)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {d.name}
                </span>
                {/* v2.8.0 — Toggle stamp en temps réel (mode contrat uniquement).
                    Click sur le badge → swap entre original ↔ stamped (déjà en Storage). */}
                {contractMode && d.storage_path_original && (
                  <button
                    type="button"
                    onClick={() => toggleStamp(idx)}
                    title={d.letterhead === 'lagence'
                      ? 'Cliquer pour retirer le papier à en-tête L-Agence'
                      : 'Cliquer pour ajouter le papier à en-tête L-Agence'}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '4px 10px',
                      fontSize: 11, fontWeight: 700,
                      background: d.letterhead === 'lagence' ? 'var(--primary-soft)' : 'var(--surface-2)',
                      color: d.letterhead === 'lagence' ? 'var(--primary, #A16207)' : 'var(--muted)',
                      border: `1px solid ${d.letterhead === 'lagence' ? 'rgba(234,179,8,0.45)' : 'var(--border)'}`,
                      borderRadius: 999,
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'all 0.12s',
                    }}
                  >
                    <FileBadge size={11} />
                    {d.letterhead === 'lagence' ? 'Stamp L-Agence ✓' : '+ Stamp L-Agence'}
                  </button>
                )}
                {readOnly ? (
                  <span style={{
                    fontSize: 10.5, color: 'var(--muted)',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    <Lock size={11} />
                    Template
                  </span>
                ) : (
                  <>
                    <IconBtn onClick={() => move(idx, idx - 1)} disabled={idx === 0} title="Monter">
                      <ChevronUp size={13} />
                    </IconBtn>
                    <IconBtn onClick={() => move(idx, idx + 1)} disabled={idx === documents.length - 1} title="Descendre">
                      <ChevronDown size={13} />
                    </IconBtn>
                    <IconBtn onClick={() => remove(idx)} title="Supprimer" danger>
                      <Trash2 size={13} />
                    </IconBtn>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* v2.8.0 — En mode contrat, info banner simple. Le toggle stamp est
          par doc dans la liste ci-dessus (click sur le pill "Stamp L-Agence"). */}
      {!readOnly && contractMode && documents.length === 0 && (
        <div style={{
          padding: '10px 14px',
          marginBottom: 10,
          background: 'var(--primary-soft)',
          border: '1px solid rgba(234,179,8,0.35)',
          borderRadius: 10,
          fontSize: 12.5,
          color: 'var(--foreground)',
          lineHeight: 1.4,
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <FileBadge size={14} style={{ color: 'var(--primary, #A16207)', flexShrink: 0, marginTop: 2 }} />
          <span>
            <strong>Template contrat de travail</strong> — Upload le contrat du jour.
            Après upload, click sur le pill <strong>« + Stamp L-Agence »</strong> pour
            ajouter / retirer le logo + footer en temps réel.
          </span>
        </div>
      )}

      {/* Dropzone */}
      {!readOnly && (
        <label
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDropFiles}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: documents.length === 0 ? '40px 20px' : '20px',
            border: `2px dashed ${dragging ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: 12,
            background: dragging ? 'var(--primary-soft)' : 'var(--card)',
            color: dragging ? 'var(--accent-foreground)' : 'var(--muted)',
            cursor: uploading ? 'wait' : 'pointer',
            opacity: uploading ? 0.6 : 1,
            fontFamily: 'inherit',
            textAlign: 'center',
            transition: 'all 0.15s',
          }}
        >
          {uploading ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--foreground)' }}>
            {uploading
              ? 'Téléchargement…'
              : dragging
                ? 'Lâchez vos PDFs ici'
                : documents.length === 0
                  ? 'Glissez des PDFs ici ou cliquez pour parcourir'
                  : 'Ajouter d\'autres PDFs'}
          </span>
          {!uploading && (
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
              Plusieurs fichiers · max 50 MB par PDF
            </span>
          )}
          <input
            type="file"
            accept="application/pdf"
            multiple
            style={{ display: 'none' }}
            disabled={uploading}
            onChange={e => {
              if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
      )}
    </div>
  )
}

function IconBtn({
  children, onClick, disabled, title, danger,
}: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title: string; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 26, height: 26,
        border: '1px solid var(--border)',
        borderRadius: 6,
        background: 'var(--card)',
        color: danger ? 'var(--destructive)' : 'var(--muted)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.3 : 1,
        display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      {children}
    </button>
  )
}
