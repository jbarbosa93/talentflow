// v2.13.25 — Suivi de livraison des emails client sur la fiche d'un lien rapport.
// Statut alimenté par le webhook Resend (delivered / bounced / complained).
'use client'

import { useEffect, useState } from 'react'

interface EmailLog {
  recipient: string
  email_type: string
  context: string | null
  status: string
  error: string | null
  sent_at: string
  delivered_at: string | null
}

const STATUS: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  delivered:  { label: 'Livré',        color: '#059669', bg: 'rgba(5,150,105,0.12)',  icon: '✅' },
  sent:       { label: 'Envoyé',       color: '#A16207', bg: 'rgba(161,98,7,0.12)',   icon: '📤' },
  bounced:    { label: 'Rejeté',       color: '#DC2626', bg: 'rgba(220,38,38,0.12)',  icon: '❌' },
  complained: { label: 'Marqué spam',  color: '#DC2626', bg: 'rgba(220,38,38,0.12)',  icon: '⚠️' },
  failed:     { label: 'Échec d’envoi', color: '#DC2626', bg: 'rgba(220,38,38,0.12)', icon: '🚫' },
}

function fmt(d: string): string {
  try { return new Date(d).toLocaleString('fr-CH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) }
  catch { return d }
}

export default function EmailDeliveryCard({ linkId }: { linkId: string }) {
  const [emails, setEmails] = useState<EmailLog[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/admin/reports/${linkId}/emails`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setEmails((d.emails || []) as EmailLog[]) })
      .catch(() => { if (!cancelled) setEmails([]) })
    return () => { cancelled = true }
  }, [linkId])

  if (!emails || emails.length === 0) return null

  // Dernier statut connu par destinataire (emails déjà triés sent_at DESC)
  const lastByRecipient = new Map<string, EmailLog>()
  for (const e of emails) if (!lastByRecipient.has(e.recipient)) lastByRecipient.set(e.recipient, e)
  const rows = [...lastByRecipient.values()]
  const hasProblem = rows.some(e => e.status === 'bounced' || e.status === 'complained' || e.status === 'failed')

  return (
    <div style={{
      marginTop: 14, padding: 16, borderRadius: 12,
      border: `1.5px solid ${hasProblem ? 'rgba(220,38,38,0.3)' : 'var(--border)'}`,
      background: hasProblem ? 'rgba(220,38,38,0.04)' : 'var(--card)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 10 }}>
        📧 Suivi des emails client
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(e => {
          const s = STATUS[e.status] || STATUS.sent
          return (
            <div key={e.recipient} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 999,
                background: s.bg, color: s.color, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
              }}>{s.icon} {s.label}</span>
              <span style={{ fontSize: 12.5, color: 'var(--foreground)', fontWeight: 500 }}>{e.recipient}</span>
              <span style={{ fontSize: 11.5, color: 'var(--muted)', marginLeft: 'auto' }}>
                {e.delivered_at ? `livré ${fmt(e.delivered_at)}` : `envoyé ${fmt(e.sent_at)}`}
              </span>
              {e.error && <span style={{ flexBasis: '100%', fontSize: 11, color: '#DC2626' }}>{e.error}</span>}
            </div>
          )
        })}
      </div>
      {hasProblem && (
        <div style={{ marginTop: 10, fontSize: 11.5, color: '#B91C1C', lineHeight: 1.5 }}>
          ⚠️ Un email n’a pas été livré (rejeté ou classé spam par le destinataire). Renvoie via WhatsApp,
          ou demande au client d’autoriser <strong>noreply@talent-flow.ch</strong>.
        </div>
      )}
    </div>
  )
}
