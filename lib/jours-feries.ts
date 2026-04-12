// lib/jours-feries.ts
// Jours fériés suisses par canton

function easterDate(year: number): Date {
  // Algorithme de Meeus/Jones/Butcher
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function date(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day)
}

// Jours fériés complets par canton
const CANTON_FERIES: Record<string, (year: number) => Date[]> = {
  VS: (year) => {
    const e = easterDate(year)
    return [
      date(year, 1, 1),    // Nouvel An
      date(year, 1, 6),    // Épiphanie (Rois Mages)
      addDays(e, -2),      // Vendredi Saint
      addDays(e, 1),       // Lundi de Pâques
      addDays(e, 39),      // Ascension
      addDays(e, 50),      // Lundi de Pentecôte
      addDays(e, 60),      // Fête-Dieu (Corpus Christi)
      date(year, 8, 1),    // Fête nationale
      date(year, 8, 15),   // Assomption
      date(year, 11, 1),   // Toussaint
      date(year, 12, 8),   // Immaculée Conception
      date(year, 12, 25),  // Noël
      date(year, 12, 26),  // Saint-Étienne
    ]
  },
  VD: (year) => {
    const e = easterDate(year)
    return [
      date(year, 1, 1),    // Nouvel An
      date(year, 1, 2),    // Berchtoldstag
      addDays(e, -2),      // Vendredi Saint
      addDays(e, 1),       // Lundi de Pâques
      addDays(e, 39),      // Ascension
      addDays(e, 50),      // Lundi de Pentecôte
      date(year, 8, 1),    // Fête nationale
      date(year, 12, 25),  // Noël
      date(year, 12, 26),  // Saint-Étienne
    ]
  },
  GE: (year) => {
    const e = easterDate(year)
    // Jeûne genevois : 1er jeudi après le 1er dimanche de septembre
    const sep1 = date(year, 9, 1)
    const dow = sep1.getDay() // 0=dim
    const daysToSunday = dow === 0 ? 0 : 7 - dow
    const firstSunday = addDays(sep1, daysToSunday)
    const jeuneGenevois = addDays(firstSunday, 4)
    return [
      date(year, 1, 1),    // Nouvel An
      addDays(e, -2),      // Vendredi Saint
      addDays(e, 1),       // Lundi de Pâques
      addDays(e, 39),      // Ascension
      addDays(e, 50),      // Lundi de Pentecôte
      date(year, 8, 1),    // Fête nationale
      jeuneGenevois,        // Jeûne genevois
      date(year, 12, 25),  // Noël
      date(year, 12, 31),  // Restauration de la République
    ]
  },
  FR: (year) => {
    const e = easterDate(year)
    return [
      date(year, 1, 1),    // Nouvel An
      date(year, 1, 2),    // Berchtoldstag
      addDays(e, 1),       // Lundi de Pâques
      addDays(e, 39),      // Ascension
      addDays(e, 50),      // Lundi de Pentecôte
      addDays(e, 60),      // Fête-Dieu
      date(year, 8, 1),    // Fête nationale
      date(year, 8, 15),   // Assomption
      date(year, 11, 1),   // Toussaint
      date(year, 12, 8),   // Immaculée Conception
      date(year, 12, 25),  // Noël
    ]
  },
  BE: (year) => {
    const e = easterDate(year)
    return [
      date(year, 1, 1),    // Nouvel An
      date(year, 1, 2),    // Berchtoldstag
      addDays(e, -2),      // Vendredi Saint
      addDays(e, 1),       // Lundi de Pâques
      addDays(e, 39),      // Ascension
      addDays(e, 50),      // Lundi de Pentecôte
      date(year, 8, 1),    // Fête nationale
      date(year, 12, 25),  // Noël
      date(year, 12, 26),  // Saint-Étienne
    ]
  },
  JU: (year) => {
    const e = easterDate(year)
    return [
      date(year, 1, 1),    // Nouvel An
      date(year, 1, 6),    // Épiphanie
      addDays(e, -2),      // Vendredi Saint
      addDays(e, 1),       // Lundi de Pâques
      addDays(e, 39),      // Ascension
      addDays(e, 50),      // Lundi de Pentecôte
      addDays(e, 60),      // Fête-Dieu
      date(year, 6, 23),   // Fête du Jura (Plébiscite)
      date(year, 8, 1),    // Fête nationale
      date(year, 8, 15),   // Assomption
      date(year, 11, 1),   // Toussaint
      date(year, 12, 8),   // Immaculée Conception
      date(year, 12, 25),  // Noël
      date(year, 12, 26),  // Saint-Étienne
    ]
  },
  NE: (year) => {
    const e = easterDate(year)
    return [
      date(year, 1, 1),    // Nouvel An
      date(year, 1, 2),    // Berchtoldstag
      date(year, 3, 1),    // Instauration de la République
      addDays(e, -2),      // Vendredi Saint
      addDays(e, 1),       // Lundi de Pâques
      addDays(e, 39),      // Ascension
      addDays(e, 50),      // Lundi de Pentecôte
      date(year, 8, 1),    // Fête nationale
      date(year, 12, 25),  // Noël
      date(year, 12, 26),  // Saint-Étienne
    ]
  },
  LU: (year) => {
    const e = easterDate(year)
    return [
      date(year, 1, 1),    // Nouvel An
      date(year, 1, 6),    // Épiphanie
      addDays(e, 1),       // Lundi de Pâques
      addDays(e, 39),      // Ascension
      addDays(e, 50),      // Lundi de Pentecôte
      addDays(e, 60),      // Fête-Dieu
      date(year, 8, 1),    // Fête nationale
      date(year, 8, 15),   // Assomption
      date(year, 11, 1),   // Toussaint
      date(year, 12, 8),   // Immaculée Conception
      date(year, 12, 25),  // Noël
    ]
  },
}

