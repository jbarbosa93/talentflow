import { describe, it, expect } from 'vitest'
import {
  hhmmToMin,
  pointageHours,
  pauseMinutes,
  pointageWarnings,
  pointageFilled,
  isPointageValue,
  formatHours,
  type PointageValue,
} from '@/lib/sign/pointage'

describe('hhmmToMin', () => {
  it('convertit HH:MM en minutes', () => {
    expect(hhmmToMin('08:30')).toBe(510)
    expect(hhmmToMin('00:00')).toBe(0)
  })
  it('rejette les valeurs invalides', () => {
    expect(hhmmToMin('25:00')).toBeNull()
    expect(hhmmToMin('08:70')).toBeNull()
    expect(hhmmToMin('abc')).toBeNull()
    expect(hhmmToMin(undefined)).toBeNull()
  })
})

describe('pointageHours', () => {
  it('total = Fin − Début − pauses (décimal)', () => {
    const v: PointageValue = { start: '08:00', end: '17:00', pauses: [{ from: '12:00', to: '13:00' }] }
    expect(pointageHours(v)).toBe(8) // 9h − 1h pause
  })

  it('plusieurs pauses additionnées', () => {
    const v: PointageValue = {
      start: '08:00', end: '18:00',
      pauses: [{ from: '10:00', to: '10:15' }, { from: '12:00', to: '13:00' }],
    }
    expect(pointageHours(v)).toBeCloseTo(8.75, 5) // 10h − 1h15
  })

  it('Début/Fin incomplet → 0', () => {
    expect(pointageHours({ start: '08:00' })).toBe(0)
    expect(pointageHours({})).toBe(0)
    expect(pointageHours(null)).toBe(0)
    expect(pointageHours('pas un objet')).toBe(0)
  })

  it('absent → 0h (peu importe les heures saisies)', () => {
    expect(pointageHours({ absent: true, start: '08:00', end: '17:00' })).toBe(0)
  })

  it('passage minuit (équipe de nuit) : span +1440', () => {
    const v: PointageValue = { start: '22:00', end: '06:00' }
    expect(pointageHours(v)).toBe(8) // 22h → 06h = 8h
  })

  it('pause non déduite si à moitié remplie', () => {
    const v: PointageValue = { start: '08:00', end: '12:00', pauses: [{ from: '10:00' }] }
    expect(pointageHours(v)).toBe(4) // pause ignorée car incomplète
  })
})

describe('pauseMinutes', () => {
  it('durée d’une pause valide', () => {
    expect(pauseMinutes({ from: '12:00', to: '12:45' })).toBe(45)
  })
  it('null si incomplète', () => {
    expect(pauseMinutes({ from: '12:00' })).toBeNull()
    expect(pauseMinutes({})).toBeNull()
  })
})

describe('pointageWarnings', () => {
  it('pas de warning quand tout est cohérent', () => {
    expect(pointageWarnings({ start: '08:00', end: '17:00', pauses: [{ from: '12:00', to: '13:00' }] })).toEqual([])
  })

  it('pause incomplète → warning', () => {
    const w = pointageWarnings({ start: '08:00', end: '17:00', pauses: [{ from: '12:00' }] })
    expect(w.some(s => s.includes('pause'))).toBe(true)
  })

  it('pauses > temps travaillé → warning', () => {
    const w = pointageWarnings({ start: '08:00', end: '09:00', pauses: [{ from: '08:00', to: '10:00' }] })
    expect(w.some(s => s.includes('dépassent'))).toBe(true)
  })

  it('total 0h → warning', () => {
    const w = pointageWarnings({ start: '08:00', end: '08:00' })
    expect(w.some(s => s.includes('0 h'))).toBe(true)
  })

  it('absent → aucun warning', () => {
    expect(pointageWarnings({ absent: true })).toEqual([])
  })
})

describe('pointageFilled', () => {
  it('Début + Fin renseignés → true', () => {
    expect(pointageFilled({ start: '08:00', end: '17:00' })).toBe(true)
  })
  it('absent → true (jour considéré rempli)', () => {
    expect(pointageFilled({ absent: true })).toBe(true)
  })
  it('incomplet → false', () => {
    expect(pointageFilled({ start: '08:00' })).toBe(false)
    expect(pointageFilled(null)).toBe(false)
  })
})

describe('isPointageValue', () => {
  it('reconnaît un objet pointeuse', () => {
    expect(isPointageValue({ start: '08:00' })).toBe(true)
    expect(isPointageValue({ absent: true })).toBe(true)
  })
  it('rejette les autres valeurs', () => {
    expect(isPointageValue('texte')).toBe(false)
    expect(isPointageValue(null)).toBe(false)
    expect(isPointageValue({ autre: 1 })).toBe(false)
  })
})

describe('formatHours', () => {
  it('entier → "N h", décimal → "N.NN h"', () => {
    expect(formatHours(8)).toBe('8 h')
    expect(formatHours(8.75)).toBe('8.75 h')
  })
})
