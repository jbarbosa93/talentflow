'use client'

import { useState, useCallback, useRef } from 'react'
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, X, Plus, Copy } from 'lucide-react'
import { toast } from 'sonner'

type PipelineEtape = 'nouveau' | 'contacte' | 'entretien' | 'place' | 'refuse'

interface UploadCVProps {
  offreId?: string
  onSuccess?: (candidat: any) => void
  onClose?: () => void
}

type FileStatus = 'pending' | 'processing' | 'success' | 'error' | 'doublon' | 'skipped'

interface DuplicateInfo {
  id: string; prenom: string; nom: string; email?: string
  titre_poste?: string; created_at: string
}

interface FileItem {
  file: File
  status: FileStatus
  error?: string
  candidatNom?: string
  candidatExistant?: DuplicateInfo
  analyseNouv?: { prenom?: string; nom?: string; email?: string; titre_poste?: string }
}

const FORMATS_OK   = ['pdf', 'docx', 'doc', 'txt', 'jpg', 'jpeg', 'png']
const CONCURRENCY  = 2
const FETCH_TIMEOUT = 57_000

const ETAPES: { value: PipelineEtape; label: string }[] = [
  { value: 'nouveau',   label: 'Nouveau' },
  { value: 'contacte',  label: 'Contacté' },
  { value: 'entretien', label: 'Entretien' },
  { value: 'place',     label: 'Placé' },
  { value: 'refuse',    label: 'Refusé' },
]

