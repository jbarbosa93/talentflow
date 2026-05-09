// TalentFlow Rapports — Tableau liste des liens permanents
// v2.3.8 — Mode liste DocuSign-style (remplace la grille de cards).
'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  Calendar, Copy, Edit3, MessageCircle, MoreVertical, Pause, Play, Trash2, User,
} from 'lucide-react'
import { REPORT_LINK_STATUS_LABELS, type ReportLink, type ReportSubmission } from '@/lib/report/types'

interface Props {
  links: ReportLink[]
  candidateNameByLink: Record<string, string>
  lastByLink: Record<string, ReportSubmission | null>
  onCopyLink?: (link: ReportLink) => void
  onSendWhatsApp?: (link: ReportLink) => void
  onPause?: (link: ReportLink) => void
  onResume?: (link: ReportLink) => void
  onRevoke?: (link: ReportLink) => void
  onDelete?: (link: ReportLink) => void
  onEdit?: (link: ReportLink) => void
}

export default function ReportLinksTable({
  links, candidateNameByLink, lastByLink,
  onCopyLink, onSendWhatsApp, onPause, onResume, onRevoke, onDelete, onEdit,
}: Props) {
  if (links.length === 0) return null

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 12,
      background: 'var(--card)',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '32px minmax(180px, 1.4fr) minmax(140px, 1fr) minmax(140px, 1fr) 110px 120px 120px',
        gap: 12,
        padding: '10px 14px',
        background: 'var(--surface-2)',
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--muted)',
        borderBottom: '1px solid var(--border)',
      }}>
        <span></span>
        <span>Candidat</span>
        <span>Client</span>
        <span>Contact client</span>
        <span>Statut</span>
        <span>Dernière</span>
        <span style={{ textAlign: 'right' }}>Actions</span>
      </div>

      {links.map(link => (
        <Row
          key={link.id}
          link={link}
          candidateName={candidateNameByLink[link.id]}
          lastSubmission={lastByLink[link.id]}
          onCopyLink={onCopyLink}
          onSendWhatsApp={onSendWhatsApp}
          onPause={onPause}
          onResume={onResume}
          onRevoke={onRevoke}
          onDelete={onDelete}
          onEdit={onEdit}
        />
      ))}
    </div>
  )
}

function Row({
  link, candidateName, lastSubmission,
  onCopyLink, onSendWhatsApp, onPause, onResume, onRevoke, onDelete, onEdit,
}: {
  link: ReportLink
  candidateName?: string | null
  lastSubmission?: ReportSubmission | null
  onCopyLink?: (link: ReportLink) => void
  onSendWhatsApp?: (link: ReportLink) => void
  onPause?: (link: ReportLink) => void
  onResume?: (link: ReportLink) => void
  onRevoke?: (link: ReportLink) => void
  onDelete?: (link: ReportLink) => void
  onEdit?: (link: ReportLink) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const isPaused = link.status === 'paused'
  const isRevoked = link.status === 'revoked'
  const headline = candidateName || link.candidat_name || link.title

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '32px minmax(180px, 1.4fr) minmax(140px, 1fr) minmax(140px, 1fr) 110px 120px 120px',
      gap: 12,
      padding: '12px 14px',
      borderBottom: '1px solid var(--border)',
      alignItems: 'center',
      opacity: isRevoked ? 0.55 : 1,
      transition: 'background 0.15s',
    }}
    onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)' }}
    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      {/* Avatar */}
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: 'var(--primary-soft)',
        color: 'var(--primary, #A16207)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <User size={14} />
      </div>

      {/* Candidat (cliquable → détail) */}
      <div style={{ minWidth: 0 }}>
        <Link
          href={`/sign/rapports/${link.id}`}
          style={{
            fontSize: 13, fontWeight: 700,
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
          fontSize: 11, color: 'var(--muted)', marginTop: 2,
          fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          /report/{link.slug}
        </div>
      </div>

      {/* Client */}
      <div style={{
        fontSize: 12.5, color: 'var(--foreground)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }} title={link.client_name || ''}>
        {link.client_name || <span style={{ color: 'var(--muted)' }}>—</span>}
      </div>

      {/* Contact client */}
      <div style={{
        fontSize: 12, color: 'var(--muted)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }} title={link.client_contact_name || ''}>
        {link.client_contact_name || <span style={{ fontStyle: 'italic' }}>—</span>}
      </div>

      {/* Statut */}
      <div>
        <StatusPill status={link.status} />
      </div>

      {/* Dernière soumission */}
      <div style={{
        fontSize: 11.5, color: 'var(--muted)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {lastSubmission
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Calendar size={10} />
              {lastSubmission.week_start.slice(5)}
            </span>
          : <span style={{ fontStyle: 'italic' }}>—</span>}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, position: 'relative' }}>
        {!isRevoked && (
          <>
            <button
              type="button"
              onClick={() => onCopyLink?.(link)}
              title="Copier le lien"
              style={iconBtn()}
            >
              <Copy size={13} />
            </button>
            <button
              type="button"
              onClick={() => onSendWhatsApp?.(link)}
              title="Envoyer WhatsApp"
              style={{ ...iconBtn(), color: '#25D366' }}
            >
              <MessageCircle size={13} />
            </button>
          </>
        )}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            title="Plus d'actions"
            style={iconBtn()}
            aria-label="Actions"
          >
            <MoreVertical size={13} />
          </button>
          {menuOpen && (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 20 }}
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
                zIndex: 25,
                minWidth: 220,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}>
                {!isRevoked && onEdit && (
                  <>
                    <MenuItem icon={<Edit3 size={13} />} onClick={() => { setMenuOpen(false); onEdit(link) }}>
                      Modifier
                    </MenuItem>
                    <div style={{ height: 1, background: 'var(--border)', margin: '4px 6px' }} />
                  </>
                )}
                {!isRevoked && (isPaused
                  ? <MenuItem icon={<Play size={13} />} onClick={() => { setMenuOpen(false); onResume?.(link) }}>Réactiver</MenuItem>
                  : <MenuItem icon={<Pause size={13} />} onClick={() => { setMenuOpen(false); onPause?.(link) }}>Mettre en pause</MenuItem>)}
                {!isRevoked && (
                  <MenuItem icon={<Trash2 size={13} />} danger onClick={() => { setMenuOpen(false); onRevoke?.(link) }}>
                    Révoquer
                  </MenuItem>
                )}
                {isRevoked && (
                  <>
                    <MenuItem icon={<Play size={13} />} onClick={() => { setMenuOpen(false); onResume?.(link) }}>
                      Réactiver le lien
                    </MenuItem>
                    <div style={{ height: 1, background: 'var(--border)', margin: '4px 6px' }} />
                    <MenuItem icon={<Trash2 size={13} />} danger onClick={() => { setMenuOpen(false); onDelete?.(link) }}>
                      Supprimer définitivement
                    </MenuItem>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
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
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 999,
      background: c.bg, color: c.color,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
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

function iconBtn(): React.CSSProperties {
  return {
    width: 28, height: 28, borderRadius: 7,
    border: '1px solid var(--border)',
    background: 'var(--card)',
    color: 'var(--muted)',
    cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'inherit',
  }
}
