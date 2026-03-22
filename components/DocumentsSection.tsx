'use client'

import { useState, useRef } from 'react'
import {
  FolderOpen, Eye, Printer, Download, Trash2, Pencil, Upload, X,
  ChevronDown, ChevronRight, FileText, Award, GraduationCap, Heart,
  BookOpen, Car, File, Check, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { CandidatDocument, DocumentType } from '@/types/database'

interface DocumentsPanelProps {
  open: boolean
  onClose: () => void
  candidatId: string
  documents: CandidatDocument[]
  cvUrl: string | null
  cvFileName: string | null
  onUpdate: (documents: CandidatDocument[]) => void
  onCvChange?: (url: string, fileName: string) => void
}

type CategoryKey = 'cv' | DocumentType

const DOC_CATEGORIES: { key: CategoryKey; label: string; color: string; bg: string; border: string; icon: typeof FileText }[] = [
  { key: 'cv',                label: 'CV',                    color: '#0F172A', bg: '#F8FAFC', border: '#E2E8F0', icon: FileText },
  { key: 'certificat',        label: 'Certificats',           color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE', icon: Award },
  { key: 'diplome',           label: 'Dipl\u00f4mes',        color: '#059669', bg: '#F0FDF4', border: '#BBF7D0', icon: GraduationCap },
  { key: 'lettre_motivation', label: 'Lettres de motivation', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', icon: Heart },
  { key: 'formation',         label: 'Formations',            color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', icon: BookOpen },
  { key: 'permis',            label: 'Permis',                color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', icon: Car },
  { key: 'autre',             label: 'Autre',                 color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB', icon: File },
]

const UPLOAD_TYPES: { value: DocumentType | 'cv'; label: string; color: string; bg: string; border: string }[] = [
  { value: 'cv' as any,         label: 'CV',                    color: '#0F172A', bg: '#F8FAFC', border: '#E2E8F0' },
  { value: 'certificat',        label: 'Certificat',            color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
  { value: 'diplome',           label: 'Dipl\u00f4me',         color: '#059669', bg: '#F0FDF4', border: '#BBF7D0' },
  { value: 'lettre_motivation', label: 'Lettre de motivation',  color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  { value: 'formation',         label: 'Formation',             color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  { value: 'permis',            label: 'Permis',                color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  { value: 'autre',             label: 'Autre',                 color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' },
]

const ACCEPTED_FORMATS = '.pdf,.docx,.doc,.jpg,.jpeg,.png,.txt'

const getCat = (key: CategoryKey) => DOC_CATEGORIES.find(c => c.key === key) || DOC_CATEGORIES[6]

export default function DocumentsPanel({ open, onClose, candidatId, documents, cvUrl, cvFileName, onUpdate, onCvChange }: DocumentsPanelProps) {
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deletingIdx, setDeletingIdx] = useState<number | null>(null)
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null)
  const [selectedType, setSelectedType] = useState<DocumentType | 'cv'>('autre')
  const [showUpload, setShowUpload] = useState(false)
  const [pendingFile, setPendingFile] = useState<{ file: globalThis.File; name: string } | null>(null)
  const [editingNameIdx, setEditingNameIdx] = useState<number | null>(null)
  const [editNameValue, setEditNameValue] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const inputRef = useRef<HTMLInputElement>(null)

  if (!open) return null

  // Build grouped documents
  const grouped: Record<CategoryKey, CandidatDocument[]> = {
    cv: [],
    certificat: [],
    diplome: [],
    lettre_motivation: [],
    formation: [],
    permis: [],
    autre: [],
  }

  // Add CV as virtual doc in the "cv" category
  if (cvUrl) {
    const name = cvFileName || 'CV'
    grouped.cv.push({ name, url: cvUrl, type: 'autre' as DocumentType, uploaded_at: '' })
  }

  // Group real documents by type
  documents.forEach(doc => {
    const key = doc.type as CategoryKey
    if (grouped[key]) {
      grouped[key].push(doc)
    } else {
      grouped.autre.push(doc)
    }
  })

  const totalCount = documents.length + (cvUrl ? 1 : 0)

  // Find the real index of a document in the flat documents array
  const getRealIndex = (cat: CategoryKey, localIdx: number): number => {
    if (cat === 'cv') return -1 // CV is virtual, not in documents array
    const doc = grouped[cat][localIdx]
    return documents.indexOf(doc)
  }

  const toggleCollapse = (key: string) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // ── Handlers ──

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

      if (!urlData?.signedUrl) throw new Error('Impossible de g\u00e9n\u00e9rer l\'URL du document')

      if ((selectedType as string) === 'cv') {
        if (onCvChange) {
          onCvChange(urlData.signedUrl, finalName)
          toast.success('CV mis \u00e0 jour')
        }
      } else {
        const newDoc: CandidatDocument = {
          name: finalName,
          url: urlData.signedUrl,
          type: selectedType as DocumentType,
          uploaded_at: new Date().toISOString(),
        }
        const updated = [...documents, newDoc]
        onUpdate(updated)
        toast.success('Document ajout\u00e9')
      }
      setShowUpload(false)
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

  const handlePrintDoc = (doc: CandidatDocument) => {
    const ext = doc.name.split('.').pop()?.toLowerCase() || ''
    if (['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      window.open(`/api/cv/print?url=${encodeURIComponent(doc.url)}`, '_blank')
    } else if (['doc', 'docx'].includes(ext)) {
      window.open(`https://docs.google.com/viewer?url=${encodeURIComponent(doc.url)}`, '_blank')
    } else {
      window.open(doc.url, '_blank')
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

  const handleRenameDoc = (realIdx: number, newName: string) => {
    if (!newName.trim() || realIdx < 0) return
    const doc = documents[realIdx]
    const ext = doc.name.split('.').pop() || ''
    const finalName = newName.includes('.') ? newName : `${newName}.${ext}`
    const updated = documents.map((d, i) => i === realIdx ? { ...d, name: finalName } : d)
    onUpdate(updated)
    setEditingNameIdx(null)
    toast.success('Document renomm\u00e9')
  }

  const handleDelete = async (realIdx: number) => {
    const doc = documents[realIdx]
    if (!doc) return

    setDeletingIdx(realIdx)
    try {
      const supabase = createClient()
      try {
        const pathMatch = doc.url.split('/cvs/')[1]?.split('?')[0]
        if (pathMatch) {
          await supabase.storage.from('cvs').remove([decodeURIComponent(pathMatch)])
        }
      } catch {} // Ignore storage deletion errors

      const updated = documents.filter((_, i) => i !== realIdx)
      onUpdate(updated)
      toast.success('Document supprim\u00e9')
      setConfirmDeleteIdx(null)
    } catch (err: any) {
      toast.error('Erreur suppression : ' + (err.message || 'Erreur inconnue'))
    } finally {
      setDeletingIdx(null)
    }
  }

  // ── Action button helper ──
  const actionBtn = (onClick: () => void, icon: React.ReactNode, title: string, color: string, disabled?: boolean) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 28, height: 28, borderRadius: 6,
        border: '1px solid var(--border)', background: 'white',
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 0, opacity: disabled ? 0.4 : 1,
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.background = '#F8FAFC' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'white' }}
    >
      {icon}
    </button>
  )

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 8000,
        background: 'rgba(0,0,0,0.3)',
        animation: 'fadeIn 0.15s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute', top: 0, right: 0,
          width: 480, height: '100%',
          background: 'var(--card)',
          boxShadow: '-8px 0 30px rgba(0,0,0,0.15)',
          display: 'flex', flexDirection: 'column',
          animation: 'slideInRight 0.2s ease',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FolderOpen size={16} color="var(--primary)" />
            Documents
            {totalCount > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 700, color: 'var(--muted)',
                background: 'var(--border)', borderRadius: 10, padding: '2px 8px',
              }}>
                {totalCount}
              </span>
            )}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X size={18} color="var(--muted)" />
          </button>
        </div>

        {/* Upload button / drop zone */}
        <div
          style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault(); setDragOver(false)
            const file = e.dataTransfer.files?.[0]
            if (file) {
              const nameWithoutExt = file.name.replace(/\.[^.]+$/, '')
              setPendingFile({ file, name: nameWithoutExt })
              setShowUpload(true)
            }
          }}
        >
          {!showUpload ? (
            <button
              onClick={() => setShowUpload(true)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: dragOver ? '20px 0' : '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 700,
                border: `1.5px dashed ${dragOver ? 'var(--primary)' : 'var(--border)'}`,
                background: dragOver ? 'rgba(234,179,8,0.08)' : 'var(--secondary)',
                color: dragOver ? 'var(--primary)' : 'var(--foreground)',
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'; (e.currentTarget as HTMLElement).style.color = 'var(--primary)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--foreground)' }}
            >
              <Upload size={14} />
              {dragOver ? 'Déposer le fichier ici' : 'Ajouter un document'}
            </button>
          ) : (
            <div style={{
              background: 'var(--secondary)', border: '1px solid var(--border)',
              borderRadius: 10, padding: 14,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Type de document
                </span>
                <button onClick={() => { setShowUpload(false); setPendingFile(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                  <X size={14} color="var(--muted)" />
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {UPLOAD_TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setSelectedType(t.value)}
                    style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      border: `1.5px solid ${selectedType === t.value ? t.color : t.border}`,
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Nom du fichier
                  </span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="text"
                      value={pendingFile.name}
                      onChange={e => setPendingFile({ ...pendingFile, name: e.target.value })}
                      style={{
                        flex: 1, padding: '7px 10px', borderRadius: 7, fontSize: 12,
                        border: '1.5px solid var(--border)', fontFamily: 'inherit',
                        outline: 'none', background: 'white',
                      }}
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') handleConfirmUpload() }}
                    />
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      .{pendingFile.file.name.split('.').pop()}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={handleConfirmUpload}
                      disabled={uploading || !pendingFile.name.trim()}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        padding: '8px 0', borderRadius: 7, fontSize: 12, fontWeight: 700,
                        border: 'none', background: 'var(--primary)', color: '#0F172A',
                        cursor: 'pointer', fontFamily: 'inherit',
                        opacity: uploading || !pendingFile.name.trim() ? 0.5 : 1,
                      }}
                    >
                      {uploading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={13} />}
                      {uploading ? 'Upload...' : 'Uploader'}
                    </button>
                    <button
                      onClick={() => setPendingFile(null)}
                      disabled={uploading}
                      style={{
                        padding: '8px 14px', borderRadius: 7, fontSize: 12, fontWeight: 700,
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
                    padding: '8px 0', borderRadius: 7, fontSize: 12, fontWeight: 700,
                    border: '1.5px solid var(--border)', background: 'white',
                    color: 'var(--foreground)', cursor: 'pointer', fontFamily: 'inherit',
                    opacity: uploading ? 0.5 : 1,
                  }}
                >
                  <Upload size={13} />
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
        </div>

        {/* Document categories */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {DOC_CATEGORIES.map(cat => {
            const docs = grouped[cat.key]
            if (docs.length === 0) return null

            const isCollapsed = collapsed[cat.key] ?? false
            const IconComp = cat.icon
            const isCvCategory = cat.key === 'cv'

            return (
              <div key={cat.key} style={{ marginBottom: 2 }}>
                {/* Category header */}
                <button
                  onClick={() => toggleCollapse(cat.key)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 20px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontFamily: 'inherit', textAlign: 'left',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--secondary)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
                >
                  {isCollapsed
                    ? <ChevronRight size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    : <ChevronDown size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                  }
                  <IconComp size={14} style={{ color: cat.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', flex: 1 }}>
                    {cat.label}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: cat.color,
                    background: cat.bg, border: `1px solid ${cat.border}`,
                    borderRadius: 10, padding: '1px 7px',
                  }}>
                    {docs.length}
                  </span>
                </button>

                {/* Category files */}
                {!isCollapsed && (
                  <div style={{ padding: '2px 20px 6px 20px' }}>
                    {docs.map((doc, localIdx) => {
                      const realIdx = isCvCategory ? -1 : getRealIndex(cat.key, localIdx)
                      const isEditingThis = !isCvCategory && editingNameIdx === realIdx
                      const isDeleting = !isCvCategory && deletingIdx === realIdx
                      const isConfirmingDelete = !isCvCategory && confirmDeleteIdx === realIdx

                      return (
                        <div
                          key={`${doc.name}-${doc.uploaded_at}-${localIdx}`}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 10px', borderRadius: 8,
                            background: cat.bg, border: `1px solid ${cat.border}`,
                            marginBottom: 4,
                            transition: 'box-shadow 0.15s',
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
                        >
                          <IconComp size={14} style={{ color: cat.color, flexShrink: 0 }} />

                          <div style={{ flex: 1, minWidth: 0 }}>
                            {isEditingThis ? (
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                <input
                                  type="text"
                                  value={editNameValue}
                                  onChange={e => setEditNameValue(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleRenameDoc(realIdx, editNameValue)
                                    if (e.key === 'Escape') setEditingNameIdx(null)
                                  }}
                                  autoFocus
                                  style={{
                                    flex: 1, fontSize: 12, padding: '3px 6px', borderRadius: 5,
                                    border: '1px solid var(--border)', fontFamily: 'inherit', outline: 'none',
                                    minWidth: 0, background: 'white',
                                  }}
                                />
                                <button onClick={() => handleRenameDoc(realIdx, editNameValue)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                                  <Check size={13} style={{ color: '#059669' }} />
                                </button>
                                <button onClick={() => setEditingNameIdx(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                                  <X size={13} style={{ color: '#DC2626' }} />
                                </button>
                              </div>
                            ) : (
                              <p style={{
                                fontSize: 12, fontWeight: 600, color: 'var(--foreground)',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                margin: 0, lineHeight: 1.4,
                              }}>
                                {doc.name}
                              </p>
                            )}
                            {!isCvCategory && (
                              <span style={{
                                fontSize: 10, fontWeight: 600, color: cat.color,
                                display: 'inline-block', marginTop: 1,
                              }}>
                                {getCat(doc.type as CategoryKey).label}
                              </span>
                            )}
                            {isCvCategory && (
                              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', display: 'inline-block', marginTop: 1 }}>
                                CV principal
                              </span>
                            )}
                          </div>

                          {/* Actions */}
                          <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                            {actionBtn(
                              () => handleViewDoc(doc),
                              <Eye size={12} style={{ color: '#3B82F6' }} />,
                              'Visualiser',
                              '#3B82F6',
                            )}
                            {actionBtn(
                              () => handlePrintDoc(doc),
                              <Printer size={12} style={{ color: '#6B7280' }} />,
                              'Imprimer',
                              '#6B7280',
                            )}
                            {actionBtn(
                              () => handleDownload(doc),
                              <Download size={12} style={{ color: '#6B7280' }} />,
                              'T\u00e9l\u00e9charger',
                              '#6B7280',
                            )}
                            {!isCvCategory && (
                              <>
                                {actionBtn(
                                  () => { setEditingNameIdx(realIdx); setEditNameValue(doc.name.replace(/\.[^.]+$/, '')) },
                                  <Pencil size={12} style={{ color: '#6B7280' }} />,
                                  'Renommer',
                                  '#6B7280',
                                )}
                                {isConfirmingDelete ? (
                                  <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                                    <button
                                      onClick={() => handleDelete(realIdx)}
                                      disabled={isDeleting}
                                      style={{
                                        padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700,
                                        border: 'none', background: '#DC2626', color: 'white',
                                        cursor: 'pointer', fontFamily: 'inherit',
                                        opacity: isDeleting ? 0.5 : 1,
                                      }}
                                    >
                                      {isDeleting ? <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} /> : 'Oui'}
                                    </button>
                                    <button
                                      onClick={() => setConfirmDeleteIdx(null)}
                                      style={{
                                        padding: '3px 6px', borderRadius: 5, fontSize: 10, fontWeight: 700,
                                        border: '1px solid var(--border)', background: 'white',
                                        color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit',
                                      }}
                                    >
                                      Non
                                    </button>
                                  </div>
                                ) : (
                                  actionBtn(
                                    () => setConfirmDeleteIdx(realIdx),
                                    <Trash2 size={12} style={{ color: '#DC2626' }} />,
                                    'Supprimer',
                                    '#DC2626',
                                  )
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {/* Empty state */}
          {totalCount === 0 && !showUpload && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
              <FolderOpen size={32} style={{ color: 'var(--border)', marginBottom: 12 }} />
              <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 4px' }}>Aucun document</p>
              <p style={{ fontSize: 12, margin: 0 }}>Cliquez sur le bouton ci-dessus pour ajouter un document</p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
