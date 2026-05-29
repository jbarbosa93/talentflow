// v2.9.82 — Champ « Pointeuse » (timbrage d'une journée)
// Valeur stockée dans field_values[field.id] :
//   { start?: 'HH:MM', end?: 'HH:MM', pauses?: [{from,to}], startGps?, endGps? }
// Total = (Fin − Début) − Σ pauses. GPS capturé sur Début/Fin (au clic « Maintenant »).
// Saisie manuelle possible à tout moment (le bouton « Maintenant » est un raccourci).
'use client'

import { useState } from 'react'
import { pointageHours, formatHours, type PointageValue, type PointagePause, type GpsPoint } from '@/lib/sign/pointage'

// Re-export pour ne pas casser les imports existants (`from './PointageField'`)
export { pointageHours, pointageFilled, formatHours } from '@/lib/sign/pointage'
export type { PointageValue, PointagePause, GpsPoint } from '@/lib/sign/pointage'

const GREEN = '#15803D'

export default function PointageField({
  value, onChange, captureGps,
}: {
  value: unknown
  onChange: (v: PointageValue) => void
  captureGps?: boolean
}) {
  const v: PointageValue = (value && typeof value === 'object') ? value as PointageValue : {}
  const [gpsBusy, setGpsBusy] = useState<null | 'start' | 'end'>(null)
  const update = (patch: Partial<PointageValue>) => onChange({ ...v, ...patch })

  const nowHHMM = () => {
    const d = new Date()
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const grabGps = (which: 'start' | 'end') => {
    if (!captureGps || typeof navigator === 'undefined' || !navigator.geolocation) return
    setGpsBusy(which)
    navigator.geolocation.getCurrentPosition(
      pos => {
        const g: GpsPoint = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: Math.round(pos.coords.accuracy), ts: new Date().toISOString() }
        onChange({ ...v, [which === 'start' ? 'startGps' : 'endGps']: g, [which]: v[which] || nowHHMM() })
        setGpsBusy(null)
      },
      () => setGpsBusy(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    )
  }

  const stampNow = (which: 'start' | 'end') => {
    update({ [which]: nowHHMM() } as Partial<PointageValue>)
    if (captureGps) grabGps(which)
  }

  const pauses = v.pauses || []
  const setPause = (i: number, patch: Partial<PointagePause>) => {
    const next = pauses.map((p, idx) => idx === i ? { ...p, ...patch } : p)
    update({ pauses: next })
  }
  const addPause = () => update({ pauses: [...pauses, {}] })
  const removePause = (i: number) => update({ pauses: pauses.filter((_, idx) => idx !== i) })

  const total = pointageHours(v)

  const timeInput = (val: string | undefined, on: (s: string) => void) => (
    <input
      type="time"
      value={val || ''}
      onChange={e => on(e.target.value)}
      style={{
        flex: 1, minWidth: 0, minHeight: 0, boxSizing: 'border-box',
        WebkitAppearance: 'none', appearance: 'none', margin: 0,
        padding: '10px 12px', borderRadius: 10, border: '1px solid #D1D5DB',
        background: '#fff', color: '#1C1A14', fontSize: 15, fontFamily: 'inherit',
      }}
    />
  )
  const nowBtn = (which: 'start' | 'end') => (
    <button
      type="button"
      onClick={() => stampNow(which)}
      style={{
        flexShrink: 0, padding: '10px 12px', borderRadius: 10,
        border: `1.5px solid ${GREEN}`, background: GREEN, color: '#fff',
        fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
      }}
    >
      {gpsBusy === which ? '…' : '⏱ Maintenant'}
    </button>
  )
  const gpsLine = (g?: GpsPoint) => g ? (
    <div style={{ fontSize: 10.5, color: GREEN, marginTop: 3 }}>📍 Position enregistrée (±{g.acc ?? '?'} m)</div>
  ) : (captureGps ? <div style={{ fontSize: 10.5, color: '#9CA3AF', marginTop: 3 }}>📍 GPS au clic « Maintenant »</div> : null)

  const rowLabel: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, border: '1px solid #E5E7EB', borderRadius: 12, padding: 14, background: '#FAFAF7' }}>
      {/* Début */}
      <div>
        <div style={rowLabel}>Début</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {timeInput(v.start, s => update({ start: s }))}
          {nowBtn('start')}
        </div>
        {gpsLine(v.startGps)}
      </div>

      {/* Pauses */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={rowLabel}>Pauses</span>
          <button
            type="button"
            onClick={addPause}
            style={{ padding: '5px 10px', borderRadius: 8, border: '1.5px solid #D1D5DB', background: '#fff', color: '#374151', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            + Pause
          </button>
        </div>
        {pauses.length === 0 ? (
          <div style={{ fontSize: 11.5, color: '#9CA3AF' }}>Aucune pause — clique « + Pause » si besoin.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pauses.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#9CA3AF', width: 14 }}>{i + 1}</span>
                {timeInput(p.from, s => setPause(i, { from: s }))}
                <span style={{ fontSize: 12, color: '#9CA3AF' }}>→</span>
                {timeInput(p.to, s => setPause(i, { to: s }))}
                <button
                  type="button"
                  onClick={() => removePause(i)}
                  title="Retirer cette pause"
                  style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, border: '1px solid #FCA5A5', background: '#fff', color: '#B91C1C', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fin */}
      <div>
        <div style={rowLabel}>Fin</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {timeInput(v.end, s => update({ end: s }))}
          {nowBtn('end')}
        </div>
        {gpsLine(v.endGps)}
      </div>

      {/* Total */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #E5E7EB', paddingTop: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Total travaillé</span>
        <span style={{ fontSize: 18, fontWeight: 800, color: GREEN, fontVariantNumeric: 'tabular-nums' }}>{formatHours(total)}</span>
      </div>
    </div>
  )
}
