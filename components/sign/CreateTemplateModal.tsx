// TalentFlow Sign — Modal création template (style v2)
// v2.2.0 — Phase 1
'use client'

import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, Upload, FileText, Trash2, FolderCog, GripVertical, ChevronUp, ChevronDown, Briefcase, ClipboardList, FileSignature } from 'lucide-react'
import { toast } from 'sonner'
import type { SignDocument } from '@/lib/sign/types'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (templateId: string) => void
}

/** v2.2.6 Phase 5 / v2.4.9 — Type fonctionnel choisi à la création.
 *  - 'mappe' / 'contrat' → kind='envelope' (envelope classique avec catégorie pré-remplie)
 *  - 'report' → kind='report' (rapport hebdo récurrent — apparaît dans /sign/rapports/new)
 *  v2.4.9 : label "Mappe" → "Général" pour couvrir tout type de document polyvalent.
 *  La VALUE 'mappe' reste pour cohérence avec SignCategory côté envelopes. */
type TemplateType = 'mappe' | 'contrat' | 'report'

const TYPE_OPTIONS: { value: TemplateType; label: string; description: string; icon: typeof FileText }[] = [
  { value: 'mappe',   label: 'Général',            description: 'Tout type de document (mappe, divers, multi-champs)', icon: FileText },
  { value: 'contrat', label: 'Contrat de travail', description: 'Contrat à signer par le candidat (PDF pré-signé L-Agence scanné)', icon: FileSignature },
  { value: 'report',  label: 'Rapport d\'heures',  description: 'Rapport hebdomadaire récurrent', icon: ClipboardList },
]

