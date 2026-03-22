'use client'

import { useState, useRef } from 'react'
import { Paperclip, Upload, Trash2, Download, Loader2, FileText, Award, GraduationCap, Heart, BookOpen, Car, File, Eye, Pencil, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { CandidatDocument, DocumentType } from '@/types/database'

interface DocumentsSectionProps {
  candidatId: string
  documents: CandidatDocument[]
  onUpdate: (documents: CandidatDocument[]) => void
}

const DOC_TYPES: { value: DocumentType; label: string; color: string; bg: string; border: string; icon: typeof FileText }[] = [
  { value: 'certificat',        label: 'Certificat',            color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE', icon: Award },
  { value: 'diplome',           label: 'Diplome',               color: '#059669', bg: '#F0FDF4', border: '#BBF7D0', icon: GraduationCap },
  { value: 'lettre_motivation', label: 'Lettre de motivation',  color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', icon: Heart },
  { value: 'formation',         label: 'Formation',             color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', icon: BookOpen },
  { value: 'permis',            label: 'Permis',                color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', icon: Car },
  { value: 'autre',             label: 'Autre',                 color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB', icon: File },
]

const getDocType = (type: DocumentType) => DOC_TYPES.find(t => t.value === type) || DOC_TYPES[5]

const ACCEPTED_FORMATS = '.pdf,.docx,.doc,.jpg,.jpeg,.png,.txt'

export default function DocumentsSection({ candidatId, documents, onUpdate }: DocumentsSectionProps) {
  const [uploading, setUploading] = useState(false)
  const [deletingIdx, setDeletingIdx] = useState<number | null>(null)
  const [selectedType, setSelectedType] = useState<DocumentType>('autre')
  const [showTypeSelect, setShowTypeSelect] = useState(false)
  const [pendingFile, setPendingFile] = useState<{ file: globalThis.File; name: string } | null>(null)
  const [editingNameIdx, setEditingNameIdx] = useState<number | null>(null)
  const [editNameValue, setEditNameValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const nameWithoutExt = file.name.replace(/\.[^.]+$/, '')
    setPendingFile({ file, name: nameWithoutExt })
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleConfirmUpload = async () => {
    if (!pendingFile) return
    const file = pendingFile.file
    const ext = file.name.split('.').pop() || 'pdf'
    const finalName = `${pendingFile.name}.${ext}`

    setUploading(true)
    try {
      const supabase = createClient()
      const timestamp = Date.now()
      const safeName = finalName.replace(/[^a-zA-Z0-9._-]/g, '_')
      const storagePath = `documents/${candidatId}_${timestamp}_${safeName}`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('cvs')
        .upload(storagePath, file, { contentType: file.type, upsert: true })

      if (uploadError) throw uploadError

      const { data: urlData } = await supabase.storage
        .from('cvs')
        .createSignedUrl(uploadData.path, 60 * 60 * 24 * 365 * 10)

      if (!urlData?.signedUrl) throw new Error('Impossible de generer l\'URL du document')

      const newDoc: CandidatDocument = {
        name: finalName,
        url: urlData.signedUrl,
        type: selectedType,
        uploaded_at: new Date().toISOString(),
      }

      const updated = [...documents, newDoc]
      onUpdate(updated)
      toast.success('Document ajouté')
      setShowTypeSelect(false)
      setSelectedType('autre')
      setPendingFile(null)
    } catch (err: any) {
      console.error('Document upload error:', err)
      toast.error('Erreur upload : ' + (err.message || 'Erreur inconnue'))
    } finally {
      setUploading(false)
    }
  }

  const handleViewDoc = (doc: CandidatDocument) => {
    const ext = doc.name.split('.').pop()?.toLowerCase() || ''
    if (['pdf'].includes(ext)) {
      window.open(doc.url, '_blank')
    } else if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      window.open(doc.url, '_blank')
    } else if (['doc', 'docx'].includes(ext)) {
      window.open(`https://docs.google.com/viewer?url=${encodeURIComponent(doc.url)}&embedded=false`, '_blank')
    } else {
      window.open(doc.url, '_blank')
    }
  }

  const handleRenameDoc = (idx: number, newName: string) => {
    if (!newName.trim()) return
    const doc = documents[idx]
    const ext = doc.name.split('.').pop() || ''
    const finalName = newName.includes('.') ? newName : `${newName}.${ext}`
    const updated = documents.map((d, i) => i === idx ? { ...d, name: finalName } : d)
    onUpdate(updated)
    setEditingNameIdx(null)
    toast.success('Document renommé')
  }

  const handleDelete = async (idx: number) => {
    const doc = documents[idx]
    if (!doc) return

    setDeletingIdx(idx)
    try {
      // Try to delete from storage
      const supabase = createClient()
      try {
        const pathMatch = doc.url.split('/cvs/')[1]?.split('?')[0]
        if (pathMatch) {
          await supabase.storage.from('cvs').remove([decodeURIComponent(pathMatch)])
        }
      } catch {} // Ignore storage deletion errors

      const updated = documents.filter((_, i) => i !== idx)
      onUpdate(updated)
      toast.success('Document supprime')
    } catch (err: any) {
      toast.error('Erreur suppression : ' + (err.message || 'Erreur inconnue'))
    } finally {
      setDeletingIdx(null)
    }
  }

  const handleDownload = async (doc: CandidatDocument) => {
    try {
      const res = await fetch(doc.url)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = doc.name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      window.open(doc.url, '_blank')
    }
  }

  return (
    <div className="neo-card-soft" style={{ padding: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: documents.length > 0 ? 10 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Paperclip size={13} style={{ color: 'var(--muted)' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Documents
          </span>
          {documents.length > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: 'var(--muted)',
              background: 'var(--border)', borderRadius: 10, padding: '1px 6px',
            }}>
              {documents.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowTypeSelect(prev => !prev)}
          disabled={uploading}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--primary)', padding: 2, display: 'flex', alignItems: 'center',
            opacity: uploading ? 0.5 : 1,
          }}
          title="Ajouter un document"
        >
          <Upload size={13} />
        </button>
      </div>

      {/* Type selector + upload */}
      {showTypeSelect && (
        <div style={{
          background: 'var(--background)', border: '1px solid var(--border)',
          borderRadius: 8, padding: 10, marginBottom: 10,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)' }}>Type de document :</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {DOC_TYPES.map(t => (
              <button
                key={t.value}
                onClick={() => setSelectedType(t.value)}
                style={{
                  padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                  border: `1px solid ${selectedType === t.value ? t.color : t.border}`,
                  background: selectedType === t.value ? t.bg : 'white',
                  color: selectedType === t.value ? t.color : '#6B7280',
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.15s',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          {pendingFile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)' }}>Nom du fichier :</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  type="text"
                  value={pendingFile.name}
                  onChange={e => setPendingFile({ ...pendingFile, name: e.target.value })}
                  style={{
                    flex: 1, padding: '5px 8px', borderRadius: 6, fontSize: 11,
                    border: '1px solid var(--border)', fontFamily: 'inherit',
                    outline: 'none',
                  }}
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleConfirmUpload() }}
                />
                <span style={{ fontSize: 11, color: 'var(--muted)', alignSelf: 'center' }}>
                  .{pendingFile.file.name.split('.').pop()}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={handleConfirmUpload}
                  disabled={uploading || !pendingFile.name.trim()}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '6px 0', borderRadius: 6, fontSize: 11, fontWeight: 700,
                    border: 'none', background: 'var(--primary)', color: '#0F172A',
                    cursor: 'pointer', fontFamily: 'inherit',
                    opacity: uploading || !pendingFile.name.trim() ? 0.5 : 1,
                  }}
                >
                  {uploading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={12} />}
                  {uploading ? 'Upload...' : 'Uploader'}
                </button>
                <button
                  onClick={() => setPendingFile(null)}
                  disabled={uploading}
                  style={{
                    padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                    border: '1px solid var(--border)', background: 'white',
                    color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '6px 0', borderRadius: 6, fontSize: 11, fontWeight: 700,
                border: '1px solid var(--border)', background: 'white',
                color: 'var(--foreground)', cursor: 'pointer', fontFamily: 'inherit',
                opacity: uploading ? 0.5 : 1,
              }}
            >
              <Upload size={12} />
              Choisir un fichier
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_FORMATS}
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
        </div>
      )}

      {/* Document list */}
      {documents.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {documents.map((doc, i) => {
            const dt = getDocType(doc.type)
            const IconComp = dt.icon
            return (
              <div
                key={`${doc.name}-${doc.uploaded_at}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 8px', borderRadius: 7,
                  background: dt.bg, border: `1px solid ${dt.border}`,
                }}
              >
                <IconComp size={12} style={{ color: dt.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingNameIdx === i ? (
                    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                      <input
                        type="text"
                        value={editNameValue}
                        onChange={e => setEditNameValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleRenameDoc(i, editNameValue); if (e.key === 'Escape') setEditingNameIdx(null) }}
                        autoFocus
                        style={{
                          flex: 1, fontSize: 11, padding: '2px 5px', borderRadius: 4,
                          border: '1px solid var(--border)', fontFamily: 'inherit', outline: 'none',
                          minWidth: 0,
                        }}
                      />
                      <button onClick={() => handleRenameDoc(i, editNameValue)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 1 }}>
                        <Check size={11} style={{ color: '#059669' }} />
                      </button>
                      <button onClick={() => setEditingNameIdx(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 1 }}>
                        <X size={11} style={{ color: '#DC2626' }} />
                      </button>
                    </div>
                  ) : (
                    <p style={{
                      fontSize: 11, fontWeight: 600, color: 'var(--foreground)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      margin: 0, lineHeight: 1.3,
                    }}>
                      {doc.name}
                    </p>
                  )}
                  <p style={{ fontSize: 9, color: dt.color, margin: 0, fontWeight: 600 }}>
                    {dt.label}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  <button
                    onClick={() => handleViewDoc(doc)}
                    title="Visualiser"
                    style={{
                      width: 22, height: 22, borderRadius: 5,
                      border: 'none', background: 'rgba(255,255,255,0.7)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: 0,
                    }}
                  >
                    <Eye size={11} style={{ color: '#3B82F6' }} />
                  </button>
                  <button
                    onClick={() => { setEditingNameIdx(i); setEditNameValue(doc.name.replace(/\.[^.]+$/, '')) }}
                    title="Renommer"
                    style={{
                      width: 22, height: 22, borderRadius: 5,
                      border: 'none', background: 'rgba(255,255,255,0.7)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: 0,
                    }}
                  >
                    <Pencil size={11} style={{ color: '#6B7280' }} />
                  </button>
                  <button
                    onClick={() => handleDownload(doc)}
                    title="Télécharger"
                    style={{
                      width: 22, height: 22, borderRadius: 5,
                      border: 'none', background: 'rgba(255,255,255,0.7)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: 0,
                    }}
                  >
                    <Download size={11} style={{ color: '#6B7280' }} />
                  </button>
                  <button
                    onClick={() => handleDelete(i)}
                    disabled={deletingIdx === i}
                    title="Supprimer"
                    style={{
                      width: 22, height: 22, borderRadius: 5,
                      border: 'none', background: 'rgba(255,255,255,0.7)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: 0, opacity: deletingIdx === i ? 0.5 : 1,
                    }}
                  >
                    {deletingIdx === i ? (
                      <Loader2 size={11} style={{ color: '#DC2626', animation: 'spin 1s linear infinite' }} />
                    ) : (
                      <Trash2 size={11} style={{ color: '#DC2626' }} />
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Empty state */}
      {documents.length === 0 && !showTypeSelect && (
        <button
          onClick={() => setShowTypeSelect(true)}
          style={{
            width: '100%', padding: '12px 0', border: '1px dashed var(--border)',
            borderRadius: 8, background: 'none', cursor: 'pointer',
            fontSize: 11, color: 'var(--muted)', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            marginTop: 6,
          }}
        >
          <Upload size={12} />
          Ajouter un document
        </button>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
