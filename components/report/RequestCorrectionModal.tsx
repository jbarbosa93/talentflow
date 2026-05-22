// TalentFlow Rapports — Modal « Renvoyer pour correction » (v2.9.42)
//
// L'admin renvoie un rapport signé au candidat pour qu'il le corrige :
//   - Saisit une raison (obligatoire)
//   - Choisit le canal : email et/ou WhatsApp
//   - Le rapport repasse en mode modifiable (signatures effacées)
// L'email part côté serveur ; WhatsApp s'ouvre via wa.me (deep link).
'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { AlertTriangle, Loader2, Send, X as XIcon, MessageCircle } from 'lucide-react'
import { getWeekDates } from '@/lib/report/week-helpers'
import { toWhatsAppSafe } from '@/lib/report/text-format'
import type { ReportSubmission } from '@/lib/report/types'

interface Props {
  submission: ReportSubmission
  /** Slug permanent du lien candidat (/report/{slug}). */
  slug: string
  candidatName: string | null
  candidatPhone: string | null
  candidatEmail: string | null
  onClose: () => void
  /** Appelé après succès — le parent re-fetch les submissions. */
  onDone: () => void
}

export default function RequestCorrectionModal({
  submission, slug, candidatName, candidatPhone, candidatEmail, onClose, onDone,
}: Props) {
  const [reason, setReason] = useState('')
  const [sendEmail, setSendEmail] = useState(!!candidatEmail)
  const [sendWhatsApp, setSendWhatsApp] = useState(!!candidatPhone)
  const [saving, setSaving] = useState(false)
  // Phase 'whatsapp' : le reset a réussi, on propose d'ouvrir WhatsApp
  // (window.open fiable car déclenché par un clic direct, pas après un await).
  const [phase, setPhase] = useState<'form' | 'whatsapp'>('form')
  const [waUrl, setWaUrl] = useState<string>('')

  const week = getWeekDates(submission.week_start)

  const buildWaUrl = (): string => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://talent-flow.ch'
    const reportUrl = `${origin}/report/${slug}`
    const first = (candidatName || '').trim().split(/\s+/)[0]
    const raw = [
      first ? `Bonjour ${first},` : 'Bonjour,',
      '',
      `Votre rapport d'heures de la ${week.label} doit etre corrige.`,
      '',
      `Raison : ${reason.trim()}`,
      '',
      'Merci de le corriger et de le re-signer via ce lien :',
      reportUrl,
      '',
      '- L-Agence SA',
    ].join('\n')
    const msg = toWhatsAppSafe(raw)
    const digits = (candidatPhone || '').replace(/\D/g, '')
    return digits
      ? `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`
  }

  const handleConfirm = async () => {
    const r = reason.trim()
    if (r.length < 5) { toast.error('Indique une raison (min. 5 caractères)'); return }
    if (!sendEmail && !sendWhatsApp) { toast.error('Choisis au moins un canal (email ou WhatsApp)'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/reports/submissions/${submission.id}/request-correction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: r, sendEmail }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Erreur')

      if (sendEmail) {
        if (d.email?.ok) toast.success('Rapport renvoyé — email envoyé au candidat')
        else toast.warning(`Rapport renvoyé, mais email non envoyé : ${d.email?.error || 'erreur'}`)
      }
      onDone()  // refresh table en arrière-plan

      if (sendWhatsApp) {
        setWaUrl(buildWaUrl())
        setPhase('whatsapp')
      } else {
        toast.success('Rapport renvoyé pour correction')
        onClose()
      }
    } catch (e: any) {
      toast.error(e.message || 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const content = (
    <div
      onClick={() => { if (!saving) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9500,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(540px, 100%)', maxHeight: '90vh', overflow: 'auto',
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.30)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: '20px 24px 16px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ flex: 1 }}>
            <h2 style={{
              margin: 0,
              fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
              fontSize: 23, fontWeight: 400, color: 'var(--foreground)', lineHeight: 1.15,
            }}>
              Renvoyer pour correction
            </h2>
            <div style={{ fontSize: 12.5, color: 'var(--text-3, var(--muted))', marginTop: 3 }}>
              Semaine {week.weekNumber} · {week.label}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              width: 34, height: 34, borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--card)',
              cursor: saving ? 'not-allowed' : 'pointer', flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--foreground)',
            }}
            aria-label="Fermer"
          >
            <XIcon size={16} />
          </button>
        </div>

        {phase === 'form' ? (
          <div style={{ padding: 22 }}>
            <p style={{ fontSize: 13, color: 'var(--foreground)', lineHeight: 1.6, margin: '0 0 16px' }}>
              Le rapport repassera en mode <strong>modifiable</strong> : les signatures
              (candidat + client) seront effacées, mais les données déjà saisies sont
              conservées. Le candidat pourra le corriger puis le re-signer.
            </p>

            {/* Raison */}
            <label style={labelStyle}>Raison de la correction *</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value.slice(0, 500))}
              rows={4}
              placeholder="Ex : le temps de déplacement déclaré n'est pas correct, merci de le corriger."
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '10px 12px', fontSize: 13.5, fontFamily: 'inherit',
                border: '1px solid var(--border)', borderRadius: 8,
                background: 'var(--surface, var(--card))', color: 'var(--foreground)',
                resize: 'vertical', minHeight: 80, lineHeight: 1.5,
              }}
            />
            <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right', marginTop: 4 }}>
              {reason.length}/500 — visible par le candidat (email + WhatsApp)
            </div>

            {/* Canaux */}
            <label style={{ ...labelStyle, marginTop: 14 }}>Comment prévenir le candidat ?</label>
            <ChannelRow
              icon={<Send size={15} />}
              label="Par email"
              sub={candidatEmail || 'Aucun email sur le lien'}
              checked={sendEmail}
              disabled={!candidatEmail}
              onToggle={() => setSendEmail(v => !v)}
            />
            <ChannelRow
              icon={<MessageCircle size={15} />}
              label="Par WhatsApp"
              sub={candidatPhone || 'Aucun téléphone sur le lien — tu choisiras le contact'}
              checked={sendWhatsApp}
              disabled={false}
              onToggle={() => setSendWhatsApp(v => !v)}
            />

            {/* Avertissement */}
            <div style={{
              display: 'flex', gap: 8, marginTop: 14,
              padding: '10px 12px', borderRadius: 10,
              background: 'rgba(245,166,35,0.10)', border: '1px solid rgba(245,166,35,0.35)',
              fontSize: 12, color: 'var(--foreground)', lineHeight: 1.5,
            }}>
              <AlertTriangle size={15} style={{ color: '#F5A623', flexShrink: 0, marginTop: 1 }} />
              <span>Les signatures actuelles seront effacées. Le rapport devra être re-signé par le candidat puis par le client.</span>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button type="button" onClick={onClose} disabled={saving} style={secondaryBtn}>
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={saving}
                style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Renvoyer pour correction
              </button>
            </div>
          </div>
        ) : (
          // ─── Phase WhatsApp ───
          <div style={{ padding: 22 }}>
            <p style={{ fontSize: 13.5, color: 'var(--foreground)', lineHeight: 1.6, margin: '0 0 16px' }}>
              ✅ Le rapport a été renvoyé pour correction{sendEmail ? ' (email envoyé)' : ''}.
              <br />Clique ci-dessous pour envoyer le message WhatsApp au candidat.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} style={secondaryBtn}>
                Fermer
              </button>
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => { setTimeout(onClose, 400) }}
                style={{ ...primaryBtn, background: '#25D366', color: '#fff', textDecoration: 'none' }}
              >
                <MessageCircle size={14} />
                Ouvrir WhatsApp
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(content, document.body)
}

