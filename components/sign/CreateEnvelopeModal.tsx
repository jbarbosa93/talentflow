// TalentFlow Sign — Modal création enveloppe (style v2 : pattern modal Bulk + Message)
// v2.2.0 — Phase 1
'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, FileSignature } from 'lucide-react'
import { toast } from 'sonner'
import RecipientsEditor from './RecipientsEditor'
import type { SignCategory, SignRecipient, SignTemplate } from '@/lib/sign/types'
import { CATEGORY_LABELS } from '@/lib/sign/types'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (envelopeId: string) => void
  defaultCandidatId?: string
  defaultCandidatName?: string
  defaultCategory?: SignCategory
}

export default function CreateEnvelopeModal({
  open,
  onClose,
  onCreated,
  defaultCandidatId,
  defaultCandidatName,
  defaultCategory = 'autres',
}: Props) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<SignCategory>(defaultCategory)
  const [templateId, setTemplateId] = useState<string>('')
  const [templates, setTemplates] = useState<SignTemplate[]>([])
  const [recipients, setRecipients] = useState<SignRecipient[]>([])
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    setTitle('')
    setTemplateId('')
    setMessage('')
    setCategory(defaultCategory)
    setRecipients([
      {
        name: defaultCandidatName || '',
        email: '',
        role: 'Signataire',
        order: 0,
        status: 'pending',
        signed_at: null,
      },
    ])
    fetch('/api/sign/templates')
      .then(r => r.json())
      .then(d => setTemplates(d.templates || []))
      .catch(() => setTemplates([]))
  }, [open, defaultCandidatName, defaultCategory])

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error('Titre requis')
      return
    }
    if (recipients.length === 0 || recipients.some(r => !r.name.trim() || !r.email.trim())) {
      toast.error('Chaque destinataire doit avoir un nom et un email')
      return
    }

    setSubmitting(true)
    try {
      // 1. Crée l'enveloppe (statut draft)
      // Le 1er signataire avec un candidat lié → lie l'enveloppe au candidat
      const firstSignerWithCandidat = recipients.find(r => r.role !== 'cc' && (r as any).candidat_id)
      const candidatId = (firstSignerWithCandidat as any)?.candidat_id || defaultCandidatId || null
      // Nettoyage : retire candidat_id avant POST (pas dans le schéma sign_recipients)
      const cleanRecipients = recipients.map(({ candidat_id, ...r }: any) => r)
      const r = await fetch('/api/sign/envelopes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          template_id: templateId || null,
          candidate_id: candidatId,
          document_category: category,
          recipients: cleanRecipients,
          message: message.trim() || null,
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Erreur')
      const envelopeId = data.envelope.id

      // 2. Envoi direct (génère token + envoie email au 1er signer uniquement)
      try {
        const sendR = await fetch(`/api/sign/envelopes/${envelopeId}/send`, { method: 'POST' })
        const sendData = await sendR.json()
        if (!sendR.ok) throw new Error(sendData.error || 'Erreur envoi')
        toast.success(`✉️ Email envoyé au 1er destinataire`)
      } catch (sendErr: any) {
        toast.warning(`Enveloppe créée mais envoi échoué : ${sendErr.message || 'erreur'}`)
      }

      onCreated(envelopeId)
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
          maxWidth: 720,
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
        {/* Header */}
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
              <FileSignature size={15} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--foreground)' }}>
                Nouvelle enveloppe à signer
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {defaultCandidatName ? `Pour ${defaultCandidatName}` : 'Création + envoi par email au 1er destinataire'}
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

        {/* Body */}
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
          <Field label="Titre">
            <input
              type="text"
              placeholder="Ex : Contrat CDI — Pedro Ferreira"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="neo-input"
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Catégorie">
              <select
                value={category}
                onChange={e => setCategory(e.target.value as SignCategory)}
                className="neo-input"
              >
                {(Object.keys(CATEGORY_LABELS) as SignCategory[]).map(k => (
                  <option key={k} value={k}>
                    {CATEGORY_LABELS[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Template (optionnel)">
              <select
                value={templateId}
                onChange={e => {
                  const v = e.target.value
                  setTemplateId(v)
                  // v2.2.0 Phase 3 — Auto-fill titre depuis le nom du template
                  // si l'user n'a pas déjà tapé un titre (ou s'il avait juste le nom d'un template précédent).
                  const tpl = templates.find(t => t.id === v)
                  if (tpl) {
                    const previouslyAutoFilled = templates.some(t => t.name === title)
                    if (!title.trim() || previouslyAutoFilled) {
                      const baseTitle = defaultCandidatName
                        ? `${tpl.name} — ${defaultCandidatName}`
                        : tpl.name
                      setTitle(baseTitle)
                    }
                  }
                }}
                className="neo-input"
              >
                <option value="">— Sans template —</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Destinataires">
            <RecipientsEditor recipients={recipients} onChange={setRecipients} disabled={submitting} />
          </Field>

          <Field label="Message (optionnel)">
            <textarea
              placeholder="Message qui accompagnera l'envoi par email"
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={3}
              className="neo-input"
              style={{ height: 'auto', padding: '10px 13px', resize: 'vertical', minHeight: 80 }}
            />
          </Field>
        </div>

        {/* Footer */}
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
            Créer et envoyer
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--muted)',
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  )
}
