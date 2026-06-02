// Test de la logique « Heures travaillées » (timbrage) — computeFormulaValue worktime
import { computeFormulaValue } from '../../lib/sign/field-helpers'
import type { SignField } from '../../lib/sign/types'

function mkFormula(sourceIds: string[]): SignField {
  return {
    id: 'total', type: 'formula', page: 1, x: 0, y: 0, width: 0.1, height: 0.02,
    recipientOrder: 0, label: 'Total', source: 'manual',
    formulaOp: 'worktime', formulaSourceIds: sourceIds,
  }
}

let pass = 0, fail = 0
function check(name: string, got: number | null, expected: number) {
  const ok = got !== null && Math.abs(got - expected) < 1e-6
  console.log(`${ok ? '✅' : '❌'} ${name} → ${got} (attendu ${expected})`)
  ok ? pass++ : fail++
}

// 1) Jour normal avec pause : 08:00→17:00 moins pause 12:00→13:00 = 8h
check('Jour avec pause (8h)',
  computeFormulaValue(mkFormula(['e', 'pd', 'pf', 's']),
    { e: '08:00', pd: '12:00', pf: '13:00', s: '17:00' }), 8)

// 2) Jour SANS pause (pause vide) : 08:00→12:00 = 4h (pause non déduite)
check('Jour sans pause (4h)',
  computeFormulaValue(mkFormula(['e', 'pd', 'pf', 's']),
    { e: '08:00', pd: '', pf: '', s: '12:00' }), 4)

// 3) Passage minuit : 22:00→02:00 sans pause = 4h
check('Passage minuit (4h)',
  computeFormulaValue(mkFormula(['e', 'pd', 'pf', 's']),
    { e: '22:00', pd: '', pf: '', s: '02:00' }), 4)

// 4) Jour incomplet (pas de sortie) = 0
check('Jour incomplet (0)',
  computeFormulaValue(mkFormula(['e', 'pd', 'pf', 's']),
    { e: '08:00', pd: '', pf: '', s: '' }), 0)

// 5) Demi-heures : 08:30→12:15 = 3.75h
check('Demi-heures (3.75h)',
  computeFormulaValue(mkFormula(['e', 'pd', 'pf', 's']),
    { e: '08:30', pd: '', pf: '', s: '12:15' }), 3.75)

// 6) Total SEMAINE : Lun 8h (avec pause) + Mar 3h (sans pause) = 11h
check('Total semaine 2 jours (11h)',
  computeFormulaValue(mkFormula(['l_e', 'l_pd', 'l_pf', 'l_s', 'm_e', 'm_pd', 'm_pf', 'm_s']),
    { l_e: '08:00', l_pd: '12:00', l_pf: '13:00', l_s: '17:00',
      m_e: '09:00', m_pd: '', m_pf: '', m_s: '12:00' }), 11)

// 7) Reliquat 2 champs [Entrée, Sortie] sans pause = 09:00→17:30 = 8.5h
check('Paire E/S seule (8.5h)',
  computeFormulaValue(mkFormula(['e', 's']), { e: '09:00', s: '17:30' }), 8.5)

console.log(`\n${pass} OK, ${fail} échecs`)
process.exit(fail > 0 ? 1 : 0)
