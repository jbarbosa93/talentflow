'use client'
// Modal d'édition d'une mission depuis l'app /m → PATCH /api/missions/[id]
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { X, Check, Loader2 } from 'lucide-react'

export interface EditableMission {
  id: string
  candidat_nom?: string | null
  client_nom?: string | null
  metier_display?: string | null
  date_debut?: string | null
  date_fin?: string | null
  marge_brute?: number | null
  coefficient?: number | null
  statut?: string
  notes?: string | null
}

const STATUTS = [
  { v: 'en_cours', l: 'En cours' },
  { v: 'terminee', l: 'Terminée' },
  { v: 'planifiee', l: 'Planifiée' },
  { v: 'annulee', l: 'Annulée' },
]

function toDateInput(s?: string | null): string {
  if (!s) return ''
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

export default function MMissionEditModal({ mission, onClose }: { mission: EditableMission; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    statut: mission.statut || 'en_cours',
    date_debut: toDateInput(mission.date_debut),
    date_fin: toDateInput(mission.date_fin),
    coefficient: mission.coefficient != null ? String(mission.coefficient) : '1',
    marge_brute: mission.marge_brute != null ? String(mission.marge_brute) : '',
    metier_display: mission.metier_display || '',
    notes: mission.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save() {
    setSaving(true); setError('')
    try {
      const payload = {
        statut: form.statut,
        date_debut: form.date_debut || null,
        date_fin: form.date_fin || null,
        coefficient: form.coefficient.trim() === '' ? null : Number(form.coefficient.replace(',', '.')),
        marge_brute: form.marge_brute.trim() === '' ? null : Number(form.marge_brute.replace(',', '.')),
        metier_display: form.metier_display.trim() || null,
        notes: form.notes.trim() || null,
      }
      const r = await fetch(`/api/missions/${mission.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(payload),
      })
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Échec') }
      qc.invalidateQueries({ queryKey: ['m', 'missions'] })
      qc.invalidateQueries({ queryKey: ['m', 'missions-stats'] })
      onClose()
    } catch (e: any) {
      setError(e.message || 'Erreur'); setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '11px 12px', borderRadius: 10, fontSize: 16, border: '1px solid var(--m-border, #e7e5df)', background: '#fff', color: 'inherit' }
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--m-text-soft, #6b6657)', margin: '12px 0 5px', textTransform: 'uppercase', letterSpacing: 0.3 }

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1 }} onClick={onClose} />
      <div style={{
        background: 'var(--m-bg, #FAFAF7)', borderTopLeftRadius: 20, borderTopRightRadius: 20,
        maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - 20px)', overflowY: 'auto',
        padding: '16px 16px calc(24px + env(safe-area-inset-bottom, 0px))',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Modifier la mission</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', padding: 6 }} aria-label="Fermer"><X size={22} /></button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--m-text-soft, #6b6657)' }}>
          {mission.candidat_nom || '—'}{mission.client_nom ? ` · ${mission.client_nom}` : ''}
        </div>

        <div style={labelStyle}>Statut</div>
        <select style={{ ...inputStyle, appearance: 'none', WebkitAppearance: 'none' }} value={form.statut} onChange={set('statut')}>
          {STATUTS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
        </select>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>Début</div>
            <input style={inputStyle} type="date" value={form.date_debut} onChange={set('date_debut')} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>Fin</div>
            <input style={inputStyle} type="date" value={form.date_fin} onChange={set('date_fin')} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>ETP (coefficient)</div>
            <input style={inputStyle} inputMode="decimal" value={form.coefficient} onChange={set('coefficient')} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>Marge brute</div>
            <input style={inputStyle} inputMode="decimal" value={form.marge_brute} onChange={set('marge_brute')} />
          </div>
        </div>

        <div style={labelStyle}>Métier (affiché)</div>
        <input style={inputStyle} value={form.metier_display} onChange={set('metier_display')} />

        <div style={labelStyle}>Notes</div>
        <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={form.notes} onChange={set('notes')} />

        {error && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 12 }}>{error}</div>}

        <button onClick={save} disabled={saving} className="m-btn primary full" style={{ marginTop: 18, opacity: saving ? 0.7 : 1 }}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
    </div>
  )
}
