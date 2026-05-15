// v2.8.6 — Modal léger pour éditer les paramètres d'un template Sign :
// nom, description, message par défaut (pré-rempli dans /sign/new quand ce
// template est sélectionné). Pour modifier les champs/positions PDF, bouton
// "Ouvrir éditeur visuel" qui redirige vers /sign/templates/{id}/edit.
'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { X, Save, Loader2, FileText } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onClose: () => void
  templateId: string
  initialName: string
  initialDescription?: string | null
  initialDefaultMessage?: string | null
  onSaved?: (patch: { name: string; description?: string; default_message?: string }) => void
}

export default function TemplateSettingsModal({
  open, onClose, templateId,
  initialName, initialDescription, initialDefaultMessage,
  onSaved,
}: Props) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription || '')
  const [defaultMessage, setDefaultMessage] = useState(initialDefaultMessage || '')
  const [saving, setSaving] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    if (open) {
      setName(initialName)
      setDescription(initialDescription || '')
      setDefaultMessage(initialDefaultMessage || '')
    }
  }, [open, initialName, initialDescription, initialDefaultMessage])

  if (!mounted || !open) return null

  const handleSave = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error('Le nom du template ne peut pas être vide')
      return
    }
    setSaving(true)
    try {
      const r = await fetch(`/api/sign/templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          description: description.trim(),
          default_message: defaultMessage.trim() || null,
        }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error || 'Erreur')
      }
      toast.success('Paramètres du template mis à jour ✓')
      onSaved?.({
        name: trimmedName,
        description: description.trim(),
        default_message: defaultMessage.trim() || undefined,
      })
      onClose()
    } catch (e: any) {
      toast.error(e.message || 'Erreur sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  const handleOpenEditor = () => {
    onClose()
    router.push(`/sign/templates/${templateId}/edit`)
  }

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(640px, 95vw)', maxHeight: '88vh',
          background: 'var(--card)', borderRadius: 16,
          boxShadow: '0 24px 64px rgba(0,0,0,0.30)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px 18px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', gap: 16,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{
              margin: 0,
              fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
              fontSize: 24, fontWeight: 400, letterSpacing: '-0.01em',
              color: 'var(--foreground)',
            }}>
              Paramètres du template
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--muted)' }}>
              Nom, description et message par défaut (pré-rempli dans chaque envoi)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{
              width: 34, height: 34, borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'transparent', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--muted)', flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="Nom du template">
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={saving}
              autoFocus
              className="neo-input"
              style={{ height: 42, fontSize: 14 }}
              placeholder="ex: Contrat de Travail"
            />
          </Field>

          <Field label="Description" hint="Description interne (non visible par les destinataires)">
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              disabled={saving}
              rows={2}
              className="neo-input"
              style={{ minHeight: 60, padding: '10px 13px', resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }}
              placeholder="Template pour les contrats de mission L-Agence"
            />
          </Field>

          <Field label="Message par défaut" hint="Pré-rempli dans le champ Message de chaque envoi qui utilise ce template. L'utilisateur peut le modifier au cas par cas.">
            <textarea
              value={defaultMessage}
              onChange={e => setDefaultMessage(e.target.value)}
              disabled={saving}
              rows={5}
              className="neo-input"
              style={{ minHeight: 110, padding: '10px 13px', resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }}
              placeholder="Bonjour, voici votre contrat à signer. Merci de signer dès que possible..."
            />
            <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--muted)' }}>
              {defaultMessage.length} caractères
            </p>
          </Field>

          {/* Bouton vers éditeur visuel */}
          <div style={{
            marginTop: 4, padding: '14px 16px',
            background: 'var(--surface-2)',
            border: '1px dashed var(--border)',
            borderRadius: 10,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <FileText size={20} style={{ color: 'var(--primary, #A16207)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>
                Éditer les champs et positions PDF
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                Ouvre l&apos;éditeur visuel (drag&drop signatures, fields, wizard)
              </div>
            </div>
            <button
              type="button"
              onClick={handleOpenEditor}
              disabled={saving}
              style={{
                padding: '8px 14px', borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--foreground)',
                fontSize: 12.5, fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              Ouvrir →
            </button>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          background: 'var(--surface)',
        }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '9px 16px', borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--foreground)',
              fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '9px 18px', borderRadius: 8,
              border: '1.5px solid var(--primary)',
              background: 'var(--primary)',
              color: '#1C1A14',
              fontSize: 13, fontWeight: 700,
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.7 : 1,
              fontFamily: 'inherit',
            }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--foreground)', marginBottom: 6, letterSpacing: '0.02em' }}>
        {label}
      </label>
      {hint && (
        <p style={{ margin: '0 0 6px', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.4 }}>{hint}</p>
      )}
      {children}
    </div>
  )
}
