// TalentFlow Sign — Tableau enveloppes style DocuSign (refonte v2.2.1)
// v2.2.1
//
// Colonnes : checkbox | Nom (titre + destinataires) | État (badge + progress)
//          | Dernière modif | Actions (bouton contextuel + menu ⋮)
'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  MoreVertical, Send, Bell, Download, RotateCw, X as XIcon,
  Eye, Trash2, FileSignature, Loader2,
} from 'lucide-react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import EnvelopeStatusBadge from './EnvelopeStatusBadge'
import EnvelopeCategoryIcon from './EnvelopeCategoryIcon'
import type { SignEnvelope } from '@/lib/sign/types'

interface Props {
  envelopes: SignEnvelope[]
  selectedIds: string[]
  onToggleSelect: (id: string) => void
  onToggleAll: () => void
  onChange: () => void
}

export default function EnvelopesTable({ envelopes, selectedIds, onToggleSelect, onToggleAll, onChange }: Props) {
  if (envelopes.length === 0) {
    return (
      <div className="neo-empty" style={{ marginTop: 12 }}>
        <div className="neo-empty-icon">
          <FileSignature size={36} style={{ color: 'var(--muted)' }} />
        </div>
        <div className="neo-empty-title">Aucune enveloppe</div>
        <div className="neo-empty-sub">
          Aucun envoi ne correspond à ces filtres.
        </div>
      </div>
    )
  }

  const allSelected = selectedIds.length === envelopes.length && envelopes.length > 0
  const someSelected = selectedIds.length > 0 && !allSelected

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 14,
      overflow: 'hidden',
      background: 'var(--card)',
      boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.04))',
    }}>
      {/* Header */}
      <div style={headerRowStyle}>
        <CellCheckbox checked={allSelected} indeterminate={someSelected} onChange={onToggleAll} />
        <div style={{ ...cellStyle, flex: 1, minWidth: 0 }}>Nom</div>
        <div style={{ ...cellStyle, width: 240, flexShrink: 0 }}>État</div>
        <div style={{ ...cellStyle, width: 130, flexShrink: 0 }}>Dernière modif.</div>
        <div style={{ ...cellStyle, width: 200, flexShrink: 0, textAlign: 'right' }}>Actions</div>
      </div>

      {/* Rows */}
      {envelopes.map((env, i) => (
        <EnvelopeRow
          key={env.id}
          env={env}
          isLast={i === envelopes.length - 1}
          isSelected={selectedIds.includes(env.id)}
          onToggle={() => onToggleSelect(env.id)}
          onChange={onChange}
        />
      ))}
    </div>
  )
}