function getExt(name: string) {
  return name.toLowerCase().split('.').pop() || ''
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`
}

export default function UploadCV({ offreId, onSuccess }: UploadCVProps) {
  const [files, setFiles]         = useState<FileItem[]>([])
  const [statut, setStatut]       = useState<PipelineEtape>('nouveau')
  const [dragOver, setDragOver]   = useState(false)
  const [uploading, setUploading] = useState(false)
  const [done, setDone]           = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const completed = files.filter(f => f.status === 'success' || f.status === 'error' || f.status === 'doublon' || f.status === 'skipped').length
  const succeeded = files.filter(f => f.status === 'success').length
  const failed    = files.filter(f => f.status === 'error').length
  const doublons  = files.filter(f => f.status === 'doublon').length
  const skipped   = files.filter(f => f.status === 'skipped').length
  const progress  = files.length > 0 ? Math.round((completed / files.length) * 100) : 0

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles)
    const valid = arr.filter(f => FORMATS_OK.includes(getExt(f.name)))
    const invalid = arr.filter(f => !FORMATS_OK.includes(getExt(f.name)))

    if (invalid.length > 0) {
      toast.error(`${invalid.length} fichier(s) ignoré(s) — formats acceptés : ${FORMATS_OK.join(', ')}`)
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
    setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, ...patch } : f))
  }

  const resolveDoublon = async (i: number, action: 'ignorer' | 'remplacer' | 'garder_les_deux' | 'actualiser') => {
    const item = files[i]
    if (action === 'ignorer') {
      updateFile(i, { status: 'skipped', candidatNom: 'Doublon ignoré' })
      return
    }
    updateFile(i, { status: 'processing' })
    const formData = new FormData()
    formData.append('cv', item.file)
    formData.append('statut', statut)
    if (offreId) formData.append('offre_id', offreId)
    if (action === 'remplacer' && item.candidatExistant) formData.append('replace_id', item.candidatExistant.id)
    if (action === 'actualiser' && item.candidatExistant) formData.append('update_id', item.candidatExistant.id)
    if (action === 'garder_les_deux') formData.append('force_insert', 'true')
    try {
      const res = await fetch('/api/cv/parse', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
      const nom = `${data.candidat?.prenom || ''} ${data.candidat?.nom || ''}`.trim()
      const suffix = action === 'remplacer' ? ' (remplacé)' : data.updated ? ' (actualisé)' : ''
      updateFile(i, { status: 'success', candidatNom: (nom || 'Candidat créé') + suffix })
      if (data.candidat) onSuccess?.(data.candidat)
    } catch {
      updateFile(i, { status: 'error', error: 'Erreur résolution doublon' })
    }
  }

  const handleUpload = async () => {
    const pending = files.filter(f => f.status === 'pending')
    if (pending.length === 0) return

    setUploading(true)
    setDone(false)

    const pendingIndices = files
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => f.status === 'pending')
      .map(({ i }) => i)

    const queue = [...pendingIndices]
    let lastSuccessCandidat: any = null

    const processOne = async (idx: number) => {
      updateFile(idx, { status: 'processing' })

      const formData = new FormData()
      formData.append('cv', files[idx].file)
      formData.append('statut', statut)
      if (offreId) formData.append('offre_id', offreId)

      const controller = new AbortController()
      const timeoutId  = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

      try {
        const res = await fetch('/api/cv/parse', { method: 'POST', body: formData, signal: controller.signal })
        clearTimeout(timeoutId)
        const ct   = res.headers.get('content-type') || ''
        const data = ct.includes('application/json') ? await res.json() : {}
        if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)

        // Doublon détecté
        if (data.isDuplicate) {
          updateFile(idx, {
            status: 'doublon',
            candidatExistant: data.candidatExistant,
            analyseNouv: data.analyse,
          })
          return
        }

        const nom = `${data.candidat?.prenom || ''} ${data.candidat?.nom || ''}`.trim()
        updateFile(idx, { status: 'success', candidatNom: nom || 'Candidat créé' })
        lastSuccessCandidat = data.candidat
      } catch (err: any) {
        clearTimeout(timeoutId)
        const msg = err.name === 'AbortError' ? 'Timeout — réessayez' : (err.message || 'Erreur inconnue')
        updateFile(idx, { status: 'error', error: msg })
      }
    }

    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const idx = queue.shift()!
        await processOne(idx)
      }
    })

    await Promise.all(workers)

    setUploading(false)
    setDone(true)

    if (lastSuccessCandidat) onSuccess?.(lastSuccessCandidat)
  }

  const reset = () => {
    setFiles([])
    setDone(false)
    setUploading(false)
  }

  const pendingCount = files.filter(f => f.status === 'pending').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0' }}>

      {/* Drop zone */}
      {!uploading && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: 12,
            padding: '28px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragOver ? 'var(--primary-soft)' : 'var(--background)',
            transition: 'all 0.15s',
          }}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.doc,.txt,.jpg,.jpeg,.png"
            style={{ display: 'none' }}
            onChange={e => e.target.files && addFiles(e.target.files)}
          />
          <Upload size={28} style={{ color: dragOver ? 'var(--primary)' : 'var(--muted)', margin: '0 auto 10px' }} />
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4, margin: '0 0 4px' }}>
            Glissez vos CVs ici ou cliquez pour sélectionner
          </p>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
            Plusieurs fichiers acceptés · PDF, Word, JPG, PNG, TXT
          </p>
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
          {files.map((item, i) => (
            <div key={i}>
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: item.status === 'success' ? '#F0FDF4'
                    : item.status === 'error' ? '#FEF2F2'
                    : item.status === 'doublon' ? '#FFFBEB'
                    : item.status === 'skipped' ? '#F9FAFB'
                    : 'white',
                  border: `1px solid ${item.status === 'success' ? '#BBF7D0' : item.status === 'error' ? '#FECACA' : item.status === 'doublon' ? '#FDE68A' : 'var(--border)'}`,
                  borderRadius: item.status === 'doublon' ? '8px 8px 0 0' : 8,
                  padding: '8px 12px',
                }}
              >
                {item.status === 'doublon' ? (
                  <Copy size={14} style={{ flexShrink: 0, color: '#F59E0B' }} />
                ) : (
                  <FileText size={14} style={{ flexShrink: 0, color: item.status === 'success' ? '#16A34A' : item.status === 'error' ? '#DC2626' : item.status === 'skipped' ? '#9CA3AF' : 'var(--muted)' }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                    {item.file.name}
                  </p>
                  <p style={{ fontSize: 10, margin: 0, fontWeight: item.status === 'pending' ? 400 : 600,
                    color: item.status === 'success' ? '#16A34A' : item.status === 'error' ? '#DC2626' : item.status === 'doublon' ? '#D97706' : item.status === 'skipped' ? '#9CA3AF' : 'var(--muted)' }}>
                    {item.status === 'pending' && `${formatSize(item.file.size)} · ${getExt(item.file.name).toUpperCase()}`}
                    {item.status === 'processing' && 'Analyse IA en cours...'}
                    {item.status === 'success' && item.candidatNom}
                    {item.status === 'error' && item.error}
                    {item.status === 'doublon' && `Doublon — existe déjà : ${item.candidatExistant?.prenom} ${item.candidatExistant?.nom}`}
                    {item.status === 'skipped' && item.candidatNom}
                  </p>
                </div>
                {item.status === 'processing' && <Loader2 size={14} style={{ color: 'var(--primary)', flexShrink: 0, animation: 'spin 1s linear infinite' }} />}
                {item.status === 'success'    && <CheckCircle size={14} style={{ color: '#16A34A', flexShrink: 0 }} />}
                {item.status === 'error'      && <AlertCircle size={14} style={{ color: '#DC2626', flexShrink: 0 }} />}
                {item.status === 'skipped'    && <CheckCircle size={14} style={{ color: '#9CA3AF', flexShrink: 0 }} />}
                {item.status === 'pending' && !uploading && (
                  <button onClick={() => removeFile(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2, flexShrink: 0 }}>
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Panneau résolution doublon */}
              {item.status === 'doublon' && item.candidatExistant && (
                <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: '8px 12px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => resolveDoublon(i, 'ignorer')}
                      style={{ flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 10, fontWeight: 700, border: '1px solid #E5E7EB', background: 'white', color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Garder existant
                    </button>
                    <button onClick={() => resolveDoublon(i, 'remplacer')}
                      style={{ flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 10, fontWeight: 700, border: '1px solid #3B82F6', background: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Remplacer
                    </button>
                    <button onClick={() => resolveDoublon(i, 'actualiser')}
                      style={{ flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 10, fontWeight: 700, border: '1px solid #10B981', background: '#F0FDF4', color: '#059669', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Actualiser
                    </button>
                    <button onClick={() => resolveDoublon(i, 'garder_les_deux')}
                      style={{ flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 10, fontWeight: 700, border: '1px solid #8B5CF6', background: '#F5F3FF', color: '#7C3AED', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Garder les deux
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Barre de progression */}
      {(uploading || done) && files.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)' }}>
              {done ? (
                <>
                  {succeeded > 0 && <span style={{ color: '#16A34A' }}>{succeeded} importé{succeeded > 1 ? 's' : ''}</span>}
                  {succeeded > 0 && (failed > 0 || doublons > 0 || skipped > 0) && ' · '}
                  {doublons > 0 && <span style={{ color: '#D97706' }}>{doublons} doublon{doublons > 1 ? 's' : ''}</span>}
                  {doublons > 0 && (failed > 0 || skipped > 0) && ' · '}
                  {skipped > 0 && <span style={{ color: '#9CA3AF' }}>{skipped} ignoré{skipped > 1 ? 's' : ''}</span>}
                  {skipped > 0 && failed > 0 && ' · '}
                  {failed > 0 && <span style={{ color: '#DC2626' }}>{failed} erreur{failed > 1 ? 's' : ''}</span>}
                </>
              ) : (
                `${completed} / ${files.length} traité${completed > 1 ? 's' : ''}`
              )}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: progress === 100 ? '#16A34A' : 'var(--primary)' }}>
              {progress}%
            </span>
          </div>
          <div style={{ height: 8, background: 'var(--border)', borderRadius: 100, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${progress}%`,
                background: done && failed === 0 && doublons === 0
                  ? 'linear-gradient(90deg, #16A34A, #22C55E)'
                  : done && succeeded === 0
                  ? 'linear-gradient(90deg, #DC2626, #EF4444)'
                  : 'linear-gradient(90deg, var(--primary), #F7B93E)',
                borderRadius: 100,
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {!done && !uploading && files.length > 0 && (
          <>
            <button
              onClick={handleUpload}
              disabled={pendingCount === 0}
              className="neo-btn"
              style={{ flex: 1, justifyContent: 'center', opacity: pendingCount === 0 ? 0.5 : 1 }}
            >
              <Upload size={14} />
              Importer {pendingCount} CV{pendingCount > 1 ? 's' : ''}
            </button>
            <button
              onClick={() => inputRef.current?.click()}
              className="neo-btn-ghost"
              style={{ padding: '10px 14px' }}
            >
              <Plus size={14} />
            </button>
          </>
        )}
        {uploading && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 0' }}>
            <Loader2 size={15} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>
              Import en cours...
            </span>
          </div>
        )}
        {done && (
          <button onClick={reset} className="neo-btn-ghost" style={{ flex: 1, justifyContent: 'center' }}>
            Importer d&apos;autres CVs
          </button>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
