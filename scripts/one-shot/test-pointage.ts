// Test du calcul de la pointeuse (heures travaillées avec pauses multiples)
import { pointageHours, pointageFilled } from '../../lib/sign/pointage'

let pass = 0, fail = 0
function check(name: string, got: number, expected: number) {
  const ok = Math.abs(got - expected) < 1e-6
  console.log(`${ok ? '✅' : '❌'} ${name} → ${got} (attendu ${expected})`); ok ? pass++ : fail++
}

check('Journée avec 1 pause (8h)',
  pointageHours({ start: '08:00', end: '17:00', pauses: [{ from: '12:00', to: '13:00' }] }), 8)

check('Sans pause (4h)', pointageHours({ start: '08:00', end: '12:00' }), 4)

check('2 pauses (7.75h)',
  pointageHours({ start: '08:00', end: '17:00', pauses: [{ from: '10:00', to: '10:15' }, { from: '12:00', to: '13:00' }] }), 7.75)

check('Passage minuit (4h)', pointageHours({ start: '22:00', end: '02:00' }), 4)

check('Incomplet sans fin (0)', pointageHours({ start: '08:00' }), 0)

check('Pause incomplète ignorée (9h)',
  pointageHours({ start: '08:00', end: '17:00', pauses: [{ from: '12:00' }] }), 9)

console.log(`\nremplie(début+fin) = ${pointageFilled({ start: '08:00', end: '17:00' })} (attendu true)`)
console.log(`remplie(début seul) = ${pointageFilled({ start: '08:00' })} (attendu false)`)
console.log(`\n${pass} OK, ${fail} échecs`)
process.exit(fail > 0 ? 1 : 0)
