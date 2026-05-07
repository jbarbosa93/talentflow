// TalentFlow Sign — Timeline audit log (style v2)
// v2.2.0 — Phase 1
'use client'

import { Plus, Send, Eye, FileSignature, CheckCircle2, XCircle, Clock, Bell, ShieldCheck } from 'lucide-react'
import type { SignAuditEntry, SignAuditAction } from '@/lib/sign/types'

const ACTION_META: Record<SignAuditAction, { icon: typeof Plus; label: string; color: string }> = {
  created:   { icon: Plus,         label: 'Créée',         color: 'var(--muted)' },
  sent:      { icon: Send,         label: 'Envoyée',       color: 'var(--info)' },
  viewed:    { icon: Eye,          label: 'Consultée',     color: 'var(--info)' },
  consented: { icon: ShieldCheck,  label: 'CGU acceptées', color: 'var(--success)' },
  signed:    { icon: FileSignature,label: 'Signée',        color: 'var(--success)' },
  completed: { icon: CheckCircle2, label: 'Terminée',      color: 'var(--success)' },
  declined:  { icon: XCircle,      label: 'Refusée',       color: 'var(--destructive)' },
  expired:   { icon: Clock,        label: 'Expirée',       color: 'var(--warning)' },
  reminded:  { icon: Bell,         label: 'Rappel envoyé', color: 'var(--warning)' },
}

export default function SignAuditTimeline({ entries }: { entries: SignAuditEntry[] }) {
  if (entries.length === 0) {
    return (
      <div
        style={{
          padding: 16,
          fontSize: 13,
          color: 'var(--muted)',
          textAlign: 'center',
          fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
        }}
      >
        Aucun événement
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
      }}
    >
      {entries.map(e => {
        const meta = ACTION_META[e.action]
        const Icon = meta.icon
        return (
          <div
            key={e.id}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '10px 12px',
              border: '1px solid var(--border)',
              borderRadius: 10,
              background: 'var(--secondary)',
            }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 999,
                background: 'var(--card)',
                border: '1px solid var(--border)',
                color: meta.color,
                flexShrink: 0,
              }}
            >
              <Icon size={14} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span>{meta.label}</span>
                {/* v2.2.0 Phase 3 — Badge rôle (Signataire / Copie) si dispo dans metadata */}
                {(() => {
                  const role = (e.metadata?.role as string | undefined)?.toLowerCase()
                  if (!role) return null
                  const isCopy = role === 'copie' || role === 'cc'
                  return (
                    <span
                      style={{
                        fontSize: 9.5,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: isCopy ? 'var(--secondary)' : 'var(--info-soft)',
                        color: isCopy ? 'var(--muted)' : 'var(--info)',
                        border: `1px solid ${isCopy ? 'var(--border)' : 'var(--info-soft)'}`,
                      }}
                    >
                      {isCopy ? 'Copie' : 'Signataire'}
                    </span>
                  )
                })()}
                {e.recipient_email && (
                  <span style={{ fontWeight: 400, color: 'var(--muted)' }}>
                    · {e.recipient_email}
                  </span>
                )}
                {/* Indicateur erreur d'envoi email */}
                {e.metadata?.emailSent === false && (
                  <span style={{
                    fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                    padding: '1px 6px', borderRadius: 4,
                    background: 'var(--destructive-soft)', color: 'var(--destructive)',
                    border: '1px solid var(--destructive-soft)',
                  }}>
                    Email échoué
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--muted)',
                  marginTop: 2,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {new Date(e.created_at).toLocaleString('fr-FR', {
                  day: '2-digit', month: 'short', year: '2-digit',
                  hour: '2-digit', minute: '2-digit',
                })}
                {e.ip_address && <span style={{ marginLeft: 8 }}>· {e.ip_address}</span>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
