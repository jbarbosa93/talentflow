// TalentFlow Sign — Widget de chargement de pièce jointe (candidat)
// v2.9.27
//
// Champ `attachment` : le candidat charge un ou plusieurs fichiers (photo ou
// fichier). Upload direct Supabase via URL signée (pas de limite Vercel).
// Après chaque upload, contrôle Claude Vision NON-BLOQUANT :
//   - lisibilité → bandeau jaune doux si la photo est difficile à lire
//   - date d'expiration → captée pour la Conformité
//
// 2 modes (réglés sur le champ via `attachmentSides`) :
//   - 'single'      : 1 (ou plusieurs si attachmentMultiple) fichier libre
//   - 'recto_verso' : 2 emplacements explicites « Recto » et « Verso »
//
// Le candidat n'est JAMAIS bloqué : une photo douteuse reste utilisable.
'use client'

import { useRef, useState } from 'react'
import { Camera, Check, X, Loader2, AlertTriangle, FileText, Paperclip } from 'lucide-react'
import type { SignField, SignAttachmentValue, SignAttachmentFile } from '@/lib/sign/types'

type Side = 'recto' | 'verso'

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
  /** v2.9.27 — mode recto/verso : à quel emplacement appartient le fichier */
  side?: Side
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
  const rectoVerso = field.attachmentSides === 'recto_verso'

  const [entries, setEntries] = useState<UploadEntry[]>(() =>
    (value?.files || []).map((f, i) => ({
      id: localId(),
      name: f.name,
      size: f.size,
      mimeType: f.mimeType,
      path: f.path,
      readable: f.readable,
      expiryDate: f.expiryDate ?? null,
      status: 'done' as const,
      side: rectoVerso ? (i === 0 ? 'recto' : 'verso') : undefined,
    })),
  )
  const entriesRef = useRef<UploadEntry[]>(entries)
  entriesRef.current = entries

  const allowMultiple = !rectoVerso && field.attachmentMultiple !== false
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

  // Met à jour l'état ET émet la valeur. En mode recto/verso, on émet recto en
  // premier (→ recto en haut de la page A4 composée dans l'email).
  const apply = (updater: (prev: UploadEntry[]) => UploadEntry[]) => {
    const next = updater(entriesRef.current)
    entriesRef.current = next
    setEntries(next)
    const usable = next.filter(e => e.path && e.status !== 'error')
    const ordered = rectoVerso
      ? [...usable].sort((a, b) => (a.side === 'recto' ? 0 : 1) - (b.side === 'recto' ? 0 : 1))
      : usable
    onChange({ files: ordered.map(toFile) })
  }
  const patch = (id: string, p: Partial<UploadEntry>) =>
    apply(prev => prev.map(e => (e.id === id ? { ...e, ...p } : e)))

  async function uploadOne(file: File, side?: Side) {
    const id = localId()
    apply(prev => {
      // recto/verso : un nouvel upload remplace le fichier du même côté
      const base = side ? prev.filter(e => e.side !== side) : prev
      return [...base, {
        id, name: file.name, size: file.size, mimeType: file.type || undefined,
        status: 'uploading', side,
      }]
    })
    try {
      if (file.size > maxMb * 1024 * 1024) {
        patch(id, { status: 'error', error: `Trop lourd (max ${maxMb} Mo)` })
        return
      }
      const r = await fetch('/api/sign/attachment-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, filename: file.name }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.uploadUrl || !d.path) throw new Error(d.error || 'Upload impossible')
      const put = await fetch(d.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      })
      if (!put.ok) throw new Error('Échec de l\'envoi du fichier')
      patch(id, { path: d.path, status: 'checking' })
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

  const removeEntry = (id: string) => apply(prev => prev.filter(e => e.id !== id))

  const hasWarning = entries.some(e => e.readable === 'poor' || e.readable === 'unreadable')

  // ── Mode aperçu admin (pas de token) ──
  if (!token && !readOnly) {
    return (
      <div style={previewBoxStyle}>
        <Paperclip size={15} style={{ color: '#A16207' }} />
        <span style={{ fontSize: 12.5, color: '#92400E' }}>
          Zone de pièce jointe{rectoVerso ? ' (Recto + Verso)' : ''} — le chargement est actif côté candidat.
        </span>
      </div>
    )
  }

  // ─── MODE RECTO / VERSO : 2 emplacements explicites ───
  if (rectoVerso) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {(['recto', 'verso'] as const).map(side => (
            <SideSlot
              key={side}
              side={side}
              entry={entries.find(e => e.side === side)}
              accept={accept}
              maxMb={maxMb}
              readOnly={readOnly}
              onPick={file => { void uploadOne(file, side) }}
              onRemove={removeEntry}
            />
          ))}
        </div>
        {hasWarning && <ReadabilityBanner />}
      </div>
    )
  }

  // ─── MODE SIMPLE (single / multiple) ───
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {entries.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {entries.map(e => (
            <FileRow key={e.id} entry={e} readOnly={readOnly} onRemove={removeEntry} />
          ))}
        </div>
      )}
      {hasWarning && <ReadabilityBanner />}
      {!readOnly && (allowMultiple || entries.length === 0 || entries.every(e => e.status === 'error')) && (
        <FilePicker
          accept={accept}
          multiple={allowMultiple}
          maxMb={maxMb}
          label={entries.length > 0 ? 'Ajouter un autre fichier' : 'Charger un fichier ou une photo'}
          hint={`Photo ou fichier · max ${maxMb} Mo${allowMultiple ? ' · plusieurs possibles' : ''}`}
          onPick={files => files.forEach(f => { void uploadOne(f) })}
        />
      )}
      {readOnly && entries.length === 0 && (
        <div style={{ fontSize: 12.5, color: '#9CA3AF', fontStyle: 'italic' }}>Aucun fichier chargé.</div>
      )}
    </div>
  )
}

