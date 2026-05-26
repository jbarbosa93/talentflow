// TalentFlow Sign — Éditeur d'aide visuelle attachée à un champ (v2.9.72-73)
// Extrait en standalone v2.9.73 pour réutilisation dans TemplateEditor (Mode
// Document) ET WizardEditor (Mode Wizard).
//
// Affiche un panneau dans l'éditeur de template permettant d'attacher un
// PDF/image au champ (SignField.helpAttachment). Le candidat verra un bouton
// « ℹ️ Voir infos » à droite du label dans le wizard, qui ouvre un modal
// preview portalisé (FilePreviewModal).
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import type { SignField } from '@/lib/sign/types'

interface Props {
  templateId: string
  field: SignField
  onPatch: (patch: Partial<SignField>) => void
}

export default function FieldHelpAttachmentEditor({ templateId, field, onPatch }: Props) {
  const help = field.helpAttachment
  const [uploading, setUploading] = useState(false)

  const handleUpload = async (file: File) => {
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Fichier > 10 MB')
      return
    }
    const okMimes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
    if (!okMimes.includes(file.type)) {
      toast.error(`Type non supporté (${file.type}). Accepté : PDF, JPEG, PNG, WebP.`)
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch(`/api/sign/templates/${templateId}/help-upload`, {
        method: 'POST', body: fd,
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur upload')
      onPatch({
        helpAttachment: {
          path: d.path,
          mimeType: d.mimeType,
          fileName: d.fileName,
          buttonLabel: help?.buttonLabel,
        },
      })
      toast.success('Aide visuelle chargée')
    } catch (e) {
      console.error('[help-upload]', e)
      toast.error(e instanceof Error ? e.message : 'Erreur upload')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{
      marginTop: 10,
      padding: 12,
      border: '1px solid var(--border)',
      borderRadius: 8,
      background: 'var(--surface, var(--card))',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: '0.05em',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        💡 Aide visuelle (PDF/image)
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
        Bouton cliquable affiché à droite du label dans le wizard candidat.
        Idéal pour expliquer une option : calendrier des paiements, exemple à
        suivre, capture d&apos;écran, etc.
      </div>

      {help ? (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 10px', borderRadius: 6,
            background: 'var(--card)', border: '1px solid var(--border)',
          }}>
            <span style={{
              fontSize: 10, fontWeight: 700,
              padding: '2px 6px', borderRadius: 4,
              background: help.mimeType === 'application/pdf' ? '#FEE2E2' : '#DBEAFE',
              color: help.mimeType === 'application/pdf' ? '#991B1B' : '#1E40AF',
            }}>
              {help.mimeType === 'application/pdf' ? 'PDF' : 'IMAGE'}
            </span>
            <span style={{
              flex: 1, minWidth: 0, fontSize: 12, color: 'var(--foreground)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {help.fileName}
            </span>
            <button
              type="button"
              onClick={() => onPatch({ helpAttachment: null })}
              className="neo-btn-ghost neo-btn-sm"
              style={{ fontSize: 11, color: 'var(--destructive)' }}
            >
              Retirer
            </button>
          </div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--foreground)' }}>
            Texte du bouton (optionnel — défaut « Voir infos »)
            <input
              type="text"
              value={help.buttonLabel || ''}
              onChange={(e) => onPatch({
                helpAttachment: { ...help, buttonLabel: e.target.value || undefined },
              })}
              placeholder="Voir infos"
              maxLength={40}
              className="neo-input"
              style={{ marginTop: 4, fontSize: 12 }}
            />
          </label>
        </>
      ) : (
        <label style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          gap: 6, padding: '8px 12px', borderRadius: 6,
          border: '1px dashed var(--border)',
          background: 'var(--card)',
          fontSize: 12, fontWeight: 600, color: 'var(--foreground)',
          cursor: uploading ? 'wait' : 'pointer',
          opacity: uploading ? 0.6 : 1,
        }}>
          {uploading ? '⏳ Upload…' : '📎 Charger un PDF ou une image (10 MB max)'}
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleUpload(f)
              e.target.value = ''
            }}
            style={{ display: 'none' }}
          />
        </label>
      )}
    </div>
  )
}
