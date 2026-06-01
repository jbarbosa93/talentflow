// v2.9.82 — Champ « Pointeuse » (timbrage d'une journée)
// Valeur stockée dans field_values[field.id] :
//   { start?: 'HH:MM', end?: 'HH:MM', pauses?: [{from,to}], startGps?, endGps? }
// Total = (Fin − Début) − Σ pauses. GPS capturé sur Début/Fin (au clic « Maintenant »).
// Saisie manuelle possible à tout moment (le bouton « Maintenant » est un raccourci).
'use client'

import { useState, useRef, useEffect } from 'react'
import { pointageHours, formatHours, hhmmToMin, type PointageValue, type PointagePause, type GpsPoint } from '@/lib/sign/pointage'

// Re-export pour ne pas casser les imports existants (`from './PointageField'`)
export { pointageHours, pointageFilled, formatHours } from '@/lib/sign/pointage'
export type { PointageValue, PointagePause, GpsPoint } from '@/lib/sign/pointage'

const GREEN = '#15803D'
// v2.9.88 — Motifs d'absence prédéfinis (cf. choix João). « Autre » = texte libre.
const ABSENCE_PRESETS = ['Vacances', 'Jour férié'] as const

export default function PointageField({
  value, onChange, captureGps, liveTimer,
}: {
  value: unknown
  onChange: (v: PointageValue) => void
  captureGps?: boolean
  liveTimer?: boolean
}) {
  const v: PointageValue = (value && typeof value === 'object') ? value as PointageValue : {}
  const vRef = useRef(v); vRef.current = v // toujours la valeur à jour (callbacks async GPS)
  const [gpsBusy, setGpsBusy] = useState<null | 'start' | 'end'>(null)
  // v2.10.0 — Tick pour rafraîchir le chrono LIVE (toutes les 15 s suffit pour les minutes).
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!liveTimer) return
    const id = setInterval(() => setTick(t => t + 1), 15000)
    return () => clearInterval(id)
  }, [liveTimer])
  const update = (patch: Partial<PointageValue>) => onChange({ ...v, ...patch })

  // v2.9.88 — État d'absence
  const isAbsent = !!v.absent
  const reason = v.absenceReason || ''
  const presetActive = (ABSENCE_PRESETS as readonly string[]).includes(reason) ? reason : null
  const isAutre = isAbsent && reason !== '' && !presetActive
  const [otherFocus, setOtherFocus] = useState(false)
  const showOtherInput = isAutre || otherFocus

  const setAbsent = (on: boolean) => {
    if (on) {
      // Passe en absence : on garde une trace mais 0h. Motif vide par défaut.
      onChange({ absent: true, absenceReason: reason })
    } else {
      // Retour présent : on retire les marqueurs d'absence (conserve heures si saisies)
      const { absent: _a, absenceReason: _r, ...rest } = v
      void _a; void _r
      onChange({ ...rest })
      setOtherFocus(false)
    }
  }

  const nowHHMM = () => {
    const d = new Date()
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const grabGps = (which: 'start' | 'end') => {
    if (!captureGps || typeof navigator === 'undefined' || !navigator.geolocation) return
    setGpsBusy(which)
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const g: GpsPoint = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: Math.round(pos.coords.accuracy), ts: new Date().toISOString() }
        const key = which === 'start' ? 'startGps' : 'endGps'
        // Stocke immédiatement la position (l'adresse arrive juste après).
        onChange({ ...v, [key]: g, [which]: v[which] || nowHHMM() })
        setGpsBusy(null)
        // v2.9.89 — Résout l'adresse lisible (rue + localité) via notre proxy serveur.
        try {
          const r = await fetch(`/api/geocode/reverse?lat=${g.lat}&lng=${g.lng}`)
          if (r.ok) {
            const d = await r.json() as { address?: string | null }
            if (d.address) {
              // Re-lit la valeur la plus à jour : patch l'adresse sur le point GPS,
              // sans toucher au reste (heure déjà posée, autre point, pauses…).
              const cur = vRef.current
              const prevG = (cur[key] as GpsPoint | undefined) || g
              onChange({ ...cur, [key]: { ...prevG, address: d.address } })
            }
          }
        } catch { /* adresse best-effort : on garde les coordonnées */ }
      },
      () => setGpsBusy(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    )
  }

  const stampNow = (which: 'start' | 'end') => {
    update({ [which]: nowHHMM() } as Partial<PointageValue>)
    if (captureGps) grabGps(which)
  }

  // ── v2.10.0 — Timbreuse LIVE (chrono temps réel) ──
  const pausesNow = v.pauses || []
  const openPauseIdx = pausesNow.findIndex(p => p.from && !p.to) // pause en cours
  const liveState: 'idle' | 'running' | 'paused' | 'done' =
    !v.start ? 'idle' : v.end ? 'done' : (openPauseIdx >= 0 ? 'paused' : 'running')

  const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() }
  const span = (a: number, b: number) => { let x = b - a; if (x < 0) x += 1440; return x }
  const fmtHM = (min: number) => {
    const m = Math.max(0, Math.round(min)); const h = Math.floor(m / 60)
    return h > 0 ? `${h}h${String(m % 60).padStart(2, '0')}` : `${m} min`
  }
  // Temps travaillé en direct (déduit pauses fermées + pause en cours)
  const liveWorkedMin = (() => {
    const st = hhmmToMin(v.start); if (st === null) return 0
    const n = nowMin()
    let worked = span(st, n)
    for (const p of pausesNow) {
      const f = hhmmToMin(p.from); const t = hhmmToMin(p.to)
      if (f !== null && t !== null) worked -= span(f, t)
      else if (f !== null && t === null) worked -= span(f, n) // pause en cours
    }
    return Math.max(0, worked)
  })()
  const livePauseMin = (() => {
    if (openPauseIdx < 0) return 0
    const f = hhmmToMin(pausesNow[openPauseIdx].from!); if (f === null) return 0
    return span(f, nowMin())
  })()

  const liveStart = () => stampNow('start')
  const livePause = () => update({ pauses: [...pausesNow, { from: nowHHMM() }] })
  const liveResume = () => {
    if (openPauseIdx < 0) return
    const next = pausesNow.map((p, i) => i === openPauseIdx ? { ...p, to: nowHHMM() } : p)
    update({ pauses: next })
  }
  const liveStop = () => {
    // Ferme une éventuelle pause en cours avant de terminer.
    const closed = openPauseIdx >= 0
      ? pausesNow.map((p, i) => i === openPauseIdx ? { ...p, to: nowHHMM() } : p)
      : pausesNow
    onChange({ ...v, pauses: closed, end: nowHHMM() })
    if (captureGps) grabGps('end')
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
    <div style={{ fontSize: 10.5, color: GREEN, marginTop: 3 }}>
      📍 {g.address || 'Position enregistrée'}
    </div>
  ) : (captureGps ? <div style={{ fontSize: 10.5, color: '#9CA3AF', marginTop: 3 }}>📍 {liveTimer ? 'GPS au démarrage / à la fin' : 'GPS au clic « Maintenant »'}</div> : null)

  const rowLabel: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }

  const chipBtn = (label: string, active: boolean, on: () => void) => (
    <button
      type="button"
      onClick={on}
      style={{
        padding: '7px 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
        fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
        border: active ? '1.5px solid #A16207' : '1.5px solid #D1D5DB',
        background: active ? '#FEF3C7' : '#fff',
        color: active ? '#92400E' : '#374151',
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, border: '1px solid #E5E7EB', borderRadius: 12, padding: 14, background: '#FAFAF7' }}>
      {/* v2.9.88 — Bascule Présent / Absent */}
      <div style={{ display: 'flex', gap: 8 }}>
        {chipBtn('🟢 Présent', !isAbsent, () => setAbsent(false))}
        {chipBtn('🚫 Absent / Congé', isAbsent, () => setAbsent(true))}
      </div>

      {isAbsent ? (
        /* ── Mode absence ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={rowLabel}>Motif (optionnel — visible sur le certificat de pointage)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ABSENCE_PRESETS.map(m => chipBtn(
                m, presetActive === m,
                () => { update({ absenceReason: m }); setOtherFocus(false) },
              ))}
              {chipBtn('Autre…', showOtherInput, () => { setOtherFocus(true); if (presetActive) update({ absenceReason: '' }) })}
            </div>
          </div>
          {showOtherInput && (
            <input
              type="text"
              value={isAutre ? reason : ''}
              onChange={e => update({ absenceReason: e.target.value })}
              placeholder="Préciser la raison…"
              autoFocus
              style={{
                width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
                border: '1px solid #D1D5DB', background: '#fff', color: '#1C1A14', fontSize: 15, fontFamily: 'inherit',
              }}
            />
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #E5E7EB', paddingTop: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Total travaillé</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#A16207', fontVariantNumeric: 'tabular-nums' }}>0 h{reason ? ` · ${reason}` : ''}</span>
          </div>
        </div>
      ) : (<>
      {/* v2.10.0 — Timbreuse LIVE (chrono) */}
      {liveTimer && (
        <div style={{ borderRadius: 12, border: '1.5px solid #BBF7D0', background: '#F0FDF4', padding: 12 }}>
          {liveState === 'idle' && (
            <button type="button" onClick={liveStart} style={{
              width: '100%', padding: '16px 12px', borderRadius: 12, border: 'none',
              background: GREEN, color: '#fff', fontSize: 17, fontWeight: 800,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>▶  Démarrer ma journée</button>
          )}
          {liveState === 'running' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: '#15803D', fontWeight: 700 }}>● En cours depuis {v.start}</div>
                <div style={{ fontSize: 30, fontWeight: 800, color: '#14532D', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{fmtHM(liveWorkedMin)}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={livePause} style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1.5px solid #F59E0B', background: '#FEF3C7', color: '#92400E', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>⏸  Pause</button>
                <button type="button" onClick={liveStop} style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1.5px solid #B91C1C', background: '#DC2626', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>⏹  Terminer</button>
              </div>
            </div>
          )}
          {liveState === 'paused' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: '#92400E', fontWeight: 700 }}>⏸ En pause</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#92400E', fontVariantNumeric: 'tabular-nums' }}>{fmtHM(livePauseMin)}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={liveResume} style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: GREEN, color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>▶  Reprendre</button>
                <button type="button" onClick={liveStop} style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1.5px solid #B91C1C', background: '#DC2626', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>⏹  Terminer</button>
              </div>
            </div>
          )}
          {liveState === 'done' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: '#15803D', fontWeight: 700 }}>✓ Journée terminée ({v.start} → {v.end})</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#14532D', fontVariantNumeric: 'tabular-nums' }}>{formatHours(pointageHours(v))}</div>
            </div>
          )}
          <div style={{ fontSize: 10.5, color: '#6B7280', marginTop: 8, textAlign: 'center' }}>
            Ou corrige les heures à la main ci-dessous.
          </div>
        </div>
      )}

      {/* Début */}
      <div>
        <div style={rowLabel}>Début</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {timeInput(v.start, s => update({ start: s }))}
          {/* v2.10.2 — En mode LIVE, le chrono gère le Début → bouton « Maintenant » masqué (doublon) */}
          {!liveTimer && nowBtn('start')}
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
          {/* v2.10.2 — En mode LIVE, le chrono gère la Fin → bouton « Maintenant » masqué */}
          {!liveTimer && nowBtn('end')}
        </div>
        {gpsLine(v.endGps)}
      </div>

      {/* Total */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #E5E7EB', paddingTop: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Total travaillé</span>
        <span style={{ fontSize: 18, fontWeight: 800, color: GREEN, fontVariantNumeric: 'tabular-nums' }}>{formatHours(total)}</span>
      </div>
      </>)}
    </div>
  )
}