function ChannelRow({
  icon, label, sub, checked, disabled, onToggle,
}: {
  icon: React.ReactNode
  label: string
  sub: string
  checked: boolean
  disabled: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={() => { if (!disabled) onToggle() }}
      disabled={disabled}
      style={{
        width: '100%', textAlign: 'left',
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px', marginTop: 8,
        border: `1.5px solid ${checked ? '#EAB308' : 'var(--border)'}`,
        borderRadius: 10,
        background: checked ? 'rgba(234,179,8,0.10)' : 'var(--card)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: 'inherit',
      }}
    >
      <span style={{ color: 'var(--foreground)', flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>{label}</span>
        <span style={{
          display: 'block', fontSize: 11.5, color: 'var(--muted)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{sub}</span>
      </span>
      <span style={{
        width: 18, height: 18, borderRadius: 5, flexShrink: 0,
        border: `1.5px solid ${checked ? '#EAB308' : 'var(--border)'}`,
        background: checked ? '#EAB308' : 'transparent',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        color: '#1C1A14', fontSize: 12, fontWeight: 900,
      }}>
        {checked ? '✓' : ''}
      </span>
    </button>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
  color: 'var(--muted)', marginBottom: 6,
}

const primaryBtn: React.CSSProperties = {
  height: 38, padding: '0 16px',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
  border: '1px solid #1C1A14', borderRadius: 9,
  background: '#EAB308', color: '#1C1A14', cursor: 'pointer',
}

const secondaryBtn: React.CSSProperties = {
  height: 38, padding: '0 14px',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
  border: '1px solid var(--border)', borderRadius: 9,
  background: 'var(--card)', color: 'var(--foreground)', cursor: 'pointer',
}
