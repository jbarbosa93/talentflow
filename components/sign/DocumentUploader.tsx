// TalentFlow Sign — Zone drag&drop + liste documents (réutilisable)
// v2.2.1
'use client'

import { useState, useCallback } from 'react'
import { Upload, FileText, Trash2, Loader2, GripVertical, ChevronUp, ChevronDown, Lock } from 'lucide-react'
import { toast } from 'sonner'
import type { SignDocument } from '@/lib/sign/types'

interface Props {
  documents: SignDocument[]
  onChange: (docs: SignDocument[]) => void
  /** Si true, lecture seule (template sélectionné par exemple) */
  readOnly?: boolean
}

export default function DocumentUploader({ documents, onChange, readOnly }: Props) {
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)

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
    const r = await fetch('/api/sign/upload', { method: 'POST', body: fd })
    const data = await r.json()
    if (!r.ok) throw new Error(data.error || 'Erreur upload')
    onChange([
      ...documents,
      {
        name: file.name,
        storage_path: data.path,
        order: documents.length,
      },
    ])
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
