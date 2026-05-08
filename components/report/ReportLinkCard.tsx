// TalentFlow Rapports — Card pour la liste /sign/rapports (Phase 5)
// v2.2.6
'use client'

import Link from 'next/link'
import { Calendar, Copy, MessageCircle, MoreVertical, Pause, Play, Trash2, User } from 'lucide-react'
import { useState } from 'react'
import { REPORT_LINK_STATUS_LABELS, type ReportLink, type ReportSubmission } from '@/lib/report/types'

interface Props {
  link: ReportLink
  /** v2.2.6 — Nom complet du candidat (chargé depuis link.candidat_id par le parent) */
  candidateName?: string | null
  /** Dernière submission pour afficher la semaine en cours/dernière */
  lastSubmission?: ReportSubmission | null
  /** Callbacks d'actions */
  onPause?: (link: ReportLink) => void
  onResume?: (link: ReportLink) => void
  onRevoke?: (link: ReportLink) => void
  /** v2.2.6 — Suppression définitive (uniquement révoqués) */
  onDelete?: (link: ReportLink) => void
  onCopyLink?: (link: ReportLink) => void
  onSendWhatsApp?: (link: ReportLink) => void
}

export default function ReportLinkCard({
  link, candidateName, lastSubmission, onPause, onResume, onRevoke, onDelete, onCopyLink, onSendWhatsApp,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const isPaused = link.status === 'paused'
  const isRevoked = link.status === 'revoked'

  // v2.2.6 — Nom affiché en gros : candidateName si chargé, sinon link.title
  const headline = candidateName || link.title

  return (
    <div style={{
      padding: 16,
      border: '1px solid var(--border)',
      borderRadius: 12,
      background: 'var(--card)',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      opacity: isRevoked ? 0.5 : 1,
      transition: 'opacity 0.15s, box-shadow 0.15s',
    }}>
      {/* Header : titre + statut + menu */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: 'var(--primary-soft)',
          color: 'var(--primary, #A16207)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <User size={17} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link
            href={`/sign/rapports/${link.id}`}
            style={{
              fontSize: 14.5, fontWeight: 700,
              color: 'var(--foreground)',
              textDecoration: 'none',
              display: 'block',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              lineHeight: 1.25,
            }}
            title={headline}
          >
            {headline}
          </Link>
          <div style={{
            fontSize: 11.5, color: 'var(--muted)', marginTop: 3,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {link.client_name ? `→ ${link.client_name}` : '— pas de client —'}
          </div>
        </div>
        <StatusPill status={link.status} />
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            style={{
              width: 28, height: 28, borderRadius: 7,
              border: '1px solid var(--border)', background: 'var(--card)',
              cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--muted)',
            }}
            aria-label="Actions"
          >
            <MoreVertical size={14} />
          </button>
          {menuOpen && (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 5 }}
                onClick={() => setMenuOpen(false)}
              />
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                right: 0,
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
                padding: 4,
                zIndex: 10,
                minWidth: 220,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}>
                {!isRevoked && (isPaused
                  ? <MenuItem icon={<Play size={13} />} onClick={() => { setMenuOpen(false); onResume?.(link) }}>Réactiver</MenuItem>
                  : <MenuItem icon={<Pause size={13} />} onClick={() => { setMenuOpen(false); onPause?.(link) }}>Mettre en pause</MenuItem>)}
                {!isRevoked && (
                  <MenuItem
                    icon={<Trash2 size={13} />}
                    danger
                    onClick={() => { setMenuOpen(false); onRevoke?.(link) }}
                  >
                    Révoquer
                  </MenuItem>
                )}
                {/* v2.2.6 — Lien révoqué : on propose Réactiver + Supprimer définitivement */}
                {isRevoked && (
                  <>
                    <MenuItem icon={<Play size={13} />} onClick={() => { setMenuOpen(false); onResume?.(link) }}>
                      Réactiver le lien
                    </MenuItem>
                    <div style={{ height: 1, background: 'var(--border)', margin: '4px 6px' }} />
                    <MenuItem
                      icon={<Trash2 size={13} />}
                      danger
                      onClick={() => { setMenuOpen(false); onDelete?.(link) }}
                    >
                      Supprimer définitivement
                    </MenuItem>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Slug */}
      <div style={{
        padding: '6px 10px',
        background: 'var(--surface-2)',
        borderRadius: 7,
        fontSize: 11,
        color: 'var(--muted)',
        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        /report/{link.slug}
      </div>

      {/* Dernière soumission */}
      {lastSubmission ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--muted)' }}>
          <Calendar size={11} />
          Dernière : {lastSubmission.week_start} → {lastSubmission.week_end}
        </div>
      ) : (
        <div style={{ fontSize: 11.5, color: 'var(--muted)', fontStyle: 'italic' }}>
          Aucune soumission encore
        </div>
      )}

      {/* Actions principales */}
      {!isRevoked && (
        <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
          <button
            type="button"
            onClick={() => onCopyLink?.(link)}
            style={btnStyle()}
            title="Copier le lien permanent"
          >
            <Copy size={12} />
            Copier
          </button>
          <button
            type="button"
            onClick={() => onSendWhatsApp?.(link)}
            style={btnStyle('#25D366')}
            title="Envoyer le lien par WhatsApp"
          >
            <MessageCircle size={12} />
            WhatsApp
          </button>
        </div>
      )}
    </div>
  )
}

function StatusPill({ status }: { status: ReportLink['status'] }) {
  const cfg: Record<ReportLink['status'], { bg: string; color: string }> = {
    active:  { bg: '#D1FAE5', color: '#059669' },
    paused:  { bg: '#FEF3C7', color: '#A16207' },
    revoked: { bg: '#FEE2E2', color: '#DC2626' },
  }
  const c = cfg[status]
  return (
    <span style={{
      padding: '3px 8px',
      borderRadius: 999,
      background: c.bg, color: c.color,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
      flexShrink: 0,
    }}>
      {REPORT_LINK_STATUS_LABELS[status]}
    </span>
  )
}

function MenuItem({
  children, icon, danger, onClick,
}: {
  children: React.ReactNode
  icon: React.ReactNode
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        fontSize: 12.5,
        fontWeight: 500,
        color: danger ? 'var(--destructive)' : 'var(--foreground)',
        borderRadius: 6,
        textAlign: 'left',
        fontFamily: 'inherit',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = danger ? '#FEE2E2' : 'var(--surface-2)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      {icon}
      {children}
    </button>
  )
}

function btnStyle(color?: string): React.CSSProperties {
  return {
    flex: 1,
    padding: '7px 10px',
    fontSize: 12, fontWeight: 600,
    border: '1px solid var(--border)',
    borderRadius: 7,
    background: 'var(--card)',
    color: color || 'var(--foreground)',
    cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    fontFamily: 'inherit',
  }
}