export default function CreateTemplateModal({ open, onClose, onCreated }: Props) {
  const [type, setType] = useState<TemplateType>('mappe')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [documents, setDocuments] = useState<SignDocument[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    setType('mappe')
    setName('')
    setDescription('')
    setDocuments([])
  }, [open])

  const handleUpload = async (file: File) => {
    if (file.type !== 'application/pdf') {
      toast.error(`"${file.name}" n'est pas un PDF`)
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error(`"${file.name}" > 50 MB`)
      return
    }

    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', 'templates')
      fd.append('ownerId', 'draft')
      // v2.8.0 — Le stamp L-Agence se fait au moment de l'ENVOI (DocumentUploader
      // sur /sign/new) et non à la création du template, pour permettre au user
      // de choisir au cas par cas (contrat brut vs contrat déjà imprimé+signé).

      const r = await fetch('/api/sign/upload', { method: 'POST', body: fd })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Erreur upload')
      setDocuments(prev => [
        ...prev,
        { name: file.name, storage_path: data.path, order: prev.length },
      ])
    } catch (e: any) {
      toast.error(`${file.name}: ${e.message || 'Erreur upload'}`)
      throw e
    }
  }

  // Upload multiple en parallèle avec progression
  const handleUploadMany = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files)
    if (arr.length === 0) return
    setUploading(true)
    let success = 0
    for (const f of arr) {
      try { await handleUpload(f); success += 1 } catch { /* déjà toasted */ }
    }
    setUploading(false)
    if (success > 0) {
      toast.success(`${success} PDF${success > 1 ? 's' : ''} ajouté${success > 1 ? 's' : ''}`)
    }
  }, [])

  // Drag & drop fichiers depuis le système (Finder)
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!dragging) setDragging(true)
  }
  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) setDragging(false)
  }
  const handleDropFiles = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const files = e.dataTransfer.files
    if (files && files.length > 0) handleUploadMany(files)
  }

  // Drag & drop pour réordonner les PDFs (HTML5 native)
  const moveDocument = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return
    setDocuments(prev => {
      const next = prev.slice()
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next.map((d, i) => ({ ...d, order: i }))
    })
  }
  const handleDragStartItem = (idx: number) => (e: React.DragEvent) => {
    setDragIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleDragOverItem = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault()
    if (dragIdx !== null && dragIdx !== idx) {
      e.dataTransfer.dropEffect = 'move'
    }
  }
  const handleDropItem = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault()
    if (dragIdx !== null && dragIdx !== idx) moveDocument(dragIdx, idx)
    setDragIdx(null)
  }
  const handleDragEndItem = () => setDragIdx(null)

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Nom requis')
      return
    }
    setSubmitting(true)
    try {
      // v2.2.6 Phase 5 — kind selon le type choisi.
      // Pour 'report', l'API pré-remplit recipients_schema avec [Candidat, Client].
      const kind: 'envelope' | 'report' = type === 'report' ? 'report' : 'envelope'
      const recipientsSchema = type === 'report'
        ? undefined  // l'API se charge du pré-remplissage Candidat+Client
        : [{ role: 'Signataire', order: 0 }]

      const r = await fetch('/api/sign/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          documents,
          recipients_schema: recipientsSchema,
          kind,
          // v2.8.0 — Persiste la catégorie fonctionnelle (mappe/contrat/report)
          template_category: type,
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Erreur')
      toast.success('Template créé')
      onCreated(data.template.id)
      onClose()
    } catch (e: any) {
      toast.error(e.message || 'Erreur création')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open || !mounted) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 640,
          width: '92%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 22px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background: 'var(--primary-soft)',
                border: '1px solid rgba(245,167,35,0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary)',
              }}
            >
              <FolderCog size={15} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--foreground)' }}>Nouveau template</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Choisis le type de document puis ajoute les PDFs
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        <div
          className="scroll-thin"
          style={{
            padding: '20px 22px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            overflowY: 'auto',
            flex: 1,
            minHeight: 0,
          }}
        >
          {/* v2.2.6 Phase 5 — Sélecteur type de document (3 cards radio) */}
          <div>
            <label style={labelStyle}>Type de document</label>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
            }}>
              {TYPE_OPTIONS.map(opt => {
                const Icon = opt.icon
                const isActive = type === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setType(opt.value)}
                    style={{
                      padding: '12px 10px',
                      border: `1px solid ${isActive ? 'var(--primary, #EAB308)' : 'var(--border)'}`,
                      borderRadius: 10,
                      background: isActive ? 'var(--primary-soft)' : 'var(--card)',
                      color: 'var(--foreground)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      textAlign: 'left',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      transition: 'all 0.15s',
                      boxShadow: isActive ? '0 2px 8px rgba(234,179,8,0.15)' : 'none',
                    }}
                  >
                    <Icon size={16} style={{ color: isActive ? 'var(--primary, #A16207)' : 'var(--muted)' }} />
                    <div style={{
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: 'var(--foreground)',
                      lineHeight: 1.2,
                    }}>
                      {opt.label}
                    </div>
                    <div style={{
                      fontSize: 10.5,
                      color: 'var(--muted)',
                      lineHeight: 1.3,
                    }}>
                      {opt.description}
                    </div>
                  </button>
                )
              })}
            </div>
            {type === 'report' && (
              <div style={{
                marginTop: 8,
                padding: '8px 12px',
                background: 'var(--info-soft)',
                borderRadius: 8,
                fontSize: 11.5,
                color: 'var(--info)',
                lineHeight: 1.5,
              }}>
                ℹ️ Ce template apparaîtra dans <strong>Rapports hebdomadaires</strong>.
                Les rôles Candidat + Client sont pré-configurés. Tu peux uploader le PDF
                directement ici ou plus tard depuis l&apos;éditeur.
              </div>
            )}
            {type === 'contrat' && (
              <div style={{
                marginTop: 8,
                padding: '8px 12px',
                background: 'var(--primary-soft)',
                borderRadius: 8,
                fontSize: 11.5,
                color: 'var(--foreground)',
                lineHeight: 1.5,
                border: '1px solid rgba(234,179,8,0.25)',
              }}>
                📄 À chaque <strong>nouvel envoi</strong> avec ce template, tu pourras
                choisir d&apos;ajouter le papier à en-tête L-Agence (logo + footer)
                sur le contrat uploadé. Pratique pour les contrats bruts non imprimés.
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle}>Nom</label>
            <input
              type="text"
              placeholder={
                type === 'report' ? 'Ex : Rapport hebdomadaire L-Agence'
                : type === 'contrat' ? 'Ex : Contrat CDI standard'
                : 'Ex : Document candidat'
              }
              value={name}
              onChange={e => setName(e.target.value)}
              className="neo-input"
            />
          </div>

          <div>
            <label style={labelStyle}>Description (optionnel)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="neo-input"
              style={{ height: 'auto', padding: '10px 13px', minHeight: 60, resize: 'vertical' }}
            />
          </div>

          <div>
            <label style={labelStyle}>Documents PDF</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {documents.map((d, idx) => {
                const isDragging = dragIdx === idx
                return (
                  <div
                    key={idx}
                    draggable
                    onDragStart={handleDragStartItem(idx)}
                    onDragOver={handleDragOverItem(idx)}
                    onDrop={handleDropItem(idx)}
                    onDragEnd={handleDragEndItem}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 10px 10px 6px',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      background: 'var(--secondary)',
                      opacity: isDragging ? 0.4 : 1,
                      cursor: 'grab',
                      transition: 'opacity 0.15s, transform 0.15s',
                    }}
                  >
                    <GripVertical size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    <FileText size={14} style={{ color: 'var(--info)', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => moveDocument(idx, idx - 1)}
                      disabled={idx === 0}
                      style={{
                        width: 26, height: 26,
                        border: 'none', background: 'transparent',
                        color: 'var(--muted)',
                        cursor: idx === 0 ? 'not-allowed' : 'pointer',
                        opacity: idx === 0 ? 0.3 : 1,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      }}
                      title="Monter"
                    >
                      <ChevronUp size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveDocument(idx, idx + 1)}
                      disabled={idx === documents.length - 1}
                      style={{
                        width: 26, height: 26,
                        border: 'none', background: 'transparent',
                        color: 'var(--muted)',
                        cursor: idx === documents.length - 1 ? 'not-allowed' : 'pointer',
                        opacity: idx === documents.length - 1 ? 0.3 : 1,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      }}
                      title="Descendre"
                    >
                      <ChevronDown size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDocuments(prev => prev.filter((_, i) => i !== idx))}
                      style={{
                        width: 28, height: 28,
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        background: 'var(--card)',
                        color: 'var(--destructive)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title="Supprimer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Dropzone : drag&drop fichiers + click pour file picker */}
            <label
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDropFiles}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: documents.length === 0 ? '32px 20px' : '18px 20px',
                border: `2px dashed ${dragging ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: 10,
                background: dragging ? 'var(--primary-soft)' : 'var(--card)',
                color: dragging ? 'var(--primary)' : 'var(--muted)',
                cursor: uploading ? 'wait' : 'pointer',
                opacity: uploading ? 0.6 : 1,
                fontFamily: 'inherit',
                textAlign: 'center',
                transition: 'all 0.15s',
              }}
            >
              {uploading
                ? <Loader2 size={18} className="animate-spin" />
                : <Upload size={18} />
              }
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
                {uploading
                  ? 'Téléchargement en cours…'
                  : dragging
                    ? 'Lâchez les PDFs ici'
                    : documents.length === 0
                      ? 'Glissez vos PDFs ici ou cliquez pour parcourir'
                      : 'Ajouter d\'autres PDFs'
                }
              </span>
              {!uploading && (
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  Plusieurs fichiers acceptés · max 50 MB par fichier
                </span>
              )}
              <input
                type="file"
                accept="application/pdf"
                multiple
                style={{ display: 'none' }}
                disabled={uploading}
                onChange={e => {
                  const files = e.target.files
                  if (files && files.length > 0) handleUploadMany(files)
                  e.target.value = ''
                }}
              />
            </label>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            padding: '12px 22px 18px',
            borderTop: '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="neo-btn"
            style={{ fontSize: 13, padding: '6px 14px' }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="neo-btn-yellow"
            style={{
              fontSize: 13,
              padding: '0 16px',
              height: 38,
              opacity: submitting ? 0.7 : 1,
              cursor: submitting ? 'wait' : 'pointer',
            }}
          >
            {submitting && <Loader2 size={13} className="animate-spin" />}
            Créer le template
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--muted)',
  marginBottom: 6,
}
