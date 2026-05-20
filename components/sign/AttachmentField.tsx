// TalentFlow Sign — Widget de chargement de pièce jointe (candidat)
// v2.9.23
//
// Champ `attachment` : le candidat charge un ou plusieurs fichiers (photo ou
// fichier). Upload direct Supabase via URL signée (pas de limite Vercel).
// Après chaque upload, contrôle Claude Vision NON-BLOQUANT :
//   - lisibilité → bandeau jaune doux si la photo est difficile à lire
//   - date d'expiration → captée pour la Conformité
//
// Le candidat n'est JAMAIS bloqué : une photo douteuse reste utilisable.
// Partagé Mode Wizard (inline) et Mode Document (dans un modal).
'use client'

import { useRef, useState } from 'react'
import { Paperclip, Camera, Check, X, Loader2, AlertTriangle, FileText } from 'lucide-react'
import type { SignField, SignAttachmentValue, SignAttachmentFile } from '@/lib/sign/types'

interface UploadEntry {
  id: string
  name: string
  size: number
  mimeType?: string
  path?: string
  readable?: 'ok' | 'poor' | 'unreadable'
  expiryDate?: string | null
  status: 'uploading' | 'checking' | 'done' | 'error'
  error?: string
}

interface Props {
  field: SignField
  value: SignAttachmentValue | undefined
  onChange: (v: SignAttachmentValue) => void
  /** Token de signature — requis pour uploader. Absent = mode aperçu admin. */
  token?: string
  readOnly?: boolean
}

let counter = 0
const localId = () => `att_${Date.now()}_${counter++}`

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}
function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso
}