// ─── Row ────────────────────────────────────────────────────────────────
function EnvelopeRow({
  env, isLast, isSelected, onToggle, onChange,
}: {
  env: SignEnvelope; isLast: boolean; isSelected: boolean
  onToggle: () => void; onChange: () => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  // v2.9.67 — Affiche le rôle (« Candidat », « Consultant »…) à côté du nom
  // pour distinguer les destinataires de l'enveloppe d'un coup d'œil.
  const recipientNames = (env.recipients || [])
    .map(r => {
      const role = (r as { roleName?: string }).roleName
      return role ? `${r.name} (${role})` : r.name
    })
    .join(', ')
  const signedCount = (env.recipients || []).filter(r => r.status === 'signed').length
  const totalSigners = (env.recipients || []).filter(r => r.role !== 'cc').length
  const progressPct = totalSigners > 0 ? Math.round((signedCount / totalSigners) * 100) : 0
  const lastUpdate = new Date(env.updated_at || env.created_at)

  const goToDetail = () => router.push(`/sign/${env.id}`)

  // Actions
  const handleSend = async () => {
    if (!confirm('Envoyer cette enveloppe maintenant ?')) return
    setBusy('send')
    try {
      const r = await fetch(`/api/sign/envelopes/${env.id}/send`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur')
      toast.success('Enveloppe envoyée')
      onChange()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(null) }
  }
  const handleRemind = async () => {
    if (!confirm('Renvoyer un rappel aux destinataires non signés ?')) return
    setBusy('remind')
    try {
      const r = await fetch(`/api/sign/envelopes/${env.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remind' }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur')
      toast.success(`Rappel envoyé à ${d.reminded || 0} destinataire(s)`)
      onChange()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(null) }
  }
  const handleDownload = async () => {
    setBusy('download')
    try {
      const r = await fetch('/api/sign/envelopes/bulk-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [env.id] }),
      })
      if (!r.ok) {
        const d = await r.json()
        throw new Error(d.error || 'Erreur')
      }
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${env.title.replace(/[^\w\-.]/g, '_')}.zip`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e: any) { toast.error(e.message) } finally { setBusy(null) }
  }
  const handleRelaunch = async () => {
    if (!confirm('Relancer cette enveloppe ? Nouveaux tokens et nouvel envoi.')) return
    setBusy('relaunch')
    try {
      const r = await fetch(`/api/sign/envelopes/${env.id}/relaunch`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur')
      toast.success('Enveloppe relancée')
      onChange()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(null) }
  }
  const handleCancel = async () => {
    if (!confirm('Annuler cette enveloppe ? Les destinataires ne pourront plus signer.')) return
    setBusy('cancel')
    try {
      const r = await fetch(`/api/sign/envelopes/${env.id}/cancel`, { method: 'POST' })
      if (!r.ok) throw new Error('Erreur')
      toast.success('Annulée')
      onChange()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(null) }
  }
  const handleDelete = async () => {
    if (!confirm('Supprimer définitivement cette enveloppe ?')) return
    setBusy('delete')
    try {
      const r = await fetch(`/api/sign/envelopes/${env.id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Erreur')
      toast.success('Supprimée')
      onChange()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(null) }
  }

  // Bouton primary contextuel
  let primary: { label: string; icon: typeof Send; onClick: () => void; busyKey: string } | null = null
  if (env.status === 'draft') primary = { label: 'Envoyer', icon: Send, onClick: handleSend, busyKey: 'send' }
  else if (env.status === 'sent' || env.status === 'in_progress') primary = { label: 'Renvoyer', icon: Bell, onClick: handleRemind, busyKey: 'remind' }
  else if (env.status === 'completed') primary = { label: 'Télécharger', icon: Download, onClick: handleDownload, busyKey: 'download' }
  else if (env.status === 'expired' || env.status === 'declined') primary = { label: 'Relancer', icon: RotateCw, onClick: handleRelaunch, busyKey: 'relaunch' }

  const showProgress = env.status === 'sent' || env.status === 'in_progress'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        background: isSelected ? 'var(--primary-soft)' : 'transparent',
        borderBottom: isLast ? 'none' : '1px solid var(--border)',
        transition: 'background 0.15s',
        cursor: 'pointer',
      }}
      onClick={(e) => {
        // Ne route que si on a cliqué sur la cellule Nom (pas sur boutons/checkbox/menu)
        const tgt = e.target as HTMLElement
        if (tgt.closest('button') || tgt.closest('input') || tgt.closest('a')) return
        goToDetail()
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface-2)' }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
    >
      <CellCheckbox checked={isSelected} onChange={onToggle} />

      {/* Nom + destinataires */}
      <div style={{ ...cellStyle, flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
        <EnvelopeCategoryIcon category={env.document_category} size={16} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link
            href={`/sign/${env.id}`}
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: 'var(--foreground)',
              textDecoration: 'none',
              display: 'block',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {env.title}
          </Link>
          <div style={{
            fontSize: 11.5,
            color: 'var(--muted)',
            marginTop: 2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            À : {recipientNames || '—'}
          </div>
        </div>
      </div>

      {/* État + progress bar */}
      <div style={{ ...cellStyle, width: 240, flexShrink: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <EnvelopeStatusBadge status={env.status} />
          {showProgress && (
            <>
              <div style={{
                width: '100%',
                height: 4,
                background: 'var(--surface-2)',
                borderRadius: 999,
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${progressPct}%`,
                  height: '100%',
                  background: progressPct > 50 ? 'var(--success)' : 'var(--primary)',
                  transition: 'width 0.3s',
                }} />
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                {signedCount}/{totalSigners} signé{signedCount > 1 ? 's' : ''}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Dernière modification */}
      <div style={{ ...cellStyle, width: 130, flexShrink: 0 }}>
        <div style={{ fontSize: 12.5, color: 'var(--text-2, var(--foreground))', fontVariantNumeric: 'tabular-nums' }}>
          {lastUpdate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>
          {lastUpdate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {/* Actions */}
      <div style={{
        ...cellStyle,
        width: 200,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 6,
      }}>
        {primary && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); primary!.onClick() }}
            disabled={busy === primary.busyKey}
            className="neo-btn-yellow neo-btn-sm"
            style={{
              fontSize: 12,
              padding: '6px 12px',
              opacity: busy === primary.busyKey ? 0.6 : 1,
              cursor: busy === primary.busyKey ? 'wait' : 'pointer',
            }}
          >
            {busy === primary.busyKey
              ? <Loader2 size={12} className="animate-spin" />
              : <primary.icon size={12} />}
            {primary.label}
          </button>
        )}
        <ActionMenu
          envelopeId={env.id}
          envelopeStatus={env.status}
          onView={goToDetail}
          onCancel={handleCancel}
          onDelete={handleDelete}
        />
      </div>
    </div>
  )
}

// ─── ActionMenu — menu ⋮ portalisé ─────────────────────────────────────
function ActionMenu({
  envelopeId, envelopeStatus, onView, onCancel, onDelete,
}: {
  envelopeId: string
  envelopeStatus: string
  onView: () => void
  onCancel: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      const tgt = e.target as Node
      if (btnRef.current?.contains(tgt)) return
      if (menuRef.current?.contains(tgt)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: r.right - 200 })
    }
    setOpen(o => !o)
  }

  const cancellable = envelopeStatus === 'sent' || envelopeStatus === 'in_progress' || envelopeStatus === 'draft'

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        style={{
          width: 30, height: 30,
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: open ? 'var(--surface-2)' : 'var(--card)',
          color: 'var(--muted)',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title="Plus d'actions"
      >
        <MoreVertical size={14} />
      </button>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: Math.max(12, pos.left),
            width: 200,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
            padding: 4,
            zIndex: 9999,
            fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
            color: 'var(--foreground)',
          }}
          onClick={e => e.stopPropagation()}
        >
          <MenuItem icon={Eye} label="Voir le détail" onClick={() => { setOpen(false); onView() }} />
          {cancellable && (
            <MenuItem icon={XIcon} label="Annuler l'envoi" onClick={() => { setOpen(false); onCancel() }} />
          )}
          <MenuItem icon={Trash2} label="Supprimer" onClick={() => { setOpen(false); onDelete() }} danger />
        </div>,
        document.body,
      )}
    </>
  )
}

function MenuItem({
  icon: Icon, label, onClick, danger,
}: {
  icon: typeof Eye
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        border: 'none',
        background: 'transparent',
        color: danger ? 'var(--destructive)' : 'var(--foreground)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 12.5,
        textAlign: 'left',
        borderRadius: 6,
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <Icon size={13} />
      {label}
    </button>
  )
}

// ─── Cells helpers ─────────────────────────────────────────────────────
function CellCheckbox({
  checked, indeterminate, onChange,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate
  }, [indeterminate])
  return (
    <div style={{ ...cellStyle, width: 44, flexShrink: 0, padding: '12px 8px 12px 14px' }}>
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        onClick={e => e.stopPropagation()}
        style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }}
      />
    </div>
  )
}

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  background: 'var(--surface-2)',
  borderBottom: '1px solid var(--border)',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--muted)',
}

const cellStyle: React.CSSProperties = {
  padding: '12px 14px',
  fontSize: 12.5,
}
