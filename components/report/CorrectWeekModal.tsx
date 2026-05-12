'use client'

// TalentFlow Rapports — Modal correction de semaine (admin/consultant)
// v2.6.17
//
// Permet de corriger la semaine d'une submission signée par erreur.
// Le PDF est régénéré avec les nouvelles dates, 3 emails sont envoyés
// (admin/créateur + candidat + client) avec la raison saisie.

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Loader2, X, AlertTriangle, ArrowRight } from 'lucide-react'
import { listRecentWeeks, getWeekDates } from '@/lib/report/week-helpers'
import type { ReportSubmission } from '@/lib/report/types'

interface CorrectWeekModalProps {
  submission: ReportSubmission
  onClose: () => void
  onCorrected: () => void
}

export default function CorrectWeekModal({ submission, onClose, onCorrected }: CorrectWeekModalProps) {
  const currentWeek = useMemo(() => getWeekDates(submission.week_start), [submission.week_start])
  const recentWeeks = useMemo(() => listRecentWeeks(16), [])
  const eligibleWeeks = recentWeeks.filter(w => w.start !== submission.week_start)

  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(
    eligibleWeeks.find(w => w.weekNumber === currentWeek.weekNumber - 1)?.start || eligibleWeeks[0]?.start || ''
  )
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedWeek = useMemo(() => selectedWeekStart ? getWeekDates(selectedWeekStart) : null, [selectedWeekStart])

  const handleSubmit = async () => {
    if (!selectedWeekStart) { toast.error('Sélectionne une nouvelle semaine'); return }
    if (selectedWeekStart === submission.week_start) { toast.error('Sélectionne une semaine différente'); return }
    if (reason.trim().length < 10) { toast.error('La raison doit faire au moins 10 caractères'); return }
    if (reason.trim().length > 500) { toast.error('La raison doit faire moins de 500 caractères'); return }

    setSaving(true)
    try {
      const res = await fetch(`/api/admin/reports/submissions/${submission.id}/correct-week`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newWeekStart: selectedWeekStart, reason: reason.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.code === 'CONFLICT') {
          toast.error(data.error, { duration: 8000 })
        } else {
          toast.error(data.error || 'Erreur correction')
        }
        return
      }
      const sentCount = (data.recipients || []).filter((r: any) => r.ok).length
      toast.success(`Correction effectuée — ${sentCount} email${sentCount > 1 ? 's' : ''} envoyé${sentCount > 1 ? 's' : ''}`)
      onCorrected()
      onClose()
    } catch (e: any) {
      toast.error(e?.message || 'Erreur réseau')
    } finally {
      setSaving(false)
    }
  }

  if (typeof window === 'undefined') return null

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9500,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(640px, 95vw)', maxHeight: '92vh',
          background: 'var(--card)', borderRadius: 16,
          boxShadow: '0 24px 64px rgba(0,0,0,0.30)',
          border: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px 18px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{
              fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
              fontSize: 22, fontWeight: 400, margin: 0, color: 'var(--foreground)',
            }}>Corriger la semaine</h2>
            <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: '4px 0 0' }}>
              Le PDF sera régénéré et 3 emails seront envoyés (admin + candidat + client).
            </p>
          </div>
          <button onClick={onClose} style={closeBtnStyle}><X size={16} /></button>
        </div>

        {/* Body */}
        <div style={{ overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Récap actuel → cible */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: 14, borderRadius: 10,
            background: 'var(--secondary)', border: '1px solid var(--border)',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: 'var(--muted-foreground)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Semaine actuelle
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', marginTop: 2 }}>
                S{currentWeek.weekNumber} · {currentWeek.label}
              </div>
            </div>
            <ArrowRight size={18} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: 'var(--success)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Nouvelle semaine
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', marginTop: 2 }}>
                {selectedWeek ? `S${selectedWeek.weekNumber} · ${selectedWeek.label}` : '—'}
              </div>
            </div>
          </div>

          {/* Sélecteur semaine */}
          <div>
            <label style={labelStyle}>Nouvelle semaine *</label>
            <select
              value={selectedWeekStart}
              onChange={e => setSelectedWeekStart(e.target.value)}
              style={inputStyle as any}
            >
              {eligibleWeeks.map(w => (
                <option key={w.start} value={w.start}>
                  S{w.weekNumber} — {w.label}
                </option>
              ))}
            </select>
          </div>

          {/* Raison */}
          <div>
            <label style={labelStyle}>Raison de la correction * (visible dans les emails, pas sur le PDF)</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Ex: Le rapport a été déclaré par erreur en semaine 20 alors qu'il concerne la semaine 19. Correction du numéro de semaine et des dates affichées sans modification des heures déclarées."
              rows={4}
              maxLength={500}
              style={{ ...inputStyle, resize: 'vertical' as const, minHeight: 90, fontFamily: 'inherit' }}
            />
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
              <span>Min 10 caractères. Sera affichée dans les 3 emails (admin, candidat, client).</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{reason.length}/500</span>
            </div>
          </div>

          {/* Avertissement */}
          <div style={{
            background: 'rgba(245,166,35,0.10)',
            border: '1px solid rgba(245,166,35,0.35)',
            borderRadius: 10, padding: 12,
            display: 'flex', gap: 10, alignItems: 'flex-start',
            fontSize: 12.5, color: 'var(--foreground)', lineHeight: 1.55,
          }}>
            <AlertTriangle size={16} style={{ color: '#F5A623', flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong>À savoir :</strong> les signatures candidat + client sont conservées.
              Les dates affichées sur le PDF (header + cellules par jour) sont recalculées depuis la nouvelle semaine.
              La semaine actuelle (<strong>S{currentWeek.weekNumber}</strong>) sera libérée et de nouveau déclarable côté candidat.
              Si une submission existe déjà pour la semaine cible, la correction sera bloquée.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          flexShrink: 0, background: 'var(--card)',
        }}>
          <button onClick={onClose} style={secondaryBtnStyle} disabled={saving}>Annuler</button>
          <button
            onClick={handleSubmit}
            style={{
              ...primaryBtnStyle,
              background: '#F97316', borderColor: '#F97316', color: '#fff',
              boxShadow: '0 4px 12px -4px rgba(249,115,22,.45)',
              opacity: saving ? 0.7 : 1,
            }}
            disabled={saving}
          >
            {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : null}
            {saving ? 'Correction en cours…' : 'Émettre la correction'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)',
  marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box',
  background: 'var(--secondary)', border: '1px solid var(--border)',
  color: 'var(--foreground)', fontSize: 14, outline: 'none',
}

const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  height: 36, padding: '0 16px', borderRadius: 10,
  background: 'var(--primary)', border: '1.5px solid var(--primary)',
  color: '#1C1A14', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  fontFamily: 'inherit',
}

const secondaryBtnStyle: React.CSSProperties = {
  height: 36, padding: '0 14px', borderRadius: 10,
  background: 'transparent', border: '1px solid var(--border)',
  color: 'var(--foreground)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}

const closeBtnStyle: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 10,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent', border: '1px solid var(--border)',
  cursor: 'pointer', color: 'var(--muted-foreground)',
}