// Jours fériés nationaux (fallback si canton inconnu)
function feriesNationaux(year: number): Date[] {
  const e = easterDate(year)
  return [
    date(year, 1, 1),    // Nouvel An
    addDays(e, 1),       // Lundi de Pâques
    addDays(e, 39),      // Ascension
    addDays(e, 50),      // Lundi de Pentecôte
    date(year, 8, 1),    // Fête nationale
    date(year, 12, 25),  // Noël
  ]
}

/**
 * Retourne les jours fériés pour un canton et une année donnés.
 * Si le canton est inconnu, retourne les jours fériés nationaux.
 */
export function getJoursFeries(canton: string, year: number): Date[] {
  const fn = CANTON_FERIES[canton?.toUpperCase?.()]
  const raw = fn ? fn(year) : feriesNationaux(year)
  // Dédupliquer
  const seen = new Set<string>()
  return raw.filter(d => {
    const key = toDateKey(d)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).sort((a, b) => a.getTime() - b.getTime())
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Convertit une liste de Date[] en Set<string> "YYYY-MM-DD" pour lookup O(1).
 */
export function feriesSet(jours: Date[]): Set<string> {
  return new Set(jours.map(toDateKey))
}

/**
 * Compte les jours fériés tombant en semaine (lun-ven) entre start et end inclus.
 */
export function countFeriesOuvrables(feries: Set<string>, start: Date, end: Date): number {
  let count = 0
  const d = new Date(start)
  d.setHours(0, 0, 0, 0)
  const e = new Date(end)
  e.setHours(23, 59, 59, 999)
  while (d <= e) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6 && feries.has(toDateKey(d))) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

/**
 * Noms des jours fériés tombant en semaine dans une période,
 * pour affichage en tooltip.
 */
export function feriesOuvrablesLabels(feries: Date[], start: Date, end: Date): string[] {
  const s = new Date(start); s.setHours(0, 0, 0, 0)
  const e = new Date(end); e.setHours(23, 59, 59, 999)
  return feries
    .filter(d => {
      const dow = d.getDay()
      return dow !== 0 && dow !== 6 && d >= s && d <= e
    })
    .map(d => d.toLocaleDateString('fr-CH', { day: 'numeric', month: 'long' }))
}
