// TalentFlow Rapports — Tableau liste des liens permanents
// v2.3.8 — Mode liste DocuSign-style (remplace la grille de cards).
'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Calendar, Copy, Edit3, MessageCircle, MoreVertical, Pause, Play, Trash2, User,
} from 'lucide-react'
import { REPORT_LINK_STATUS_LABELS, type ReportLink, type ReportSubmission } from '@/lib/report/types'

// v2.13.20 — Statut de la mission liée au lien, calculé côté page liste.
// 'active' → mission en cours (affiche l'entreprise) · 'ended' → mission terminée
// ('Fin de mission') · 'none' → aucune mission liée ('Sans mission').
export type MissionStatus =
  | { kind: 'active'; clientNom: string | null }
  | { kind: 'ended'; clientNom: string | null }
  | { kind: 'none' }

export type SortKey = 'candidat' | 'client' | 'date'

interface Props {
  links: ReportLink[]
  candidateNameByLink: Record<string, string>
  lastByLink: Record<string, ReportSubmission | null>
  missionStatusByLink?: Record<string, MissionStatus>
  sortKey?: SortKey | null
  sortDir?: 'asc' | 'desc'
  onSort?: (key: SortKey) => void
  onCopyLink?: (link: ReportLink) => void
  onSendWhatsApp?: (link: ReportLink) => void
  onPause?: (link: ReportLink) => void
  onResume?: (link: ReportLink) => void
  onRevoke?: (link: ReportLink) => void
  onDelete?: (link: ReportLink) => void
  onEdit?: (link: ReportLink) => void
}

export default function ReportLinksTable({
  links, candidateNameByLink, lastByLink, missionStatusByLink,
  sortKey, sortDir, onSort,
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
        <SortHeader label="Candidat" col="candidat" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
        <SortHeader label="Client" col="client" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
        <span>Contact client</span>
        <span>Statut</span>
        <SortHeader label="Dernière" col="date" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
        <span style={{ textAlign: 'right' }}>Actions</span>
      </div>

      {links.map(link => (
        <Row
          key={link.id}
          link={link}
          candidateName={candidateNameByLink[link.id]}
          lastSubmission={lastByLink[link.id]}
          missionStatus={missionStatusByLink?.[link.id]}
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
  link, candidateName, lastSubmission, missionStatus,
  onCopyLink, onSendWhatsApp, onPause, onResume, onRevoke, onDelete, onEdit,
}: {
  link: ReportLink
  candidateName?: string | null
  lastSubmission?: ReportSubmission | null
  missionStatus?: MissionStatus
  onCopyLink?: (link: ReportLink) => void
  onSendWhatsApp?: (link: ReportLink) => void
  onPause?: (link: ReportLink) => void
  onResume?: (link: ReportLink) => void
  onRevoke?: (link: ReportLink) => void
  onDelete?: (link: ReportLink) => void
  onEdit?: (link: ReportLink) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  // v2.3.9 Bug 1 — Menu ⋮ portalisé pour échapper au container parent
  // (le tableau a overflow:hidden via borderRadius:12 → le dropdown était caché).
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const isPaused = link.status === 'paused'
  const isRevoked = link.status === 'revoked'
  const headline = candidateName || link.candidat_name || link.title

  useEffect(() => {
    if (!menuOpen || !triggerRef.current) { setMenuPos(null); return }
    const r = triggerRef.current.getBoundingClientRect()
    // v2.13.22 — Si pas assez de place sous le bouton (ligne en bas d'écran), on
    // ouvre le menu VERS LE HAUT pour qu'il ne soit plus coupé par le bas de fenêtre.
    const MENU_H = 300
    const openUp = r.bottom + MENU_H > window.innerHeight
    setMenuPos({
      top: openUp ? Math.max(8, r.top - MENU_H) : r.bottom + 4,
      right: window.innerWidth - r.right,
    })
  }, [menuOpen])

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

      {/* Client / statut mission — v2.13.20 */}
      <div style={{
        fontSize: 12.5, color: 'var(--foreground)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        <MissionCell missionStatus={missionStatus} clientNameFallback={link.client_name} />
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
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setMenuOpen(o => !o)}
          title="Plus d'actions"
          style={iconBtn()}
          aria-label="Actions"
        >
          <MoreVertical size={13} />
        </button>
        {menuOpen && menuPos && typeof document !== 'undefined' && createPortal(
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
              onClick={() => setMenuOpen(false)}
            />
            <div style={{
              position: 'fixed',
              top: menuPos.top,
              right: menuPos.right,
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
              padding: 4,
              zIndex: 9999,
              minWidth: 220,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
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
          </>,
          document.body,
        )}
      </div>
    </div>
  )
}

// v2.13.22 — En-tête de colonne cliquable pour trier (Candidat / Client / Dernière).
function SortHeader({ label, col, sortKey, sortDir, onSort }: {
  label: string
  col: SortKey
  sortKey?: SortKey | null
  sortDir?: 'asc' | 'desc'
  onSort?: (key: SortKey) => void
}) {
  if (!onSort) return <span>{label}</span>
  const active = sortKey === col
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        background: 'none', border: 'none', padding: 0, margin: 0,
        font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit',
        color: active ? 'var(--foreground)' : 'inherit',
        fontWeight: active ? 800 : 700, cursor: 'pointer',
      }}
      title={`Trier par ${label.toLowerCase()}`}
    >
      {label}
      <span style={{ fontSize: 8, opacity: active ? 1 : 0.4 }}>
        {active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </button>
  )
}

// v2.13.20 — Colonne « Client » pilotée par le statut de la mission liée.
function MissionCell({ missionStatus, clientNameFallback }: {
  missionStatus?: MissionStatus
  clientNameFallback: string | null
}) {
  // Donnée mission pas encore chargée → on garde le nom entreprise du lien (évite un flash « Sans mission »).
  if (!missionStatus) {
    return clientNameFallback
      ? <span title={clientNameFallback}>{clientNameFallback}</span>
      : <span style={{ color: 'var(--muted)' }}>—</span>
  }
  if (missionStatus.kind === 'active') {
    const label = missionStatus.clientNom || clientNameFallback
    return label
      ? <span title={label}>{label}</span>
      : <span style={{ color: 'var(--muted)' }}>—</span>
  }
  const ended = missionStatus.kind === 'ended'
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 999,
      background: ended ? 'rgba(245,158,11,0.14)' : 'var(--surface-2)',
      color: ended ? '#B45309' : 'var(--muted)',
      border: ended ? '1px solid rgba(245,158,11,0.35)' : '1px solid var(--border)',
      fontSize: 10.5, fontWeight: 700, letterSpacing: '0.03em', whiteSpace: 'nowrap',
    }}>
      {ended ? 'Fin de mission' : 'Sans mission'}
    </span>
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
