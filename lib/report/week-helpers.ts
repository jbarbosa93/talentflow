// TalentFlow Rapports — Helpers semaine ISO (Phase 5)
// v2.2.6
//
// Convention : semaine = lundi → dimanche (ISO 8601).
// Toutes les dates manipulées en UTC ISO YYYY-MM-DD pour éviter les pièges de fuseau.

import type { WeekDates, WeekDay } from './types'

/**
 * Retourne le lundi de la semaine contenant la date donnée (UTC).
 * Ex: 2026-05-08 (vendredi) → 2026-05-04 (lundi).
 */
export function getMondayOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay() // 0=dim, 1=lun, ..., 6=sam
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d
}

/** Retourne le lundi de la semaine courante (UTC). */
export function getCurrentWeekStart(): Date {
  return getMondayOf(new Date())
}

/** Format ISO YYYY-MM-DD d'une Date UTC. */
export function isoDate(d: Date): string {
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** Parse YYYY-MM-DD en Date UTC. Tolérant aux espaces. */
export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.trim().split('-').map(Number)
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1))
}

/**
 * Numéro ISO 8601 de la semaine pour une date UTC donnée.
 * Algorithme standard : la semaine 1 est celle qui contient le 1er jeudi de l'année.
 */
export function getWeekNumberISO(date: Date): { week: number; year: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { week, year: d.getUTCFullYear() }
}

/**
 * Calcule les bornes + label d'une semaine à partir de son lundi (Date ou ISO).
 */
export function getWeekDates(weekStart: Date | string): WeekDates {
  const start = typeof weekStart === 'string' ? parseIsoDate(weekStart) : weekStart
  const monday = getMondayOf(start)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  const { week, year } = getWeekNumberISO(monday)
  return {
    start: isoDate(monday),
    end: isoDate(sunday),
    weekNumber: week,
    year,
    label: formatWeekLabel(monday, sunday),
  }
}

/**
 * Formate un label lisible : "Semaine du 5 au 11 mai 2026".
 * Si le mois change : "Semaine du 28 avril au 4 mai 2026".
 * Si l'année change : "Semaine du 30 décembre 2025 au 5 janvier 2026".
 */
export function formatWeekLabel(monday: Date, sunday: Date): string {
  const sameMonth = monday.getUTCMonth() === sunday.getUTCMonth()
                  && monday.getUTCFullYear() === sunday.getUTCFullYear()
  const sameYear = monday.getUTCFullYear() === sunday.getUTCFullYear()
  const fmt = (d: Date, withMonth: boolean, withYear: boolean) => {
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric' }
    if (withMonth) opts.month = 'long'
    if (withYear) opts.year = 'numeric'
    return new Intl.DateTimeFormat('fr-CH', { ...opts, timeZone: 'UTC' }).format(d)
  }
  if (sameMonth) {
    return `Semaine du ${fmt(monday, false, false)} au ${fmt(sunday, true, true)}`
  }
  if (sameYear) {
    return `Semaine du ${fmt(monday, true, false)} au ${fmt(sunday, true, true)}`
  }
  return `Semaine du ${fmt(monday, true, true)} au ${fmt(sunday, true, true)}`
}

/**
 * Liste des N dernières semaines + la semaine courante.
 * Triée DESC (la plus récente en premier).
 */
export function listRecentWeeks(count = 8): WeekDates[] {
  const result: WeekDates[] = []
  const current = getCurrentWeekStart()
  for (let i = 0; i < count; i++) {
    const d = new Date(current)
    d.setUTCDate(d.getUTCDate() - i * 7)
    result.push(getWeekDates(d))
  }
  return result
}

/**
 * Date d'un jour de la semaine donnée (Lundi → Dimanche).
 * Ex: weekStart='2026-05-04', day='Mercredi' → '2026-05-06'
 */
export function dateForDay(weekStart: string, day: WeekDay): string {
  const offsets: Record<WeekDay, number> = {
    Lundi: 0, Mardi: 1, Mercredi: 2, Jeudi: 3,
    Vendredi: 4, Samedi: 5, Dimanche: 6,
  }
  const monday = parseIsoDate(weekStart)
  monday.setUTCDate(monday.getUTCDate() + offsets[day])
  return isoDate(monday)
}

/** Format court "05.05.2026" pour cellules date du tableau. */
export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}
