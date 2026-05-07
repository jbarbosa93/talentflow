// TalentFlow Sign — Timeline historique style DocuSign (refonte v2.2.1)
// v2.2.1
//
// Remplace SignAuditTimeline (legacy). Vertical timeline avec :
//   - Icône colorée par action
//   - Date + heure précise
//   - Email du destinataire
//   - IP si disponible
//   - Couleur : vert=completed, bleu=info, ambre=warning, rouge=error
'use client'

import {
  FileSignature, Send, Eye, FileText, CheckCircle2, Bell, XCircle,
  Clock, AlertTriangle, ShieldCheck, Ban,
} from 'lucide-react'
import type { SignAuditEntry, SignAuditAction } from '@/lib/sign/types'

interface Props {
  entries: SignAuditEntry[]
}

const ACTION_CONFIG: Record<SignAuditAction | 'cancelled', {
  label: string
  icon: typeof Send
  bg: string
  color: string
}> = {
  created:    { label: 'Enveloppe créée',          icon: FileSignature, bg: 'var(--info-soft)',        color: 'var(--info)' },
  sent:       { label: 'Envoyé par email',          icon: Send,           bg: 'var(--info-soft)',        color: 'var(--info)' },
  viewed:     { label: 'Document consulté',         icon: Eye,            bg: 'var(--surface-2)',        color: 'var(--text-2, var(--foreground))' },
  consented:  { label: 'CGU acceptées',             icon: ShieldCheck,    bg: 'var(--info-soft)',        color: 'var(--info)' },
  signed:     { label: 'Signature posée',           icon: FileText,       bg: 'var(--warning-soft)',     color: '#A16207' },
  completed:  { label: 'Tous les destinataires ont signé', icon: CheckCircle2, bg: 'var(--success-soft)', color: 'var(--success)' },
  reminded:   { label: 'Rappel envoyé',             icon: Bell,           bg: 'var(--warning-soft)',     color: '#A16207' },
  declined:   { label: 'Refusé',                    icon: XCircle,        bg: 'var(--destructive-soft)', color: 'var(--destructive)' },
  expired:    { label: 'Expiré',                    icon: Clock,          bg: 'var(--destructive-soft)', color: 'var(--destructive)' },
  cancelled:  { label: 'Enveloppe annulée',         icon: Ban,            bg: 'var(--destructive-soft)', color: 'var(--destructive)' },
}

export default function AuditTimeline({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <div style={{
        padding: 24,
        textAlign: 'center',
        color: 'var(--muted)',
        fontSize: 13,
        fontStyle: 'italic',
      }}>
        Aucun événement enregistré
      </div>
    )
  }

  // Tri desc (plus récent en haut)
  const sorted = [...entries].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return (
    <div style={{ position: 'relative', paddingLeft: 4 }}>
      {sorted.map((e, i) => (
        <TimelineEntry key={e.id} entry={e} isLast={i === sorted.length - 1} />
      ))}
    </div>
  )
}

function TimelineEntry({ entry, isLast }: { entry: SignAuditEntry; isLast: boolean }) {
  const cfg = ACTION_CONFIG[entry.action as keyof typeof ACTION_CONFIG] || {
    label: entry.action, icon: AlertTriangle,
    bg: 'var(--surface-2)', color: 'var(--muted)',
  }
  const Icon = cfg.icon
  const date = new Date(entry.created_at)
  const dateStr = date.toLocaleDateString('fr-CH', { day: '2-digit', month: 'short', year: 'numeric' })
  const timeStr = date.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ display: 'flex', gap: 12, position: 'relative', paddingBottom: isLast ? 0 : 16 }}>
      {/* Trait vertical reliant les entries */}
      {!isLast && (
        <div style={{
          position: 'absolute',
          left: 13, top: 30, bottom: 0,
          width: 1.5,
          background: 'var(--border)',
        }} />
      )}

      {/* Icon bubble */}
      <div style={{
        width: 28, height: 28,
        flexShrink: 0,
        borderRadius: 999,
        background: cfg.bg,
        color: cfg.color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
      }}>
        <Icon size={13} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
          {cfg.label}
        </div>
        {entry.recipient_email && (
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2, wordBreak: 'break-word' }}>
            {entry.recipient_email}
          </div>
        )}
        <div style={{
          fontSize: 11,
          color: 'var(--muted)',
          marginTop: 3,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          fontVariantNumeric: 'tabular-nums',
        }}>
          <span>{dateStr} · {timeStr}</span>
          {entry.ip_address && (
            <span style={{ opacity: 0.7 }}>IP {entry.ip_address}</span>
          )}
        </div>
      </div>
    </div>
  )
}
