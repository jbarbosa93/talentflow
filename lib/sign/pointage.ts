// v2.9.82 — Logique PURE de la pointeuse (timbrage). Aucune dépendance React :
// importable côté serveur (pdf-stamp, field-helpers) ET côté client (PointageField).
//
// Valeur d'un champ `pointage` (stockée dans field_values[field.id]) :
//   { start?: 'HH:MM', end?: 'HH:MM', pauses?: [{from,to}], startGps?, endGps? }

export interface GpsPoint { lat: number; lng: number; acc?: number; ts?: string }
export interface PointagePause { from?: string; to?: string }
export interface PointageValue {
  start?: string
  end?: string
  pauses?: PointagePause[]
  startGps?: GpsPoint
  endGps?: GpsPoint
  // v2.9.88 — Absence : si `absent` → 0h dans le rapport. `absenceReason` (motif
  // Vacances / Jour férié / texte libre) apparaît UNIQUEMENT dans le certificat
  // de pointage annexe. Motif vide → rapport affiche simplement 0.
  absent?: boolean
  absenceReason?: string
}

const HHMM_RE = /^(\d{1,2}):(\d{2})$/
export function hhmmToMin(s?: string): number | null {
  if (!s) return null
  const m = HHMM_RE.exec(s)
  if (!m) return null
  const h = Number(m[1]); const mi = Number(m[2])
  if (h > 23 || mi > 59) return null
  return h * 60 + mi
}
function span(start: number, end: number): number { let d = end - start; if (d < 0) d += 1440; return d }

/** Heures travaillées d'une pointeuse (décimal). 0 si Début/Fin incomplet. */
export function pointageHours(value: unknown): number {
  const p = (value && typeof value === 'object') ? value as PointageValue : null
  if (!p) return 0
  if (p.absent) return 0 // v2.9.88 — jour d'absence → 0h
  const st = hhmmToMin(p.start); const en = hhmmToMin(p.end)
  if (st === null || en === null) return 0
  let pause = 0
  for (const pz of (p.pauses || [])) {
    const f = hhmmToMin(pz.from); const t = hhmmToMin(pz.to)
    if (f !== null && t !== null) pause += span(f, t)
  }
  return Math.max(0, span(st, en) - pause) / 60
}

/** Vrai si la pointeuse a au moins Début + Fin renseignés. */
export function pointageFilled(value: unknown): boolean {
  const p = (value && typeof value === 'object') ? value as PointageValue : null
  if (p?.absent) return true // v2.9.88 — jour marqué absent = jour rempli
  return !!(p && hhmmToMin(p.start) !== null && hhmmToMin(p.end) !== null)
}

/** Vrai si la valeur ressemble à une pointeuse (objet avec start/end/pauses/absent). */
export function isPointageValue(value: unknown): value is PointageValue {
  return !!value && typeof value === 'object' && ('start' in value || 'end' in value || 'pauses' in value || 'absent' in value)
}

export function formatHours(h: number): string {
  if (Math.abs(h % 1) < 1e-9) return `${h.toFixed(0)} h`
  return `${h.toFixed(2)} h`
}
