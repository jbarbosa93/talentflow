// v2.9.89 — Récapitulatif lisible des pointages (timbrage), read-only.
// Affiché sur la page de signature CLIENT (avant de signer) pour qu'il valide
// les heures en connaissance de cause : par jour → Début / pauses / Fin / total
// + adresse GPS résolue. Replié par défaut (n'encombre pas le flux de signature).
'use client'

import { useState } from 'react'
import type { SignField } from '@/lib/sign/types'
import { pointageHours, pointageFilled, formatHours, type PointageValue } from '@/lib/sign/pointage'

const AMBER = '#A16207'

function dayLabel(f: SignField): string {
  return (f.wizardSection || '').trim() || (f.tooltip || '').trim() || (f.label || '').trim() || 'Jour'
}

export default function PointageSummary({
  fields, values, defaultOpen = false,
}: {
  fields: SignField[]
  values: Record<string, unknown>
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const pts = (fields || []).filter(f => f.type === 'pointage')
  if (pts.length === 0) return null
  // Ne garde que les jours réellement renseignés (heures ou absence).
  const rows = pts
    .map(f => ({ f, v: (values[f.id] && typeof values[f.id] === 'object') ? values[f.id] as PointageValue : null }))
    .filter(r => r.v && (pointageFilled(r.v) || r.v.absent))
  if (rows.length === 0) return null

  const grand = rows.reduce((s, r) => s + pointageHours(r.v), 0)

  // v2.9.91 — Zone de travail : par section (jour) ou hebdo (sans section de jour).
  const zoneFields = (fields || []).filter(f => f.type === 'zone')
  const zoneFor = (sec: string): string => {
    const z = zoneFields.find(f => (f.wizardSection || '').trim() === sec.trim() && String(values[f.id] || '').trim())
    return z ? String(values[z.id]).trim() : ''
  }
  const daySections = new Set(pts.map(p => (p.wizardSection || '').trim()))
  const weekZone = zoneFields.find(f => !daySections.has((f.wizardSection || '').trim()) && String(values[f.id] || '').trim())
  const weekZoneVal = weekZone ? String(values[weekZone.id]).trim() : ''

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
          🕓 Détail des pointages <span style={{ fontWeight: 500 }}>({rows.length} jour{rows.length > 1 ? 's' : ''})</span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: AMBER, fontVariantNumeric: 'tabular-nums' }}>{formatHours(grand)}</span>
          <span style={{ fontSize: 12, color: '#92400E', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
        </span>
      </button>

      {open && (
        <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {weekZoneVal && (
            <div style={{ fontSize: 12, color: '#92400E', fontWeight: 600 }}>🏗 Zone de travail : <strong>{weekZoneVal}</strong></div>
          )}
          {rows.map(({ f, v }) => {
            const pv = v as PointageValue
            const total = pointageHours(pv)
            const zone = zoneFor(f.wizardSection || '')
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
