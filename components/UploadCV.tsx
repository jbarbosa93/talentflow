'use client'

import { useState, useCallback, useRef } from 'react'
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, X, Plus } from 'lucide-react'
import { toast } from 'sonner'

type PipelineEtape = 'nouveau' | 'contacte' | 'entretien' | 'place' | 'refuse'

interface UploadCVProps {
  offreId?: string
  onSuccess?: (candidat: any) => void
  onClose?: () => void
}

type FileStatus = 'pending' | 'processing' | 'success' | 'error'

interface FileItem {
  file: File
  status: FileStatus
  error?: string
  candidatNom?: string
}

const FORMATS_OK   = ['pdf', 'docx', 'doc', 'txt', 'jpg', 'jpeg', 'png']
const CONCURRENCY  = 2
const FETCH_TIMEOUT = 54_000  // 54s — sous le timeout global route (55s) et Vercel (60s)

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

  // Nombre de fichiers traités (success ou error)
  const completed = files.filter(f => f.status === 'success' || f.status === 'error').length
  const succeeded = files.filter(f => f.status === 'success').length
  const failed    = files.filter(f => f.status === 'error').length
  const progress  = files.length > 0 ? Math.round((completed / files.length) * 100) : 0

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles)
    const valid = arr.filter(f => FORMATS_OK.includes(getExt(f.name)))
    const invalid = arr.filter(f => !FORMATS_OK.includes(getExt(f.name)))

    if (invalid.length > 0) {
      toast.error(`${invalid.length} fichier(s) ignoré(s) — formats acceptés : ${FORMATS_OK.join(', ')}`)
    }

    setFiles(prev => {
      // Éviter les doublons par nom+taille
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

  const handleUpload = async () => {
    const pending = files.filter(f => f.status === 'pending')
    if (pending.length === 0) return

    setUploading(true)
    setDone(false)

    // Indices des fichiers pending dans le tableau files
    const pendingIndices = files
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => f.status === 'pending')
      .map(({ i }) => i)

    // File d'attente avec concurrence limitée
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
        const nom = `${data.candidat?.prenom || ''} ${data.candidat?.nom || ''}`.trim()
        updateFile(idx, { status: 'success', candidatNom: nom || 'Candidat créé' })
        lastSuccessCandidat = data.candidat
      } catch (err: any) {
        clearTimeout(timeoutId)
        const msg = err.name === 'AbortError' ? 'Timeout (54s) — réessayez' : (err.message || 'Erreur inconnue')
        updateFile(idx, { status: 'error', error: msg })
      }
    }

    // Travailleurs parallèles
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
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4 }}>
            Glissez vos CVs ici ou cliquez pour sélectionner
          </p>
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>
            Plusieurs fichiers acceptés · PDF, Word, JPG, PNG, TXT
          </p>
        </div>
      )}

      {/* Statut pipeline */}
      {files.length > 0 && !uploading && !done && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', whiteSpace: 'nowrap' }}>Statut pipeline :</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ETAPES.map(e => (
              <button
                key={e.value}
                onClick={() => setStatut(e.value)}
                style={{
                  padding: '4px 10px', borderRadius: 100, fontSize: 11, fontWeight: 700,
                  border: '1.5px solid',
                  borderColor: statut === e.value ? 'var(--foreground)' : 'var(--border)',
                  background: statut === e.value ? 'var(--foreground)' : 'white',
                  color: statut === e.value ? 'white' : 'var(--muted)',
                  cursor: 'pointer', fontFamily: 'var(--font-body)',
                }}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
          {files.map((item, i) => (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: item.status === 'success' ? '#F0FDF4' : item.status === 'error' ? '#FEF2F2' : 'white',
                border: `1px solid ${item.status === 'success' ? '#BBF7D0' : item.status === 'error' ? '#FECACA' : 'var(--border)'}`,
                borderRadius: 8, padding: '8px 12px',
              }}
            >
              <FileText size={14} style={{ flexShrink: 0, color: item.status === 'success' ? '#16A34A' : item.status === 'error' ? '#DC2626' : 'var(--muted)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.file.name}
                </p>
                {item.status === 'pending' && (
                  <p style={{ fontSize: 10, color: 'var(--muted)' }}>{formatSize(item.file.size)}</p>
                )}
                {item.status === 'processing' && (
                  <p style={{ fontSize: 10, color: 'var(--primary)', fontWeight: 600 }}>Analyse en cours...</p>
                )}
                {item.status === 'success' && (
                  <p style={{ fontSize: 10, color: '#16A34A', fontWeight: 600 }}>{item.candidatNom}</p>
                )}
                {item.status === 'error' && (
                  <p style={{ fontSize: 10, color: '#DC2626' }}>{item.error}</p>
                )}
              </div>
              {/* Icône statut */}
              {item.status === 'processing' && <Loader2 size={14} style={{ color: 'var(--primary)', flexShrink: 0, animation: 'spin 1s linear infinite' }} />}
              {item.status === 'success'    && <CheckCircle size={14} style={{ color: '#16A34A', flexShrink: 0 }} />}
              {item.status === 'error'      && <AlertCircle size={14} style={{ color: '#DC2626', flexShrink: 0 }} />}
              {item.status === 'pending' && !uploading && (
                <button onClick={() => removeFile(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2, flexShrink: 0 }}>
                  <X size={13} />
                </button>
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
                  {succeeded > 0 && failed > 0 && ' · '}
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
                background: done && failed === 0
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
              Import en cours — {CONCURRENCY} fichiers en parallèle...
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
