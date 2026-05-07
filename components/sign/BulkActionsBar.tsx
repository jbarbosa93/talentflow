// TalentFlow Sign — Barre d'actions bulk (apparaît quand sélection ≥ 1)
// v2.2.1
'use client'

import { useState } from 'react'
import { X, Download, Ban, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  selectedIds: string[]
  onClear: () => void
  onChange: () => void
}

export default function BulkActionsBar({ selectedIds, onClear, onChange }: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  if (selectedIds.length === 0) return null
  const n = selectedIds.length

  const handleDownload = async () => {
    setBusy('download')
    try {
      const r = await fetch('/api/sign/envelopes/bulk-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      })
      if (!r.ok) {
        const d = await r.json()
        throw new Error(d.error || 'Erreur')
      }
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `signatures-${new Date().toISOString().slice(0, 10)}.zip`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(`Téléchargé`)
    } catch (e: any) { toast.error(e.message) } finally { setBusy(null) }
  }

  const handleCancel = async () => {
    if (!confirm(`Annuler ${n} enveloppe(s) ? Les destinataires ne pourront plus signer.`)) return
    setBusy('cancel')
    try {
      await Promise.all(selectedIds.map(id =>
        fetch(`/api/sign/envelopes/${id}/cancel`, { method: 'POST' })
      ))
      toast.success(`${n} enveloppe(s) annulée(s)`)
      onClear()
      onChange()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(null) }
  }

  const handleDelete = async () => {
    if (!confirm(`Supprimer définitivement ${n} enveloppe(s) ? Action irréversible.`)) return
    setBusy('delete')
    try {
      await Promise.all(selectedIds.map(id =>
        fetch(`/api/sign/envelopes/${id}`, { method: 'DELETE' })
      ))
      toast.success(`${n} enveloppe(s) supprimée(s)`)
      onClear()
      onChange()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(null) }
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 14px',
      marginBottom: 12,
      background: 'var(--primary-soft)',
      border: '1px solid rgba(245,167,35,0.35)',
      borderRadius: 12,
      boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
    }}>
      <button
        type="button"
        onClick={onClear}
        style={{
          width: 28, height: 28,
          border: 'none', background: 'transparent',
          color: 'var(--accent-foreground)', cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 6,
        }}
        title="Désélectionner"
      >
        <X size={14} />
      </button>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-foreground)' }}>
        {n} sélectionné{n > 1 ? 's' : ''}
      </span>
      <span style={{ flex: 1 }} />
      <BulkBtn icon={Download} label="Télécharger" onClick={handleDownload} loading={busy === 'download'} />
      <BulkBtn icon={Ban} label="Annuler" onClick={handleCancel} loading={busy === 'cancel'} />
      <BulkBtn icon={Trash2} label="Supprimer" onClick={handleDelete} loading={busy === 'delete'} danger />
    </div>
  )
}

function BulkBtn({
  icon: Icon, label, onClick, loading, danger,
}: {
  icon: typeof Download; label: string; onClick: () => void; loading?: boolean; danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      style={{
        padding: '7px 12px',
        background: 'var(--card)',
        border: `1px solid ${danger ? 'rgba(220,38,38,0.4)' : 'var(--border)'}`,
        borderRadius: 8,
        color: danger ? 'var(--destructive)' : 'var(--foreground)',
        fontSize: 12,
        fontWeight: 600,
        cursor: loading ? 'wait' : 'pointer',
        opacity: loading ? 0.6 : 1,
        fontFamily: 'inherit',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
      }}
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}
      {label}
    </button>
  )
}
