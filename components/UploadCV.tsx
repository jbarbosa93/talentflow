'use client'

import { useState, useCallback, useRef } from 'react'
import {
  Upload, CheckCircle, AlertCircle, Loader2, X,
  Clock, RefreshCw, Plus, Search, Eye, UserPlus,
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { dispatchBadgesChanged } from '@/lib/badge-candidats'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UploadCVProps {
  offreId?: string
  onSuccess?: (candidat: any) => void
  onClose?: () => void
}

type FileStatus = 'pending' | 'uploading' | 'parsing' | 'success' | 'doublon_updated' | 'already_imported' | 'doc_added' | 'multiple_matches' | 'error'

interface FileItem {
  file: File
  status: FileStatus
  error?: string
  multipleMatches?: any[]
  cvUrl?: string
  analyse?: any
  candidatNom?: string
  storagePath?: string
  needsRetry?: boolean
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
  const [manualSearchIdx, setManualSearchIdx] = useState<number | null>(null)
  const [manualSearchQuery, setManualSearchQuery] = useState('')
  const [manualSearchResults, setManualSearchResults] = useState<any[]>([])
  const [manualSearching, setManualSearching] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const filesRef = useRef<FileItem[]>([])
  const cancelledRef = useRef(false)
  const searchTimerRef = useRef<any>(null)

  // Keep ref in sync with state
  filesRef.current = files

  // Derived counts
  const completed = files.filter(f =>
    f.status === 'success' || f.status === 'error' || f.status === 'doublon_updated' || f.status === 'doc_added' || f.status === 'multiple_matches'
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
    const invalidFiles = arr.filter(f => !FORMATS_OK.includes(getExt(f.name)))
    if (invalidFiles.length > 0) {
      const names = invalidFiles.map(f => f.name).slice(0, 10).join('\n• ')
      toast.error(`${invalidFiles.length} fichier(s) ignoré(s) :\n• ${names}${invalidFiles.length > 10 ? `\n...et ${invalidFiles.length - 10} autres` : ''}\n\nFormats acceptés : ${FORMATS_OK.join(', ')}`, { duration: 8000 })
    }
    // Reset "terminé" quand on ajoute de nouveaux fichiers
    setDone(false)
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

  const processOneFile = async (idx: number, storagePath?: string): Promise<{ success: boolean; candidat?: any; needsRetry?: boolean; needsSelection?: boolean }> => {
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

      // 2. Call parse API — file_date = lastModified du fichier (date la plus fiable)
      const body: Record<string, any> = { storage_path: path, statut: 'nouveau', file_date: new Date(item.file.lastModified).toISOString() }
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
        updateFile(idx, { status: 'pending', error: undefined, storagePath: path, cvUrl: data.cv_url, needsRetry: true })
        return { success: false, needsRetry: true }
      }

      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)

      // 4a. Plusieurs candidats matchent → demander à l'utilisateur
      if (data.isDuplicate && data.multipleMatches && data.candidatsMatches) {
        updateFile(idx, {
          status: 'multiple_matches' as any,
          candidatNom: `${data.candidatsMatches.length} candidats trouvés`,
          multipleMatches: data.candidatsMatches,
          cvUrl: data.cv_url,
          analyse: data.analyse,
          storagePath: path,
        })
        return { success: false, needsSelection: true }
      }

      // 4b. Doublon détecté (un seul match)
      if (data.isDuplicate && data.candidatExistant?.id) {
        if (data.sameFile) {
          // Exactement le même fichier déjà en base → rien à faire
          const nom = `${data.candidatExistant?.prenom || ''} ${data.candidatExistant?.nom || ''}`.trim()
          updateFile(idx, { status: 'already_imported', candidatNom: nom })
          return { success: true, candidat: data.candidatExistant }
        }
        if (data.updated) {
          const nom = `${data.candidatExistant?.prenom || ''} ${data.candidatExistant?.nom || ''}`.trim()
          if (data.cvUpdated) {
            // CV mis à jour — nouveau principal, ancien archivé
            updateFile(idx, { status: 'doublon_updated', candidatNom: nom || 'CV mis à jour' })
          } else {
            // Document non-CV auto-ajouté
            updateFile(idx, { status: 'doc_added', candidatNom: nom || 'Document ajouté' })
          }
          return { success: true, candidat: data.candidat || data.candidatExistant }
        } else {
          // CV doublon → auto-actualiser
          updateFile(idx, { status: 'parsing' })
          const updateBody: Record<string, any> = { storage_path: path, statut: 'nouveau', update_id: data.candidatExistant.id, file_date: new Date(item.file.lastModified).toISOString() }
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

    // ── Pass 1 : traiter tous les fichiers (10 en parallèle — Vercel Pro 300s) ──
    const PARALLEL = 10
    for (let i = 0; i < pendingIndices.length; i += PARALLEL) {
      if (cancelledRef.current) break
      const chunk = pendingIndices.slice(i, i + PARALLEL)
      const results = await Promise.all(chunk.map(idx => processOneFile(idx)))
      for (const result of results) {
        if (result.candidat) lastSuccessCandidat = result.candidat
      }
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
            // Garder storagePath pour permettre la recherche manuelle
            updateFile(idx, { status: 'error', error: 'Aucun candidat correspondant — cherchez manuellement', needsRetry: false })
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
    // Rafraîchir le badge sidebar (has_update:true en DB → sidebar re-fetch count-new)
    dispatchBadgesChanged()
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
        return <Clock size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
      case 'uploading':
      case 'parsing':
        return <Loader2 size={14} style={{ color: '#3B82F6', flexShrink: 0, animation: 'spin 1s linear infinite' }} />
      case 'success':
        return <CheckCircle size={14} style={{ color: '#16A34A', flexShrink: 0 }} />
      case 'doc_added':
        return <CheckCircle size={14} style={{ color: '#3B82F6', flexShrink: 0 }} />
      case 'doublon_updated':
        return <RefreshCw size={14} style={{ color: '#F59E0B', flexShrink: 0 }} />
      case 'multiple_matches':
        return <AlertCircle size={14} style={{ color: '#8B5CF6', flexShrink: 0 }} />
      case 'error':
        return <AlertCircle size={14} style={{ color: '#DC2626', flexShrink: 0 }} />
    }
  }

  const handleSelectMatch = async (fileIdx: number, candidatId: string) => {
    const f = filesRef.current[fileIdx]
    if (!f || !f.storagePath) return
    updateFile(fileIdx, { status: 'parsing' })
    try {
      const body: Record<string, any> = { storage_path: f.storagePath, statut: 'nouveau', update_id: candidatId, file_date: f.file ? new Date(f.file.lastModified).toISOString() : undefined }
      const res = await fetch('/api/cv/parse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
      const nom = `${data.candidat?.prenom || ''} ${data.candidat?.nom || ''}`.trim()
      updateFile(fileIdx, { status: 'doc_added', candidatNom: nom || 'Document ajouté', multipleMatches: undefined })
      setManualSearchIdx(null)
      setManualSearchQuery('')
      setManualSearchResults([])
    } catch (err: any) {
      updateFile(fileIdx, { status: 'error', error: err.message || 'Erreur', multipleMatches: undefined })
    }
  }

  const handleForceCreate = async (fileIdx: number) => {
    const f = filesRef.current[fileIdx]
    if (!f || !f.storagePath) return
    updateFile(fileIdx, { status: 'parsing' })
    try {
      const body: Record<string, any> = { storage_path: f.storagePath, statut: 'nouveau', force_insert: true, file_date: f.file ? new Date(f.file.lastModified).toISOString() : undefined }
      const res = await fetch('/api/cv/parse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
      const nom = `${data.candidat?.prenom || ''} ${data.candidat?.nom || ''}`.trim()
      updateFile(fileIdx, { status: 'success', candidatNom: nom || 'Candidat créé', multipleMatches: undefined })
      setManualSearchIdx(null)
      setManualSearchQuery('')
      setManualSearchResults([])
    } catch (err: any) {
      updateFile(fileIdx, { status: 'error', error: err.message || 'Erreur', multipleMatches: undefined })
    }
  }

  const handleManualSearch = (query: string) => {
    setManualSearchQuery(query)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (!query.trim()) { setManualSearchResults([]); return }
    searchTimerRef.current = setTimeout(async () => {
      setManualSearching(true)
      try {
        const res = await fetch(`/api/candidats?search=${encodeURIComponent(query)}&per_page=6&import_status=all`)
        if (res.ok) {
          const { candidats } = await res.json()
          setManualSearchResults(candidats || [])
        }
      } catch {} finally { setManualSearching(false) }
    }, 300)
  }

  const statusText = (item: FileItem) => {
    switch (item.status) {
      case 'pending': return item.needsRetry ? 'En attente (2ème tentative)' : 'En attente'
      case 'uploading': return 'Upload en cours...'
      case 'parsing': return 'Analyse IA en cours...'
      case 'success': return `Importé — ${item.candidatNom}`
      case 'already_imported': return `Déjà importé — ${item.candidatNom}`
      case 'doc_added': return `Document ajouté — ${item.candidatNom}`
      case 'doublon_updated': return `CV actualisé — ${item.candidatNom}`
      case 'multiple_matches': return item.multipleMatches?.length === 1
        ? 'Même personne ? Confirmez ou créez un nouveau :'
        : 'Choisissez le candidat :'
      case 'error': return `Erreur — ${item.error}`
    }
  }

  const statusColor = (s: FileStatus) => {
    switch (s) {
      case 'pending': return '#9CA3AF'
      case 'uploading':
      case 'parsing': return '#3B82F6'
      case 'success': return '#16A34A'
      case 'already_imported': return '#9CA3AF'
      case 'doc_added': return '#3B82F6'
      case 'doublon_updated': return '#F59E0B'
      case 'multiple_matches': return '#8B5CF6'
      case 'error': return '#DC2626'
    }
  }

  const rowBg = (s: FileStatus) => {
    switch (s) {
      case 'success': return '#F0FDF4'
      case 'already_imported': return '#F9FAFB'
      case 'doc_added': return '#EFF6FF'
      case 'doublon_updated': return '#FFFBEB'
      case 'multiple_matches': return '#F5F3FF'
      case 'error': return '#FEF2F2'
      default: return 'var(--secondary)'
    }
  }

  const rowBorder = (s: FileStatus) => {
    switch (s) {
      case 'success': return '#BBF7D0'
      case 'doc_added': return '#BFDBFE'
      case 'doublon_updated': return '#FDE68A'
      case 'multiple_matches': return '#C4B5FD'
      case 'error': return '#FECACA'
      default: return 'var(--border)'
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
        background: 'var(--card)', borderRadius: 12, padding: '10px 16px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.15)', border: '1px solid var(--border)',
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
            <div style={{ height: 3, background: 'var(--border)', borderRadius: 10, marginTop: 4 }}>
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
      zIndex: 8501, background: 'var(--card)', borderRadius: 16,
      boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      width: 440, maxHeight: '85vh', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
    {/* Header */}
    <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--foreground)' }}>Importer Candidat/s</h2>
      <div style={{ display: 'flex', gap: 4 }}>
        {uploading && (
          <button onClick={() => setMinimized(true)} title="Minimiser" style={{
            width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 16, lineHeight: 1, color: 'var(--muted)' }}>—</span>
          </button>
        )}
        <button onClick={handleClose} title="Fermer" style={{
          width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
          background: 'var(--secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <X size={14} style={{ color: 'var(--muted)' }} />
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
            border: `2px dashed ${dragOver ? '#3B82F6' : 'var(--border)'}`,
            borderRadius: 12,
            padding: '36px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragOver ? '#EFF6FF' : 'var(--secondary)',
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
          <div style={{ height: 6, background: 'var(--border)', borderRadius: 100, overflow: 'hidden' }}>
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
                  <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>
                    {formatSize(item.file.size)}
                  </span>
                </div>
                <p style={{
                  fontSize: 11, margin: '2px 0 0', fontWeight: 500,
                  color: statusColor(item.status),
                }}>
                  {statusText(item)}
                </p>
                {(item.status === 'multiple_matches' || (item.status === 'error' && item.storagePath)) && (
                  <div style={{ marginTop: 4 }}>
                    {/* Bouton œil → lightbox plein écran */}
                    {item.cvUrl && (
                      <button
                        onClick={() => setPreviewUrl(item.cvUrl || null)}
                        style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid #E5E7EB', background: 'white', cursor: 'pointer', fontFamily: 'inherit', color: '#6B7280', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 3 }}
                        title="Voir le document"
                      >
                        <Eye size={10} /> Voir
                      </button>
                    )}
                    {/* Candidats matchés automatiquement */}
                    {item.multipleMatches && item.multipleMatches.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
                        {item.multipleMatches.map((c: any) => (
                          <button
                            key={c.id}
                            onClick={() => handleSelectMatch(i, c.id)}
                            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid #C4B5FD', background: 'white', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, color: '#7C3AED', transition: 'all 0.15s' }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#8B5CF6'; e.currentTarget.style.color = 'white' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = '#7C3AED' }}
                          >
                            {c.prenom} {c.nom} {c.titre_poste ? `· ${c.titre_poste}` : ''} {c.telephone ? `· ${c.telephone}` : ''}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Recherche manuelle */}
                    {manualSearchIdx === i ? (
                      <div style={{ marginTop: 2 }}>
                        <div style={{ position: 'relative' }}>
                          <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
                          <input
                            autoFocus
                            placeholder="Rechercher un candidat..."
                            value={manualSearchQuery}
                            onChange={e => handleManualSearch(e.target.value)}
                            style={{ width: '100%', fontSize: 11, padding: '5px 8px 5px 26px', borderRadius: 6, border: '1px solid #D1D5DB', fontFamily: 'inherit', outline: 'none' }}
                          />
                          {manualSearching && <Loader2 size={12} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', animation: 'spin 1s linear infinite' }} />}
                        </div>
                        {manualSearchResults.length > 0 && (
                          <div style={{ marginTop: 3, display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 120, overflowY: 'auto' }}>
                            {manualSearchResults.map((c: any) => (
                              <button
                                key={c.id}
                                onClick={() => handleSelectMatch(i, c.id)}
                                style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid #E5E7EB', background: 'white', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, color: 'var(--foreground)', textAlign: 'left', transition: 'all 0.12s' }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#F3F4F6')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                              >
                                <strong>{c.prenom} {c.nom}</strong> {c.titre_poste ? `· ${c.titre_poste}` : ''} {c.telephone ? `· ${c.telephone}` : ''}
                              </button>
                            ))}
                          </div>
                        )}
                        <button onClick={() => { setManualSearchIdx(null); setManualSearchQuery(''); setManualSearchResults([]) }} style={{ fontSize: 10, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', marginTop: 3, fontFamily: 'inherit' }}>Fermer</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button
                          onClick={() => handleForceCreate(i)}
                          style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid #16A34A', background: 'white', cursor: 'pointer', fontFamily: 'inherit', color: '#16A34A', display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600 }}
                        >
                          <UserPlus size={10} /> Nouveau candidat
                        </button>
                        <button
                          onClick={() => { setManualSearchIdx(i); setManualSearchQuery(''); setManualSearchResults([]) }}
                          style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid #C4B5FD', background: 'white', cursor: 'pointer', fontFamily: 'inherit', color: '#7C3AED', display: 'flex', alignItems: 'center', gap: 3 }}
                        >
                          <Search size={10} /> Chercher
                        </button>
                        <button
                          onClick={() => updateFile(i, { status: 'error', error: 'Ignoré', multipleMatches: undefined, storagePath: undefined })}
                          style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid #E5E7EB', background: 'white', cursor: 'pointer', fontFamily: 'inherit', color: '#9CA3AF' }}
                        >
                          Ignorer
                        </button>
                      </div>
                    )}
                  </div>
                )}
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

    {/* Lightbox aperçu document */}
    {previewUrl && (
      <div
        onClick={() => setPreviewUrl(null)}
        style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)',
          display: 'flex', flexDirection: 'column',
          animation: 'fadeIn 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 16px', flexShrink: 0 }}>
          <button
            onClick={() => setPreviewUrl(null)}
            style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
            }}
          >
            <X size={16} />
          </button>
        </div>
        <div onClick={e => e.stopPropagation()} style={{ flex: 1, padding: '0 24px 24px', minHeight: 0 }}>
          {/\.(jpg|jpeg|png|gif|webp)/i.test(previewUrl) ? (
            <img src={previewUrl} alt="Document" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', margin: '0 auto', display: 'block', borderRadius: 8 }} />
          ) : (
            <iframe
              src={`${previewUrl}#toolbar=1&view=FitH`}
              style={{ width: '100%', height: '100%', border: 'none', borderRadius: 8 }}
              title="Aperçu document"
            />
          )}
        </div>
      </div>
    )}

    </>
  )
}
