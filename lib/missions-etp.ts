// Calcul ETP Missions — source unique partagée entre /dashboard et /missions
// Évite la divergence entre les deux pages (bug v1.9.50 : dashboard ignorait weekends + absences).

export interface AbsencePeriod {
  debut: string
  fin: string
}

export interface MissionEtpInput {
  statut: string
  date_debut: string
  date_fin: string | null
  coefficient?: number | null
  absences?: AbsencePeriod[] | null
  vacances?: AbsencePeriod[] | null
  arrets?: AbsencePeriod[] | null
}

function countWorkingDays(start: Date, end: Date, feries?: Set<string>): number {
  if (start > end) return 0
  let count = 0
  const d = new Date(start)
  d.setHours(0, 0, 0, 0)
  const e = new Date(end)
  e.setHours(23, 59, 59, 999)
  while (d <= e) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (!feries?.has(key)) count++
    }
    d.setDate(d.getDate() + 1)
  }
  return count
}

function countAbsenceDays(absences: AbsencePeriod[] | null | undefined, start: Date, end: Date): number {
  if (!absences) return 0
  let total = 0
  for (const abs of absences) {
    const absStart = new Date(abs.debut)
    const absEnd = new Date(abs.fin)
    const overlapStart = absStart < start ? start : absStart
    const overlapEnd = absEnd > end ? end : absEnd
    if (overlapStart <= overlapEnd) total += countWorkingDays(overlapStart, overlapEnd)
  }
  return total
}

export function getWeekBounds(reference: Date = new Date()): { monday: Date; friday: Date } {
  const nowDow = reference.getDay()
  const mondayOffset = nowDow === 0 ? -6 : 1 - nowDow
  const monday = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() + mondayOffset)
  const friday = new Date(monday)
  friday.setDate(monday.getDate() + 4)
  return { monday, friday }
}

// Somme ETP prorata pour la semaine en cours (lun-ven), hors absences / vacances / arrêts
export function computeEtpSemaine(missions: MissionEtpInput[], reference: Date = new Date()): number {
  const todayStr = reference.toISOString().slice(0, 10)
  const { monday, friday } = getWeekBounds(reference)
  const totalWorkingDays = countWorkingDays(monday, friday)
  if (totalWorkingDays === 0) return 0

  const active = missions.filter(m =>
    m.statut === 'en_cours' && (!m.date_fin || m.date_fin >= todayStr)
  )

  return active.reduce((sum, m) => {
    const coeff = Number(m.coefficient ?? 1)
    const debut = new Date(m.date_debut)
    const fin = m.date_fin ? new Date(m.date_fin) : friday
    const effStart = debut > monday ? debut : monday
    const effEnd = fin < friday ? fin : friday
    if (effStart > effEnd) return sum
    const effDays = countWorkingDays(effStart, effEnd)
    const absDays = countAbsenceDays(m.absences, effStart, effEnd)
    const vacDays = countAbsenceDays(m.vacances, effStart, effEnd)
    const arrDays = countAbsenceDays(m.arrets, effStart, effEnd)
    const netDays = Math.max(0, effDays - absDays - vacDays - arrDays)
    return sum + coeff * (netDays / totalWorkingDays)
  }, 0)
}

// Numéro de semaine ISO 8601 (lundi = début de semaine)
export function getISOWeek(date: Date = new Date()): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}
