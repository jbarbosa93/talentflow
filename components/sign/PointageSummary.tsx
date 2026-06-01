// v2.9.89 — Récapitulatif lisible des pointages (timbrage).
// v2.9.98 — Mode `editable` : le CLIENT peut corriger les heures (widget par jour)
// quand il clique « Modifier les heures » → écrit dans editValues via onChange.
// Affiché sur la page de signature CLIENT pour valider/corriger les heures :
// par jour → Début / pauses / Fin / total + adresse GPS + zone de travail.
'use client'

import { useState } from 'react'
import type { SignField } from '@/lib/sign/types'
import { pointageHours, pointageFilled, formatHours, type PointageValue } from '@/lib/sign/pointage'
import PointageField from './PointageField'

const AMBER = '#A16207'

function dayLabel(f: SignField): string {
  return (f.wizardSection || '').trim() || (f.tooltip || '').trim() || (f.label || '').trim() || 'Jour'
}

export default function PointageSummary({
  fields, values, defaultOpen = false, editable = false, onChange,
}: {
  fields: SignField[]
  values: Record<string, unknown>
  defaultOpen?: boolean
  /** v2.9.98 — Mode correction : widgets pointeuse + zone éditables. */
  editable?: boolean
  /** v2.9.98 — Setter (fieldId, value) → editValues côté client. Requis si editable. */
  onChange?: (fieldId: string, value: unknown) => void
}) {
  const [open, setOpen] = useState(defaultOpen || editable)
  const pts = (fields || []).filter(f => f.type === 'pointage')
  if (pts.length === 0) return null

  const zoneFields = (fields || []).filter(f => f.type === 'zone')
  const zoneFieldFor = (sec: string): SignField | undefined =>
    zoneFields.find(f => (f.wizardSection || '').trim() === sec.trim())
  const zoneFor = (sec: string): string => {
    const z = zoneFieldFor(sec)
    return z && String(values[z.id] || '').trim() ? String(values[z.id]).trim() : ''
  }
  const daySections = new Set(pts.map(p => (p.wizardSection || '').trim()))
  const weekZone = zoneFields.find(f => !daySections.has((f.wizardSection || '').trim()))
  const weekZoneVal = weekZone && String(values[weekZone.id] || '').trim() ? String(values[weekZone.id]).trim() : ''

  // En lecture : seulement les jours renseignés. En édition : tous les jours (pour pouvoir corriger/ajouter).
  const dayFields = editable
    ? pts
    : pts.filter(f => {
        const v = (values[f.id] && typeof values[f.id] === 'object') ? values[f.id] as PointageValue : null
        return v && (pointageFilled(v) || v.absent)
      })
  if (dayFields.length === 0) return null

  const grand = dayFields.reduce((s, f) => s + pointageHours(values[f.id]), 0)

  return (
    <div style={{
      flexShrink: 0, margin: '12px 16px 0', border: '1px solid #FDE68A',
      borderRadius: 10, background: '#FFFBEB', overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8, padding: '11px 14px', background: 'transparent', border: 'none',
          cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 13.5, fontWeight: 700, color: '#92400E' }}>
          {editable ? '✏️ Corriger les pointages' : '🕓 Détail des pointages'}{' '}
          <span style={{ fontWeight: 500 }}>({dayFields.length} jour{dayFields.length > 1 ? 's' : ''})</span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: AMBER, fontVariantNumeric: 'tabular-nums' }}>{formatHours(grand)}</span>
          <span style={{ fontSize: 12, color: '#92400E', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
        </span>
      </button>

      {open && (
        <div style={{
          padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: editable ? 16 : 10,
          ...(editable ? { maxHeight: '58vh', overflowY: 'auto' } : {}),
        }}>
          {/* Zone hebdomadaire */}
          {weekZone && (editable ? (
            <div>
              <div style={{ fontSize: 12, color: '#92400E', fontWeight: 600, marginBottom: 4 }}>🏗 Zone de travail (semaine)</div>
              <input
                type="text"
                value={String(values[weekZone.id] || '')}
                onChange={e => onChange?.(weekZone.id, e.target.value)}
                placeholder="Zone / chantier"
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 14, fontFamily: 'inherit' }}
              />
            </div>
          ) : (weekZoneVal && (
            <div style={{ fontSize: 12, color: '#92400E', fontWeight: 600 }}>🏗 Zone de travail : <strong>{weekZoneVal}</strong></div>
          )))}

          {dayFields.map(f => {
            const pv = (values[f.id] && typeof values[f.id] === 'object') ? values[f.id] as PointageValue : {} as PointageValue
            const total = pointageHours(pv)
            const zField = zoneFieldFor(f.wizardSection || '')
            const zone = zoneFor(f.wizardSection || '')

            if (editable) {
              return (
                <div key={f.id} style={{ borderTop: '1px solid #FDE68A', paddingTop: 10 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1C1A14', marginBottom: 6 }}>{dayLabel(f)}</div>
                  <PointageField value={pv} onChange={v => onChange?.(f.id, v)} captureGps={f.captureGps} />
                  {zField && zField.wizardSection?.trim() === (f.wizardSection || '').trim() && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 11.5, color: '#92400E', fontWeight: 600, marginBottom: 3 }}>🏗 Zone du jour</div>
                      <input
                        type="text"
                        value={String(values[zField.id] || '')}
                        onChange={e => onChange?.(zField.id, e.target.value)}
                        placeholder="Zone / chantier"
                        style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 14, fontFamily: 'inherit' }}
                      />
                    </div>
                  )}
                </div>
              )
            }

            return (
              <div key={f.id} style={{ borderTop: '1px solid #FDE68A', paddingTop: 9 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#1C1A14' }}>{dayLabel(f)}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: pv.absent ? AMBER : '#15803D', fontVariantNumeric: 'tabular-nums' }}>
                    {pv.absent ? `Absent${pv.absenceReason ? ` · ${pv.absenceReason}` : ''}` : formatHours(total)}
                  </span>
                </div>
                {zone && <div style={{ fontSize: 11.5, color: '#92400E', marginTop: 2 }}>🏗 Zone : <strong>{zone}</strong></div>}
                {!pv.absent && (
                  <div style={{ fontSize: 11.5, color: '#57534E', marginTop: 3, lineHeight: 1.5 }}>
                    <div>Début : <strong>{pv.start || '—'}</strong>{pv.startGps?.address ? <span style={{ color: '#15803D' }}> · 📍 {pv.startGps.address}</span> : null}</div>
                    {(pv.pauses || []).filter(p => p.from || p.to).map((p, i) => (
                      <div key={i}>Pause {i + 1} : {p.from || '—'} → {p.to || '—'}</div>
                    ))}
                    <div>Fin : <strong>{pv.end || '—'}</strong>{pv.endGps?.address ? <span style={{ color: '#15803D' }}> · 📍 {pv.endGps.address}</span> : null}</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
