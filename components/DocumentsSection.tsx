'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  FolderOpen, Eye, Printer, Download, Trash2, Pencil, Upload, X,
  ChevronDown, ChevronRight, FileText, Award, GraduationCap, Heart,
  BookOpen, Car, File, Check, Loader2, Star, FileSignature, Wallet,
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
  onCvChange?: (url: string, fileName: string, skipReparse?: boolean) => void
}

type CategoryKey = 'cv' | DocumentType

const DOC_CATEGORIES: { key: CategoryKey; label: string; color: string; bg: string; border: string; icon: typeof FileText }[] = [
  { key: 'cv',                label: 'CV',                    color: 'var(--foreground)', bg: '#F8FAFC', border: '#E2E8F0', icon: FileText },
  { key: 'certificat',        label: 'Certificats',           color: 'var(--info)', bg: '#EFF6FF', border: '#BFDBFE', icon: Award },
  { key: 'diplome',           label: 'Dipl\u00f4mes',        color: 'var(--success)', bg: '#F0FDF4', border: '#BBF7D0', icon: GraduationCap },
  { key: 'lettre_motivation', label: 'Lettres de motivation', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', icon: Heart },
  { key: 'formation',         label: 'Formations',            color: 'var(--warning)', bg: '#FFFBEB', border: '#FDE68A', icon: BookOpen },
  { key: 'permis',            label: 'Permis',                color: 'var(--destructive)', bg: '#FEF2F2', border: '#FECACA', icon: Car },
  { key: 'reference',         label: 'Références',            color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC', icon: Star },
  { key: 'contrat',           label: 'Contrats',              color: '#4338CA', bg: '#EEF2FF', border: '#C7D2FE', icon: FileSignature },
  { key: 'bulletin_salaire',  label: 'Bulletins de salaire',  color: 'var(--warning)', bg: '#FFFBEB', border: '#FDE68A', icon: Wallet },
  { key: 'autre',             label: 'Autre',                 color: 'var(--muted-foreground)', bg: '#F9FAFB', border: '#E5E7EB', icon: File },
]

const UPLOAD_TYPES: { value: DocumentType | 'cv'; label: string; color: string; bg: string; border: string }[] = [
  { value: 'cv' as any,         label: 'CV',                    color: 'var(--foreground)', bg: '#F8FAFC', border: '#E2E8F0' },
  { value: 'certificat',        label: 'Certificat',            color: 'var(--info)', bg: '#EFF6FF', border: '#BFDBFE' },
  { value: 'diplome',           label: 'Dipl\u00f4me',         color: 'var(--success)', bg: '#F0FDF4', border: '#BBF7D0' },
  { value: 'lettre_motivation', label: 'Lettre de motivation',  color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  { value: 'formation',         label: 'Formation',             color: 'var(--warning)', bg: '#FFFBEB', border: '#FDE68A' },
  { value: 'permis',            label: 'Permis',                color: 'var(--destructive)', bg: '#FEF2F2', border: '#FECACA' },
  { value: 'reference',         label: 'Référence',             color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC' },
  { value: 'contrat',           label: 'Contrat',               color: '#4338CA', bg: '#EEF2FF', border: '#C7D2FE' },
  { value: 'bulletin_salaire',  label: 'Bulletin de salaire',   color: 'var(--warning)', bg: '#FFFBEB', border: '#FDE68A' },
  { value: 'autre',             label: 'Autre',                 color: 'var(--muted-foreground)', bg: '#F9FAFB', border: '#E5E7EB' },
]

const ACCEPTED_FORMATS = '.pdf,.docx,.doc,.jpg,.jpeg,.png,.txt'

const getCat = (key: CategoryKey) => DOC_CATEGORIES.find(c => c.key === key) || DOC_CATEGORIES[6]

export default function DocumentsPanel({ open, onClose, candidatId, documents, cvUrl, cvFileName, onUpdate, onCvChange }: DocumentsPanelProps) {
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [changingTypeIdx, setChangingTypeIdx] = useState<number | null>(null)
  const [deletingIdx, setDeletingIdx] = useState<number | null>(null)
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null)
  const [confirmDeleteCv, setConfirmDeleteCv] = useState(false)
  const [selectedType, setSelectedType] = useState<DocumentType | 'cv'>('autre')
  const [showUpload, setShowUpload] = useState(false)
  const [pendingFile, setPendingFile] = useState<{ file: globalThis.File; name: string } | null>(null)
  const [editingNameIdx, setEditingNameIdx] = useState<number | null>(null)
  const [openMoveMenu, setOpenMoveMenu] = useState<{ key: string; rect: DOMRect } | null>(null)
  // Ferme le menu au scroll ou resize (sinon il reste flottant au mauvais endroit)
  useEffect(() => {
    if (!openMoveMenu) return
    const close = () => setOpenMoveMenu(null)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [openMoveMenu])
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
    reference: [],
    contrat: [],
    bulletin_salaire: [],
    autre: [],
  }

  // Add CV as virtual doc in the "cv" category
  if (cvUrl) {
    const name = cvFileName || 'CV'
    grouped.cv.push({ name, url: cvUrl, type: 'autre' as DocumentType, uploaded_at: '' })
  }

  // Group real documents by type
  documents.forEach(doc => {
    const key = ((doc.type as string) === 'cv' ? 'cv' : doc.type) as CategoryKey
    if (grouped[key]) {
      grouped[key].push(doc)
    } else {
      grouped.autre.push(doc)
    }
  })

  const totalCount = documents.length + (cvUrl ? 1 : 0)

  // Find the real index of a document in the flat documents array
  const getRealIndex = (cat: CategoryKey, localIdx: number): number => {
    const doc = grouped[cat]?.[localIdx]
    if (!doc) return -1
    const idx = documents.indexOf(doc)
    return idx // -1 if not found (CV principal virtuel)
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

  const handleChangeType = (realIdx: number, newType: string) => {
    if (realIdx < 0) return
    const updated = documents.map((d, i) => i === realIdx ? { ...d, type: newType as any } : d)
    onUpdate(updated)
    setChangingTypeIdx(null)
    toast.success('Catégorie modifiée')
  }

  const handleSetAsCv = async (realIdx: number) => {
    if (realIdx < 0) return
    const doc = documents[realIdx]
    if (!doc || !onCvChange) return
    // Bug 6 fix — opération atomique : onCvChange gère tout (archive ancien + retire promu)
    // Ne PAS appeler onUpdate séparément (race condition → doublons + écrasement)
    try {
      await onCvChange(doc.url, doc.name, true)
      toast.success('Défini comme CV principal')
    } catch (err) {
      console.error('[DocumentsSection] handleSetAsCv error:', err)
      toast.error('Erreur lors du changement de CV principal')
    }
  }

  const handleDeleteCv = async () => {
    if (!onCvChange) return
    // Supprimer le fichier du Storage
    if (cvUrl) {
      try {
        const supabase = createClient()
        const pathMatch = cvUrl.split('/cvs/')[1]?.split('?')[0]
        if (pathMatch) await supabase.storage.from('cvs').remove([decodeURIComponent(pathMatch)])
      } catch {} // Ignorer les erreurs Storage
    }
    onCvChange('', '')
    setConfirmDeleteCv(false)
    toast.success('CV supprimé')
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
  const actionBtn = (onClick: (e?: React.MouseEvent<HTMLButtonElement>) => void, icon: React.ReactNode, title: string, color: string, disabled?: boolean) => (
    <button
      onClick={e => onClick(e)}
      disabled={disabled}
      title={title}
      style={{
        width: 28, height: 28, borderRadius: 6,
        border: '1px solid var(--border)', background: 'var(--card)',
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 0, opacity: disabled ? 0.4 : 1,
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.background = 'var(--secondary)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--card)' }}
    >
      {icon}
    </button>
  )

  const modal = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 8000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.15s ease',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }}
        onDragLeave={e => { if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false) }}
        onDrop={e => {
          e.preventDefault(); e.stopPropagation(); setDragOver(false)
          const file = e.dataTransfer.files?.[0]
          if (file) {
            const nameWithoutExt = file.name.replace(/\.[^.]+$/, '')
            setPendingFile({ file, name: nameWithoutExt })
            setShowUpload(true)
          }
        }}
        className="documents-panel"
        style={{
          width: 'min(700px, 95vw)',
          maxHeight: '88vh',
          background: 'var(--card)',
          borderRadius: 16,
          boxShadow: '0 24px 64px rgba(0,0,0,0.25), 0 4px 16px rgba(0,0,0,0.12)',
          display: 'flex', flexDirection: 'column',
          animation: 'scaleIn 0.2s ease',
          border: '1px solid var(--border)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--card)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(245,166,35,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <FolderOpen size={18} color="var(--primary)" />
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, lineHeight: 1.2 }}>
                Documents
              </h3>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.2 }}>
                {totalCount === 0 ? 'Aucun document' : `${totalCount} document${totalCount > 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--secondary)', border: '1px solid var(--border)', cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--border)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--secondary)' }}
          >
            <X size={16} color="var(--muted)" />
          </button>
        </div>

        {/* Upload button / drop zone */}
        <div
          style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}
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
                      background: selectedType === t.value ? t.bg : 'var(--card)',
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
                        outline: 'none', background: 'var(--surface)',
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
                      className="neo-btn-yellow neo-btn-sm"
                      style={{
                        flex: 1, justifyContent: 'center',
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
                        border: '1px solid var(--border)', background: 'var(--card)',
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
                    border: '1.5px solid var(--border)', background: 'var(--card)',
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
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0', minHeight: 0 }}>
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
                    padding: '8px 24px',
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
                  <div style={{ padding: '2px 24px 8px 24px' }}>
                    {docs.map((doc, localIdx) => {
                      // CV principal (virtuel, pas dans documents[]) → realIdx = -1
                      // Anciens CVs (dans documents[] avec type 'cv') → vrai index
                      const isCvPrincipalItem = isCvCategory && localIdx === 0 && cvUrl && doc.url === cvUrl
                      const realIdx = isCvPrincipalItem ? -1 : getRealIndex(cat.key, localIdx)
                      const isRealDoc = realIdx >= 0 // Document réel dans documents[] (pas CV principal virtuel)
                      const isEditingThis = isRealDoc && editingNameIdx === realIdx
                      const isDeleting = isRealDoc && deletingIdx === realIdx
                      const isConfirmingDelete = isRealDoc && confirmDeleteIdx === realIdx

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
                                    minWidth: 0, background: 'var(--surface)',
                                  }}
                                />
                                <button onClick={() => handleRenameDoc(realIdx, editNameValue)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                                  <Check size={13} style={{ color: 'var(--success)' }} />
                                </button>
                                <button onClick={() => setEditingNameIdx(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                                  <X size={13} style={{ color: 'var(--destructive)' }} />
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
                            {isRealDoc && changingTypeIdx === realIdx ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
                                {UPLOAD_TYPES.map(t => (
                                  <button key={t.value} onClick={() => handleChangeType(realIdx, t.value)}
                                    style={{
                                      padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600,
                                      border: `1px solid ${t.border}`, background: t.bg, color: t.color,
                                      cursor: 'pointer', fontFamily: 'inherit',
                                    }}>{t.label}</button>
                                ))}
                                <button onClick={() => setChangingTypeIdx(null)}
                                  style={{ padding: '1px 4px', borderRadius: 4, fontSize: 9, border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
                              </div>
                            ) : isRealDoc ? (
                              <button onClick={() => setChangingTypeIdx(realIdx)}
                                style={{
                                  fontSize: 10, fontWeight: 600, color: cat.color,
                                  display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 1,
                                  background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit',
                                }}>
                                {getCat(doc.type as CategoryKey).label}
                                <ChevronDown size={8} />
                              </button>
                            ) : isCvCategory && localIdx === 0 && cvUrl ? (
                              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', display: 'inline-block', marginTop: 1 }}>
                                CV principal
                              </span>
                            ) : (
                              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', display: 'inline-block', marginTop: 1 }}>
                                Ancien CV
                              </span>
                            )}
                          </div>

                          {/* Actions — mêmes pour tous les documents */}
                          <div style={{ display: 'flex', gap: 3, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            {actionBtn(
                              () => handleViewDoc(doc),
                              <Eye size={12} style={{ color: 'var(--info)' }} />,
                              'Visualiser',
                              '#3B82F6',
                            )}
                            {actionBtn(
                              () => handlePrintDoc(doc),
                              <Printer size={12} style={{ color: 'var(--muted)' }} />,
                              'Imprimer',
                              '#6B7280',
                            )}
                            {actionBtn(
                              () => handleDownload(doc),
                              <Download size={12} style={{ color: 'var(--muted)' }} />,
                              'Télécharger',
                              '#6B7280',
                            )}
                            {/* Changer catégorie — dropdown portal (échappe overflow modal) */}
                            {(() => {
                              const isCvPrincipal = isCvCategory && localIdx === 0 && cvUrl
                              const menuKey = isCvPrincipal ? `cv_${localIdx}` : `doc_${realIdx}`
                              return (
                                <>
                                  {actionBtn(
                                    (e?: React.MouseEvent<HTMLButtonElement>) => {
                                      if (openMoveMenu?.key === menuKey) { setOpenMoveMenu(null); return }
                                      const rect = (e?.currentTarget as HTMLElement).getBoundingClientRect()
                                      setOpenMoveMenu({ key: menuKey, rect })
                                    },
                                    <ChevronDown size={12} style={{ color: 'var(--warning)' }} />,
                                    'Déplacer vers...',
                                    '#D97706',
                                  )}
                                  {openMoveMenu?.key === menuKey && typeof window !== 'undefined' && createPortal(
                                    <>
                                      {/* Backdrop invisible pour fermer au clic extérieur */}
                                      <div
                                        onClick={() => setOpenMoveMenu(null)}
                                        style={{ position: 'fixed', inset: 0, zIndex: 10000 }}
                                      />
                                      <div
                                        onClick={e => e.stopPropagation()}
                                        style={{
                                          position: 'fixed',
                                          top: openMoveMenu.rect.bottom + 4,
                                          left: Math.min(openMoveMenu.rect.right - 180, window.innerWidth - 190),
                                          zIndex: 10001,
                                          background: 'var(--card)', border: '1px solid var(--border)',
                                          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                                          padding: '4px 0', minWidth: 180,
                                        }}
                                      >
                                        {!isCvPrincipal && onCvChange && (
                                          <button onClick={() => { handleSetAsCv(realIdx); setOpenMoveMenu(null) }}
                                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', color: 'var(--warning)', fontWeight: 600 }}
                                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--warning-soft)')}
                                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                                          >→ CV principal</button>
                                        )}
                                        {UPLOAD_TYPES.map(t => (
                                          <button key={t.value}
                                            onClick={() => {
                                              if (isCvPrincipal && onCvChange) {
                                                const movedDoc = { name: cvFileName || 'CV', url: cvUrl, type: t.value as any, uploaded_at: new Date().toISOString() }
                                                onUpdate([...documents, movedDoc])
                                                onCvChange('', '')
                                                toast.success('Document déplacé')
                                              } else {
                                                handleChangeType(realIdx, t.value)
                                              }
                                              setOpenMoveMenu(null)
                                            }}
                                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', color: 'var(--foreground)' }}
                                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--secondary)')}
                                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                                          >→ {t.label}</button>
                                        ))}
                                      </div>
                                    </>,
                                    document.body
                                  )}
                                </>
                              )
                            })()}
                            {/* Renommer */}
                            {isRealDoc && (
                              actionBtn(
                                () => { setEditingNameIdx(realIdx); setEditNameValue(doc.name.replace(/\.[^.]+$/, '')) },
                                <Pencil size={12} style={{ color: 'var(--muted)' }} />,
                                'Renommer',
                                '#6B7280',
                              )
                            )}
                            {/* Supprimer */}
                            {isCvCategory && localIdx === 0 && cvUrl && onCvChange ? (
                              confirmDeleteCv ? (
                                <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                                  <button
                                    onClick={handleDeleteCv}
                                    style={{ padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700, border: 'none', background: '#DC2626', color: 'white', cursor: 'pointer', fontFamily: 'inherit' }}
                                  >Oui</button>
                                  <button
                                    onClick={() => setConfirmDeleteCv(false)}
                                    style={{ padding: '3px 6px', borderRadius: 5, fontSize: 10, fontWeight: 700, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit' }}
                                  >Non</button>
                                </div>
                              ) : (
                                actionBtn(
                                  () => setConfirmDeleteCv(true),
                                  <Trash2 size={12} style={{ color: 'var(--destructive)' }} />,
                                  'Supprimer le CV',
                                  '#DC2626',
                                )
                              )
                            ) : isRealDoc && (
                              <>
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
                                        border: '1px solid var(--border)', background: 'var(--card)',
                                        color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit',
                                      }}
                                    >
                                      Non
                                    </button>
                                  </div>
                                ) : (
                                  actionBtn(
                                    () => setConfirmDeleteIdx(realIdx),
                                    <Trash2 size={12} style={{ color: 'var(--destructive)' }} />,
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
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.95) } to { opacity: 1; transform: scale(1) } }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
      `}</style>
    </div>
  )

  if (typeof window === 'undefined') return null
  return createPortal(modal, document.body)
}