export default function AttachmentField({ field, value, onChange, token, readOnly }: Props) {
  const [entries, setEntries] = useState<UploadEntry[]>(() =>
    (value?.files || []).map(f => ({
      id: localId(),
      name: f.name,
      size: f.size,
      mimeType: f.mimeType,
      path: f.path,
      readable: f.readable,
      expiryDate: f.expiryDate ?? null,
      status: 'done' as const,
    })),
  )
  const entriesRef = useRef<UploadEntry[]>(entries)
  entriesRef.current = entries
  const inputRef = useRef<HTMLInputElement | null>(null)

  const allowMultiple = field.attachmentMultiple !== false
  const maxMb = field.attachmentMaxSizeMb || 10
  const accept = (field.attachmentMimeTypes && field.attachmentMimeTypes.length > 0)
    ? field.attachmentMimeTypes.join(',')
    : 'image/*,application/pdf'

  const toFile = (e: UploadEntry): SignAttachmentFile => ({
    path: e.path!,
    name: e.name,
    size: e.size,
    mimeType: e.mimeType,
    readable: e.readable,
    expiryDate: e.expiryDate ?? null,
  })

  // Met à jour l'état ET émet la valeur (fichiers réellement uploadés).
  const apply = (updater: (prev: UploadEntry[]) => UploadEntry[]) => {
    const next = updater(entriesRef.current)
    entriesRef.current = next
    setEntries(next)
    onChange({ files: next.filter(e => e.path && e.status !== 'error').map(toFile) })
  }
  const patch = (id: string, p: Partial<UploadEntry>) =>
    apply(prev => prev.map(e => (e.id === id ? { ...e, ...p } : e)))

  async function uploadOne(file: File) {
    const id = localId()
    apply(prev => [...prev, {
      id, name: file.name, size: file.size, mimeType: file.type || undefined, status: 'uploading',
    }])
    try {
      if (file.size > maxMb * 1024 * 1024) {
        patch(id, { status: 'error', error: `Trop lourd (max ${maxMb} Mo)` })
        return
      }
      // 1. URL d'upload signée
      const r = await fetch('/api/sign/attachment-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, filename: file.name }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.uploadUrl || !d.path) throw new Error(d.error || 'Upload impossible')
      // 2. PUT direct vers Supabase Storage
      const put = await fetch(d.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      })
      if (!put.ok) throw new Error('Échec de l\'envoi du fichier')
      patch(id, { path: d.path, status: 'checking' })
      // 3. Contrôle Vision (lisibilité + date) — non-bloquant
      try {
        const cr = await fetch('/api/sign/attachment-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, path: d.path, mimeType: file.type }),
        })
        const cd = await cr.json().catch(() => ({}))
        patch(id, {
          status: 'done',
          readable: cd.readable === 'poor' || cd.readable === 'unreadable' ? cd.readable : 'ok',
          expiryDate: typeof cd.expiryDate === 'string' ? cd.expiryDate : null,
        })
      } catch {
        patch(id, { status: 'done', readable: 'ok' })
      }
    } catch (e) {
      patch(id, { status: 'error', error: (e as Error).message || 'Erreur' })
    }
  }

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const list = Array.from(files)
    // Mono-fichier : on remplace le précédent
    if (!allowMultiple) {
      apply(() => [])
    }
    const toUpload = allowMultiple ? list : list.slice(0, 1)
    toUpload.forEach(f => { void uploadOne(f) })
    if (inputRef.current) inputRef.current.value = ''
  }

  const removeEntry = (id: string) => apply(prev => prev.filter(e => e.id !== id))
  const retryEntry = (id: string) => apply(prev => prev.filter(e => e.id !== id))

  // ── Mode aperçu admin (pas de token) ──
  if (!token && !readOnly) {
    return (
      <div style={previewBoxStyle}>
        <Paperclip size={15} style={{ color: '#A16207' }} />
        <span style={{ fontSize: 12.5, color: '#92400E' }}>
          Zone de pièce jointe — le chargement est actif côté candidat.
        </span>
      </div>
    )
  }

  const hasWarning = entries.some(e => e.readable === 'poor' || e.readable === 'unreadable')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Liste des fichiers */}
      {entries.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {entries.map(e => {
            const busy = e.status === 'uploading' || e.status === 'checking'
            const err = e.status === 'error'
            const warn = e.readable === 'poor' || e.readable === 'unreadable'
            const borderColor = err ? '#DC2626' : warn ? '#D97706' : e.status === 'done' ? '#15803D' : '#D1D5DB'
            const bg = err ? '#FEF2F2' : warn ? '#FFFBEB' : e.status === 'done' ? '#F0FDF4' : '#F9FAFB'
            return (
              <div key={e.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 8,
                border: `1.5px solid ${borderColor}`, background: bg,
              }}>
                {busy
                  ? <Loader2 size={15} className="animate-spin" style={{ color: '#A16207', flexShrink: 0 }} />
                  : err
                    ? <AlertTriangle size={15} style={{ color: '#DC2626', flexShrink: 0 }} />
                    : warn
                      ? <AlertTriangle size={15} style={{ color: '#D97706', flexShrink: 0 }} />
                      : <Check size={15} style={{ color: '#15803D', flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12.5, fontWeight: 600, color: '#1C1A14',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {e.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#6B7280' }}>
                    {e.status === 'uploading' && 'Envoi en cours…'}
                    {e.status === 'checking' && 'Vérification…'}
                    {e.status === 'error' && (e.error || 'Erreur')}
                    {e.status === 'done' && (
                      <>
                        {formatSize(e.size)}
                        {e.expiryDate && <> · expire le {formatDate(e.expiryDate)}</>}
                      </>
                    )}
                  </div>
                </div>
                {!readOnly && !busy && (
                  <button
                    type="button"
                    onClick={() => (err ? retryEntry(e.id) : removeEntry(e.id))}
                    title={err ? 'Retirer' : 'Retirer ce fichier'}
                    style={{
                      width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                      border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      color: '#6B7280',
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Bandeau lisibilité — NON-BLOQUANT */}
      {hasWarning && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          padding: '9px 11px', borderRadius: 8,
          background: '#FFFBEB', border: '1px solid #FCD34D',
          fontSize: 12, color: '#92400E', lineHeight: 1.45,
        }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Une photo semble difficile à lire — une photo plus nette aiderait,
            mais tu peux <strong>continuer quand même</strong>.
          </span>
        </div>
      )}

      {/* Bouton ajouter */}
      {!readOnly && (allowMultiple || entries.length === 0 || entries.every(e => e.status === 'error')) && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple={allowMultiple}
            onChange={e => handleFiles(e.target.files)}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '11px 14px', width: '100%',
              background: '#FEF3C7', border: '1.5px dashed #EAB308', borderRadius: 10,
              cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13.5, fontWeight: 700, color: '#A16207',
            }}
          >
            <Camera size={16} />
            {entries.length > 0 ? 'Ajouter un autre fichier' : 'Charger un fichier ou une photo'}
          </button>
          <div style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'center' }}>
            <FileText size={10} style={{ display: 'inline', verticalAlign: -1, marginRight: 3 }} />
            Photo ou fichier · max {maxMb} Mo{allowMultiple ? ' · recto + verso possibles' : ''}
          </div>
        </>
      )}

      {readOnly && entries.length === 0 && (
        <div style={{ fontSize: 12.5, color: '#9CA3AF', fontStyle: 'italic' }}>
          Aucun fichier chargé.
        </div>
      )}
    </div>
  )
}

const previewBoxStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '11px 13px', borderRadius: 8,
  background: '#FFFBEB', border: '1.5px dashed #FCD34D',
}