// ─── Emplacement Recto ou Verso ─────────────────────────────────────────────
function SideSlot({
  side, entry, accept, maxMb, readOnly, onPick, onRemove,
}: {
  side: Side
  entry?: UploadEntry
  accept: string
  maxMb: number
  readOnly?: boolean
  onPick: (file: File) => void
  onRemove: (id: string) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const label = side === 'recto' ? 'Recto (devant)' : 'Verso (derrière)'
  const busy = entry && (entry.status === 'uploading' || entry.status === 'checking')
  const err = entry?.status === 'error'
  const warn = entry?.readable === 'poor' || entry?.readable === 'unreadable'
  const done = entry?.status === 'done'
  const borderColor = err ? '#DC2626' : warn ? '#D97706' : done ? '#15803D' : '#EAB308'

  return (
    <div style={{
      flex: '1 1 180px', minWidth: 160,
      border: `1.5px ${entry ? 'solid' : 'dashed'} ${borderColor}`,
      borderRadius: 10, padding: 12,
      background: done ? '#F0FDF4' : err ? '#FEF2F2' : warn ? '#FFFBEB' : '#FEFCE8',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: '#1C1A14', letterSpacing: 0.2 }}>
        {label}
      </div>
      {entry ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {busy
            ? <Loader2 size={14} className="animate-spin" style={{ color: '#A16207', flexShrink: 0 }} />
            : err || warn
              ? <AlertTriangle size={14} style={{ color: err ? '#DC2626' : '#D97706', flexShrink: 0 }} />
              : <Check size={14} style={{ color: '#15803D', flexShrink: 0 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 12, fontWeight: 600, color: '#1C1A14',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{entry.name}</div>
            <div style={{ fontSize: 10.5, color: '#6B7280' }}>
              {entry.status === 'uploading' && 'Envoi…'}
              {entry.status === 'checking' && 'Vérification…'}
              {entry.status === 'error' && (entry.error || 'Erreur')}
              {entry.status === 'done' && (
                <>{formatSize(entry.size)}{entry.expiryDate && <> · expire le {formatDate(entry.expiryDate)}</>}</>
              )}
            </div>
          </div>
          {!readOnly && !busy && (
            <button
              type="button"
              onClick={() => onRemove(entry.id)}
              title="Retirer"
              style={{
                width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280',
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>
      ) : readOnly ? (
        <div style={{ fontSize: 11.5, color: '#9CA3AF', fontStyle: 'italic' }}>Non chargé</div>
      ) : (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f); if (inputRef.current) inputRef.current.value = '' }}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '9px 10px', width: '100%',
              background: '#fff', border: '1.5px dashed #EAB308', borderRadius: 8,
              cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 12.5, fontWeight: 700, color: '#A16207',
            }}
          >
            <Camera size={15} />
            Prendre / choisir
          </button>
        </>
      )}
    </div>
  )
}

// ─── Ligne de fichier (mode simple) ─────────────────────────────────────────
function FileRow({
  entry, readOnly, onRemove,
}: {
  entry: UploadEntry
  readOnly?: boolean
  onRemove: (id: string) => void
}) {
  const busy = entry.status === 'uploading' || entry.status === 'checking'
  const err = entry.status === 'error'
  const warn = entry.readable === 'poor' || entry.readable === 'unreadable'
  const borderColor = err ? '#DC2626' : warn ? '#D97706' : entry.status === 'done' ? '#15803D' : '#D1D5DB'
  const bg = err ? '#FEF2F2' : warn ? '#FFFBEB' : entry.status === 'done' ? '#F0FDF4' : '#F9FAFB'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 10px', borderRadius: 8,
      border: `1.5px solid ${borderColor}`, background: bg,
    }}>
      {busy
        ? <Loader2 size={15} className="animate-spin" style={{ color: '#A16207', flexShrink: 0 }} />
        : err || warn
          ? <AlertTriangle size={15} style={{ color: err ? '#DC2626' : '#D97706', flexShrink: 0 }} />
          : <Check size={15} style={{ color: '#15803D', flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12.5, fontWeight: 600, color: '#1C1A14',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{entry.name}</div>
        <div style={{ fontSize: 11, color: '#6B7280' }}>
          {entry.status === 'uploading' && 'Envoi en cours…'}
          {entry.status === 'checking' && 'Vérification…'}
          {entry.status === 'error' && (entry.error || 'Erreur')}
          {entry.status === 'done' && (
            <>{formatSize(entry.size)}{entry.expiryDate && <> · expire le {formatDate(entry.expiryDate)}</>}</>
          )}
        </div>
      </div>
      {!readOnly && !busy && (
        <button
          type="button"
          onClick={() => onRemove(entry.id)}
          title="Retirer ce fichier"
          style={{
            width: 26, height: 26, borderRadius: 6, flexShrink: 0,
            border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280',
          }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}

// ─── Bouton de sélection de fichier (mode simple) ───────────────────────────
function FilePicker({
  accept, multiple, maxMb, label, hint, onPick,
}: {
  accept: string
  multiple: boolean
  maxMb: number
  label: string
  hint: string
  onPick: (files: File[]) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={e => {
          const list = e.target.files ? Array.from(e.target.files) : []
          if (list.length > 0) onPick(multiple ? list : list.slice(0, 1))
          if (inputRef.current) inputRef.current.value = ''
        }}
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
        {label}
      </button>
      <div style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'center' }}>
        <FileText size={10} style={{ display: 'inline', verticalAlign: -1, marginRight: 3 }} />
        {hint}
      </div>
    </>
  )
}

// ─── Bandeau lisibilité — NON-BLOQUANT ──────────────────────────────────────
function ReadabilityBanner() {
  return (
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
  )
}

const previewBoxStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '11px 13px', borderRadius: 8,
  background: '#FFFBEB', border: '1.5px dashed #FCD34D',
}
