'use client'

import { useState, useCallback, useRef } from 'react'
import {
  Upload, CheckCircle, AlertCircle, Loader2, X,
  Clock, RefreshCw, Plus,
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UploadCVProps {
  offreId?: string
  onSuccess?: (candidat: any) => void
  onClose?: () => void
}

type FileStatus = 'pending' | 'uploading' | 'parsing' | 'success' | 'doublon_updated' | 'doc_added' | 'error'

interface FileItem {
  file: File
  status: FileStatus
  error?: string
  candidatNom?: string
  storagePath?: string        // Sauvegardé après upload pour retry
  needsRetry?: boolean        // Document non-CV qui n'a pas trouvé de candidat
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FORMATS_OK = ['pdf', 'docx', 'doc', 'jpg', 'jpeg', 'png']
const ACCEPT_STR = FORMATS_OK.map(e => `.${e}`).join(',')
const FETCH_TIMEOUT = 57_000

function getExt(name: string) {
  return name.toLowerCase().split('.').pop() || ''
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function UploadCV({ offreId, onSuccess, onClose }: UploadCVProps) {
  const [files, setFiles] = useState<FileItem[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [startTime, setStartTime] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const filesRef = useRef<FileItem[]>([])
  const cancelledRef = useRef(false)

  // Keep ref in sync with state
  filesRef.current = files

  // Derived counts
  const completed = files.filter(f =>
    f.status === 'success' || f.status === 'error' || f.status === 'doublon_updated' || f.status === 'doc_added'
  ).length
  const succeeded = files.filter(f => f.status === 'success').length
  const doublonsUpdated = files.filter(f => f.status === 'doublon_updated').length
  const docsAdded = files.filter(f => f.status === 'doc_added').length
  const failed = files.filter(f => f.status === 'error').length
  const pendingCount = files.filter(f => f.status === 'pending').length
  const progress = files.length > 0 ? Math.round((completed / files.length) * 100) : 0

  // Speed calc
  const speed = (() => {
    if (!startTime || completed === 0) return null
    const elapsed = (Date.now() - startTime) / 60_000 // minutes
    if (elapsed < 0.01) return null
    return Math.round(completed / elapsed)
  })()

  // ------- File management -------

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles)
    const valid = arr.filter(f => FORMATS_OK.includes(getExt(f.name)))
    const invalid = arr.length - valid.length
    if (invalid > 0) {
      toast.error(`${invalid} fichier(s) ignoré(s) — formats acceptés : ${FORMATS_OK.join(', ')}`)
    }
    setFiles(prev => {
      const existing = new Set(prev.map(f => `${f.file.name}-${f.file.size}`))
      const toAdd = valid.filter(f => !existing.has(`${f.name}-${f.size}`))
      return [...prev, ...toAdd.map(f => ({ file: f, status: 'pending' as FileStatus }))]
    })
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files)
  }, [addFiles])

  const removeFile = (i: number) => {
    setFiles(prev => prev.filter((_, idx) => idx !== i))
  }

  const updateFile = (i: number, patch: Partial<FileItem>) => {
    setFiles(prev => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))
  }

  // ------- Upload to Supabase Storage -------

  const uploadToStorage = async (file: File): Promise<string> => {
    const supabase = createClient()
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `temp_import/${timestamp}_${safeName}`
    const { data, error } = await supabase.storage.from('cvs').upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
    })
    if (error) throw new Error(`Upload storage: ${error.message}`)
    return data.path
  }

  // ------- Process a single file -------

  const processOneFile = async (idx: number, storagePath?: string): Promise<{ success: boolean; candidat?: any; needsRetry?: boolean }> => {
    if (cancelledRef.current) return { success: false }
    const item = filesRef.current[idx]
    if (!item) return { success: false }

    updateFile(idx, { status: 'uploading' })

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

    try {
      // 1. Upload to Supabase Storage (skip if already uploaded — retry case)
      const path = storagePath || await uploadToStorage(item.file)
      updateFile(idx, { status: 'parsing', storagePath: path })

      // 2. Call parse API
      const body: Record<string, any> = { storage_path: path, statut: 'nouveau' }
      if (offreId) body.offre_id = offreId

      const res = await fetch('/api/cv/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      const ct = res.headers.get('content-type') || ''
      const data = ct.includes('application/json') ? await res.json() : {}

      // 3. Document non-CV sans candidat → marquer pour retry
      if (!res.ok && res.status === 422 && data.document_type) {
        updateFile(idx, { status: 'pending', error: undefined, storagePath: path, needsRetry: true })
        return { success: false, needsRetry: true }
      }

      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)

      // 4. Doublon détecté
      if (data.isDuplicate && data.candidatExistant?.id) {
        if (data.updated) {
          // Document non-CV auto-ajouté
          const nom = `${data.candidatExistant?.prenom || ''} ${data.candidatExistant?.nom || ''}`.trim()
          updateFile(idx, { status: 'doc_added', candidatNom: nom || 'Document ajouté' })
          return { success: true, candidat: data.candidat || data.candidatExistant }
        } else {
          // CV doublon → auto-actualiser
          updateFile(idx, { status: 'parsing' })
          const updateBody: Record<string, any> = { storage_path: path, statut: 'nouveau', update_id: data.candidatExistant.id }
          if (offreId) updateBody.offre_id = offreId

          const res2 = await fetch('/api/cv/parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateBody),
          })
          const data2 = await res2.json()
          if (!res2.ok) throw new Error(data2.error || `Erreur ${res2.status}`)

          const nom = `${data2.candidat?.prenom || ''} ${data2.candidat?.nom || ''}`.trim()
          updateFile(idx, { status: 'doublon_updated', candidatNom: nom || 'CV actualisé' })
          return { success: true, candidat: data2.candidat }
        }
      }

      // 5. Nouveau candidat créé
      const nom = `${data.candidat?.prenom || ''} ${data.candidat?.nom || ''}`.trim()
      updateFile(idx, { status: 'success', candidatNom: nom || 'Candidat créé' })
      return { success: true, candidat: data.candidat }

    } catch (err: any) {
      clearTimeout(timeoutId)
      const msg = err.name === 'AbortError' ? 'Timeout — réessayez' : (err.message || 'Erreur inconnue')
      updateFile(idx, { status: 'error', error: msg })
      return { success: false }
    }
  }

  // ------- Two-pass processing -------

  const handleUpload = async () => {
    const pendingIndices = filesRef.current
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => f.status === 'pending')
      .map(({ i }) => i)

    if (pendingIndices.length === 0) return

    cancelledRef.current = false
    setUploading(true)
    setDone(false)
    setStartTime(Date.now())

    let lastSuccessCandidat: any = null

    // ── Pass 1 : traiter tous les fichiers ──
    for (const idx of pendingIndices) {
      if (cancelledRef.current) break
      const result = await processOneFile(idx)
      if (result.candidat) lastSuccessCandidat = result.candidat
    }

    // ── Pass 2 : retry les documents non-CV qui n'avaient pas trouvé de candidat ──
    if (!cancelledRef.current) {
      const retryIndices = filesRef.current
        .map((f, i) => ({ f, i }))
        .filter(({ f }) => f.needsRetry && f.storagePath)
        .map(({ i }) => i)

      if (retryIndices.length > 0) {
        console.log(`[Import] Pass 2 : retry de ${retryIndices.length} documents non-CV`)
        for (const idx of retryIndices) {
          if (cancelledRef.current) break
          const item = filesRef.current[idx]
          const result = await processOneFile(idx, item?.storagePath)
          if (result.candidat) lastSuccessCandidat = result.candidat
          if (result.needsRetry) {
            updateFile(idx, { status: 'error', error: 'Aucun candidat correspondant trouvé — importez le CV en premier', needsRetry: false })
          }
        }
      }
    }

    // Marquer les fichiers encore en attente comme annulés
    if (cancelledRef.current) {
      setFiles(prev => prev.map(f => f.status === 'pending' || f.status === 'uploading' || f.status === 'parsing'
        ? { ...f, status: 'error' as FileStatus, error: 'Import annulé' }
        : f
      ))
    }

    setUploading(false)
    setDone(true)
    if (lastSuccessCandidat) onSuccess?.(lastSuccessCandidat)
  }

  const handleCancel = () => {
    cancelledRef.current = true
  }

  const reset = () => {
    setFiles([])
    setDone(false)
    setUploading(false)
    setStartTime(null)
  }

  // ------- Status helpers -------

  const statusIcon = (s: FileStatus) => {
    switch (s) {
      case 'pending':
        return <Clock size={14} style={{ color: '#9CA3AF', flexShrink: 0 }} />
      case 'uploading':
      case 'parsing':
        return <Loader2 size={14} style={{ color: '#3B82F6', flexShrink: 0, animation: 'spin 1s linear infinite' }} />
      case 'success':
        return <CheckCircle size={14} style={{ color: '#16A34A', flexShrink: 0 }} />
      case 'doc_added':
        return <CheckCircle size={14} style={{ color: '#3B82F6', flexShrink: 0 }} />
      case 'doublon_updated':
        return <RefreshCw size={14} style={{ color: '#F59E0B', flexShrink: 0 }} />
      case 'error':
        return <AlertCircle size={14} style={{ color: '#DC2626', flexShrink: 0 }} />
    }
  }

  const statusText = (item: FileItem) => {
    switch (item.status) {
      case 'pending': return 'En attente'
      case 'uploading': return 'Upload en cours...'
      case 'parsing': return 'Analyse IA en cours...'
      case 'success': return `Importé — ${item.candidatNom}`
      case 'doc_added': return `Document ajouté — ${item.candidatNom}`
      case 'doublon_updated': return `CV actualisé — ${item.candidatNom}`
      case 'error': return `Erreur — ${item.error}`
    }
  }

  const statusColor = (s: FileStatus) => {
    switch (s) {
      case 'pending': return '#9CA3AF'
      case 'uploading':
      case 'parsing': return '#3B82F6'
      case 'success': return '#16A34A'
      case 'doc_added': return '#3B82F6'
      case 'doublon_updated': return '#F59E0B'
      case 'error': return '#DC2626'
    }
  }

  const rowBg = (s: FileStatus) => {
    switch (s) {
      case 'success': return '#F0FDF4'
      case 'doc_added': return '#EFF6FF'
      case 'doublon_updated': return '#FFFBEB'
      case 'error': return '#FEF2F2'
      default: return '#FFFFFF'
    }
  }

  const rowBorder = (s: FileStatus) => {
    switch (s) {
      case 'success': return '#BBF7D0'
      case 'doc_added': return '#BFDBFE'
      case 'doublon_updated': return '#FDE68A'
      case 'error': return '#FECACA'
      default: return '#E5E7EB'
    }
  }

  // ------- Handle close -------
  const handleClose = () => {
    if (uploading) {
      // Si import en cours, minimiser au lieu de fermer
      setMinimized(true)
      return
    }
    onClose?.()
  }

  // ------- Render -------

  // Mode minimisé — petite barre en bas à droite
  if (minimized) {
    return (
      <div style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 9000,
        background: 'white', borderRadius: 12, padding: '10px 16px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.15)', border: '1px solid #E5E7EB',
        display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
        minWidth: 280,
      }} onClick={() => setMinimized(false)}>
        {uploading ? (
          <Loader2 size={16} style={{ color: '#3B82F6', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
        ) : (
          <CheckCircle size={16} style={{ color: '#16A34A', flexShrink: 0 }} />
        )}
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>
            {uploading ? `Import en cours... ${completed}/${files.length}` : `Import terminé — ${succeeded + doublonsUpdated + docsAdded} traités`}
          </p>
          {uploading && (
            <div style={{ height: 3, background: '#E5E7EB', borderRadius: 10, marginTop: 4 }}>
              <div style={{ height: '100%', width: `${progress}%`, background: '#3B82F6', borderRadius: 10, transition: 'width 0.3s' }} />
            </div>
          )}
        </div>
        <span style={{ fontSize: 11, color: '#3B82F6', fontWeight: 600, flexShrink: 0 }}>Ouvrir</span>
        <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <>
    {/* Backdrop */}
    <div onClick={handleClose} style={{
      position: 'fixed', inset: 0, zIndex: 8500,
      background: 'rgba(0,0,0,0.3)', animation: 'fadeIn 0.15s ease',
    }} />
    {/* Panel */}
    <div style={{
      position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      zIndex: 8501, background: 'white', borderRadius: 16,
      boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      width: 440, maxHeight: '85vh', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
    {/* Header */}
    <div style={{ padding: '18px 22px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Importer Candidat/s</h2>
      <div style={{ display: 'flex', gap: 4 }}>
        {uploading && (
          <button onClick={() => setMinimized(true)} title="Minimiser" style={{
            width: 28, height: 28, borderRadius: 6, border: '1px solid #E5E7EB',
            background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 16, lineHeight: 1, color: '#6B7280' }}>—</span>
          </button>
        )}
        <button onClick={handleClose} title="Fermer" style={{
          width: 28, height: 28, borderRadius: 6, border: '1px solid #E5E7EB',
          background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <X size={14} style={{ color: '#6B7280' }} />
        </button>
      </div>
    </div>
    <div style={{ padding: '16px 22px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Subtitle */}
      {files.length > 0 && !uploading && !done && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          {files.length} fichier{files.length > 1 ? 's' : ''} sélectionné{files.length > 1 ? 's' : ''}
        </p>
      )}

      {/* Drop zone — hidden during upload */}
      {!uploading && !done && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? '#3B82F6' : '#D1D5DB'}`,
            borderRadius: 12,
            padding: '36px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragOver ? '#EFF6FF' : '#FAFAFA',
            transition: 'all 0.2s ease',
          }}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT_STR}
            style={{ display: 'none' }}
            onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }}
          />
          <Upload size={32} style={{ color: dragOver ? '#3B82F6' : '#9CA3AF', margin: '0 auto 12px', display: 'block' }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)', margin: '0 0 4px' }}>
            Glissez vos fichiers ici ou cliquez pour sélectionner
          </p>
          <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>
            PDF, Word, JPG, PNG
          </p>
        </div>
      )}

      {/* Progress bar + speed */}
      {(uploading || done) && files.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)' }}>
              {done ? 'Terminé' : `${completed} / ${files.length} fichiers traités`}
            </span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {uploading && speed !== null && `${speed} CVs/min`}
              {done && `${progress}%`}
            </span>
          </div>
          <div style={{ height: 6, background: '#E5E7EB', borderRadius: 100, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${progress}%`,
              background: done && failed === 0
                ? 'linear-gradient(90deg, #16A34A, #22C55E)'
                : done && succeeded === 0 && doublonsUpdated === 0
                  ? 'linear-gradient(90deg, #DC2626, #EF4444)'
                  : 'linear-gradient(90deg, #3B82F6, #60A5FA)',
              borderRadius: 100,
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
      )}

      {/* Summary cards */}
      {done && (
        <div style={{ display: 'flex', gap: 8 }}>
          {succeeded > 0 && (
            <div style={{
              flex: 1, padding: '10px 12px', borderRadius: 8,
              background: '#F0FDF4', border: '1px solid #BBF7D0', textAlign: 'center',
            }}>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#16A34A' }}>{succeeded}</p>
              <p style={{ margin: 0, fontSize: 11, color: '#16A34A', fontWeight: 500 }}>importé{succeeded > 1 ? 's' : ''}</p>
            </div>
          )}
          {docsAdded > 0 && (
            <div style={{
              flex: 1, padding: '10px 12px', borderRadius: 8,
              background: '#EFF6FF', border: '1px solid #BFDBFE', textAlign: 'center',
            }}>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#3B82F6' }}>{docsAdded}</p>
              <p style={{ margin: 0, fontSize: 11, color: '#2563EB', fontWeight: 500 }}>doc{docsAdded > 1 ? 's' : ''} ajouté{docsAdded > 1 ? 's' : ''}</p>
            </div>
          )}
          {doublonsUpdated > 0 && (
            <div style={{
              flex: 1, padding: '10px 12px', borderRadius: 8,
              background: '#FFFBEB', border: '1px solid #FDE68A', textAlign: 'center',
            }}>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#F59E0B' }}>{doublonsUpdated}</p>
              <p style={{ margin: 0, fontSize: 11, color: '#D97706', fontWeight: 500 }}>CV{doublonsUpdated > 1 ? 's' : ''} actualisé{doublonsUpdated > 1 ? 's' : ''}</p>
            </div>
          )}
          {failed > 0 && (
            <div style={{
              flex: 1, padding: '10px 12px', borderRadius: 8,
              background: '#FEF2F2', border: '1px solid #FECACA', textAlign: 'center',
            }}>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#DC2626' }}>{failed}</p>
              <p style={{ margin: 0, fontSize: 11, color: '#DC2626', fontWeight: 500 }}>erreur{failed > 1 ? 's' : ''}</p>
            </div>
          )}
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 300, overflowY: 'auto' }}>
          {files.map((item, i) => (
            <div
              key={`${item.file.name}-${item.file.size}-${i}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: rowBg(item.status),
                border: `1px solid ${rowBorder(item.status)}`,
                borderRadius: 8,
                padding: '8px 12px',
              }}
            >
              {statusIcon(item.status)}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <p style={{
                    fontSize: 12, fontWeight: 600, color: 'var(--foreground)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0,
                  }}>
                    {item.file.name}
                  </p>
                  <span style={{ fontSize: 10, color: '#9CA3AF', flexShrink: 0 }}>
                    {formatSize(item.file.size)}
                  </span>
                </div>
                <p style={{
                  fontSize: 11, margin: '2px 0 0', fontWeight: 500,
                  color: statusColor(item.status),
                }}>
                  {statusText(item)}
                </p>
              </div>
              {item.status === 'pending' && !uploading && (
                <button
                  onClick={() => removeFile(i)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#9CA3AF', padding: 2, flexShrink: 0,
                    display: 'flex', alignItems: 'center',
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        {!done && !uploading && files.length > 0 && (
          <>
            <button
              onClick={handleUpload}
              disabled={pendingCount === 0}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '10px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: pendingCount === 0 ? '#D1D5DB' : '#3B82F6',
                color: '#FFFFFF', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                transition: 'background 0.15s',
              }}
            >
              <Upload size={14} />
              Importer {pendingCount} fichier{pendingCount > 1 ? 's' : ''}
            </button>
            <button
              onClick={() => inputRef.current?.click()}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '10px 14px', borderRadius: 8,
                border: '1px solid #E5E7EB', background: '#FFFFFF',
                cursor: 'pointer', color: '#6B7280',
              }}
            >
              <Plus size={14} />
            </button>
          </>
        )}
        {uploading && (
          <div style={{ display: 'flex', gap: 8, flex: 1 }}>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 8, padding: '10px 0',
            }}>
              <Loader2 size={15} style={{ color: '#3B82F6', animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#6B7280' }}>
                Import en cours...
              </span>
            </div>
            <button
              onClick={handleCancel}
              style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: '1px solid #FECACA', background: '#FEF2F2',
                color: '#DC2626', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Arrêter
            </button>
          </div>
        )}
        {done && (
          <div style={{ display: 'flex', gap: 8, flex: 1 }}>
            <button
              onClick={reset}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '10px 16px', borderRadius: 8,
                border: '1px solid #E5E7EB', background: '#FFFFFF',
                cursor: 'pointer', color: '#374151', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              }}
            >
              <Plus size={14} />
              Ajouter d&apos;autres fichiers
            </button>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
    </div>
    </div>
    </>
  )
}
