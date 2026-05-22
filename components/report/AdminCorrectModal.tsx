// TalentFlow Rapports — Modal « Corriger le rapport » (admin) — v2.9.42
//
// L'admin modifie lui-même tous les champs d'un rapport signé :
//   - Semaine (sélecteur) + heures / repas / temps de déplacement (DailyReportTable)
//   - Raison obligatoire
//   - À l'enregistrement : PDF régénéré (signatures conservées) + envoi du PDF
//     corrigé par email au candidat et au client.
'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { AlertTriangle, Loader2, Save, Send, X as XIcon } from 'lucide-react'
import DailyReportTable from './DailyReportTable'
import { getWeekDates, listRecentWeeks } from '@/lib/report/week-helpers'
import type { SignField } from '@/lib/sign/types'
import type { ReportSubmission } from '@/lib/report/types'

interface Props {
  submission: ReportSubmission
  candidatName: string | null
  onClose: () => void
  /** Appelé après succès — le parent re-fetch les submissions. */
  onDone: () => void
}

export default function AdminCorrectModal({ submission, candidatName, onClose, onDone }: Props) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [fields, setFields] = useState<SignField[]>([])
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [weekStart, setWeekStart] = useState(submission.week_start)
  const [reason, setReason] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/admin/reports/submissions/${submission.id}/admin-correct`)
      .then(r => r.json())
      .then((d: any) => {
        if (cancelled) return
        if (!d.ok) { setLoadError(d.error || 'Chargement impossible'); setLoading(false); return }
        setFields(Array.isArray(d.fields) ? d.fields : [])
        setValues(d.fieldValues && typeof d.fieldValues === 'object' ? d.fieldValues : {})
        setWeekStart(d.weekStart || submission.week_start)
        setLoading(false)
      })
      .catch(() => { if (!cancelled) { setLoadError('Erreur réseau'); setLoading(false) } })
    return () => { cancelled = true }
  }, [submission.id])

  // Les champs date sont pilotés par le sélecteur de semaine → exclus du tableau
  // (les dates s'affichent dans l'en-tête de DailyReportTable, calculées depuis weekStart).
  const editableFields = useMemo(() => fields.filter(f => f.type !== 'date'), [fields])

  // 16 dernières semaines + la semaine actuelle du rapport si absente.
  const weekOptions = useMemo(() => {
    const recent = listRecentWeeks(16)
    if (!recent.some(w => w.start === submission.week_start)) {
      recent.push(getWeekDates(submission.week_start))
    }
    return recent
  }, [submission.week_start])

  const handleChange = (fieldId: string, value: unknown) =>
    setValues(prev => ({ ...prev, [fieldId]: value }))

  // Le rapport n'est pas encore signé par le client (en attente de sa signature).
  const clientNotSigned = submission.status === 'candidate_signed'

  const handleSave = async (clientSignInvite = false) => {
    const r = reason.trim()
    if (r.length < 5) { toast.error('Indique une raison de correction (min. 5 caractères)'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/reports/submissions/${submission.id}/admin-correct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldValues: values,
          newWeekStart: weekStart !== submission.week_start ? weekStart : undefined,
          reason: r,
          sendEmail: clientNotSigned ? false : sendEmail,
          sendClientSignInvite: clientSignInvite,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Erreur')
      if (clientSignInvite) {
        if (d.clientInvite?.ok) toast.success('Rapport corrigé — lien de signature envoyé au client')
        else toast.warning(`Rapport corrigé, mais invitation non envoyée : ${d.clientInvite?.error || 'erreur'}`)
      } else if (!clientNotSigned && sendEmail) {
        const failed = (d.emails || []).filter((e: any) => !e.ok)
        if (failed.length > 0) toast.warning(`Rapport corrigé — ${failed.length} email(s) non envoyé(s)`)
        else toast.success('Rapport corrigé — PDF envoyé par email')
      } else {
        toast.success('Rapport corrigé')
      }
      onDone()
      onClose()
    } catch (e: any) {
      toast.error(e.message || 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const content = (
    <div
      onClick={() => { if (!saving) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9500,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(980px, 97vw)', maxHeight: '93vh', overflow: 'auto',
          background: '#fff', border: '1px solid #E5E7EB',
          borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.30)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: '20px 24px 16px', borderBottom: '1px solid #E5E7EB',
          position: 'sticky', top: 0, background: '#fff', zIndex: 2,
        }}>
          <div style={{ flex: 1 }}>
            <h2 style={{
              margin: 0,
              fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
              fontSize: 23, fontWeight: 400, color: '#1C1A14', lineHeight: 1.15,
            }}>
              Corriger le rapport
            </h2>
            <div style={{ fontSize: 12.5, color: '#6B7280', marginTop: 3 }}>
              {candidatName || 'Collaborateur'} · modifie les valeurs puis enregistre
            </div>
          </div>
          <button
            type="button" onClick={onClose} disabled={saving}
            style={{
              width: 34, height: 34, borderRadius: 8, flexShrink: 0,
              border: '1px solid #E5E7EB', background: '#fff',
              cursor: saving ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
            aria-label="Fermer"
          >
            <XIcon size={16} />
          </button>
        </div>

        <div style={{ padding: 22 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 48, color: '#6B7280' }}>
              <Loader2 size={18} className="animate-spin" />
              <span style={{ fontSize: 13 }}>Chargement du rapport…</span>
            </div>
          ) : loadError ? (
            <div style={{
              padding: '14px 16px', borderRadius: 10, fontSize: 13,
              background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA',
            }}>
              {loadError}
            </div>
          ) : (
            <>
              {/* Sélecteur de semaine */}
              <label style={labelStyle}>Semaine du rapport</label>
              <select
                value={weekStart}
                onChange={e => setWeekStart(e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box', marginBottom: 16,
                  padding: '9px 12px', fontSize: 13.5, fontFamily: 'inherit',
                  border: '1px solid #E5E7EB', borderRadius: 8,
                  background: '#fff', color: '#1C1A14', cursor: 'pointer',
                }}
              >
                {weekOptions.map(w => (
                  <option key={w.start} value={w.start}>
                    S{w.weekNumber} — {w.label}
                  </option>
                ))}
              </select>

              {/* Tableau d'édition */}
              <label style={labelStyle}>Heures / repas / déplacement</label>
              <div style={{ marginBottom: 16 }}>
                <DailyReportTable
                  fields={editableFields}
                  weekStart={weekStart}
                  values={values}
                  onChange={handleChange}
                />
              </div>

              {/* Raison */}
              <label style={labelStyle}>Raison de la correction *</label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value.slice(0, 500))}
                rows={3}
                placeholder="Ex : le temps de déplacement déclaré était incorrect, corrigé à 6 min/jour."
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '10px 12px', fontSize: 13.5, fontFamily: 'inherit',
                  border: '1px solid #E5E7EB', borderRadius: 8,
                  background: '#fff', color: '#1C1A14', resize: 'vertical',
                  minHeight: 64, lineHeight: 1.5,
                }}
              />
              <div style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'right', marginTop: 4 }}>
                {reason.length}/500 — apparaît dans l'email de correction
              </div>

              {/* Option d'envoi — dépend de si le client a déjà signé */}
              {clientNotSigned ? (
                <div style={{
                  display: 'flex', gap: 8, marginTop: 14,
                  padding: '10px 12px', borderRadius: 10,
                  background: '#DBEAFE', border: '1px solid #93C5FD',
                  fontSize: 12.5, color: '#1E40AF', lineHeight: 1.5,
                }}>
                  <span style={{ flexShrink: 0 }}>ℹ️</span>
                  <span>Le client <strong>n'a pas encore signé</strong> ce rapport. Utilise « Envoyer au client pour signature » pour qu'il valide et signe la version corrigée.</span>
                </div>
              ) : (
                <label
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, marginTop: 14,
                    padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                    border: `1.5px solid ${sendEmail ? '#EAB308' : '#E5E7EB'}`,
                    background: sendEmail ? 'rgba(234,179,8,0.10)' : '#fff',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={sendEmail}
                    onChange={e => setSendEmail(e.target.checked)}
                    style={{ width: 17, height: 17, accentColor: '#EAB308', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 13, color: '#1C1A14' }}>
                    Envoyer le PDF corrigé par email au candidat <strong>et</strong> au client
                  </span>
                </label>
              )}

              {/* Avertissement */}
              <div style={{
                display: 'flex', gap: 8, marginTop: 12,
                padding: '10px 12px', borderRadius: 10,
                background: 'rgba(245,166,35,0.10)', border: '1px solid rgba(245,166,35,0.35)',
                fontSize: 12, color: '#374151', lineHeight: 1.5,
              }}>
                <AlertTriangle size={15} style={{ color: '#F5A623', flexShrink: 0, marginTop: 1 }} />
                <span>Les signatures existantes sont conservées. Le PDF est régénéré avec tes corrections — le rapport corrigé remplace le précédent.</span>
              </div>

              {/* Footer */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20, flexWrap: 'wrap' }}>
                <button type="button" onClick={onClose} disabled={saving} style={secondaryBtn}>
                  Annuler
                </button>
                {clientNotSigned ? (
                  <>
                    <button
                      type="button" onClick={() => handleSave(false)} disabled={saving}
                      style={{ ...secondaryBtn, opacity: saving ? 0.6 : 1 }}
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      Enregistrer seulement
                    </button>
                    <button
                      type="button" onClick={() => handleSave(true)} disabled={saving}
                      style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      Enregistrer + envoyer au client pour signature
                    </button>
                  </>
                ) : (
                  <button
                    type="button" onClick={() => handleSave(false)} disabled={saving}
                    style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Enregistrer la correction
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(content, document.body)
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
  color: '#6B7280', marginBottom: 6,
}

const primaryBtn: React.CSSProperties = {
  height: 38, padding: '0 16px',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
  border: '1px solid #1C1A14', borderRadius: 9,
  background: '#EAB308', color: '#1C1A14', cursor: 'pointer',
}

const secondaryBtn: React.CSSProperties = {
  height: 38, padding: '0 14px',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
  border: '1px solid #E5E7EB', borderRadius: 9,
  background: '#fff', color: '#1C1A14', cursor: 'pointer',
}
