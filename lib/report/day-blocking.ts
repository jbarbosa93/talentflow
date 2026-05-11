// TalentFlow Rapports — Helpers blocage de jours
// v2.6.2 — Étapes C + D
//
// Calcule pour une semaine donnée quels jours doivent être grisés côté candidat :
//   - Étape C : jours en dehors de la fenêtre de mission (mission_start_date → mission_end_date)
//   - Étape D : jours déjà déclarés sur un rapport validé d'une autre entreprise
//
// Sortie unifiée : Map<ISO date, DayBlockReason> et Map<fieldId, DayBlockReason>
// → consommée par PublicFieldsLayer pour le rendu read-only + tooltip.

import type { SignField } from '@/lib/sign/types'
import { getDayOffsetFromSection, dateForDayOfWeek } from '@/lib/sign/field-helpers'

export type DayBlockReason = {
  type: 'out_of_mission' | 'already_declared'
  /** Message court affiché en tooltip / mention sur le field grisé. */
  message: string
  /** Pour 'already_declared' uniquement : nom de l'entreprise qui a déjà rempli ce jour. */
  clientName?: string
}

/**
 * Construit la Map { ISO date → raison de blocage } pour une semaine et un contexte donnés.
 * Si un jour est à la fois hors mission ET déclaré ailleurs, on garde 'out_of_mission'
 * (raison plus haut niveau).
 */
export function buildBlockedDaysForWeek(args: {
  /** Liste des 7 jours ISO de la semaine (lundi → dimanche) */
  weekDaysIso: string[]
  /** Date de début de mission (incluse). NULL = pas de limite basse. */
  missionStart: string | null
  /** Date de fin de mission (incluse). NULL = pas de limite haute. */
  missionEnd: string | null
  /** Jours déjà déclarés par d'autres entreprises sur cette semaine. */
  declaredByOthers: { clientName: string; daysIso: string[] }[]
}): Map<string, DayBlockReason> {
  const out = new Map<string, DayBlockReason>()
  const { weekDaysIso, missionStart, missionEnd, declaredByOthers } = args

  // Étape C : jours hors mission
  for (const day of weekDaysIso) {
    if (missionStart && day < missionStart) {
      out.set(day, { type: 'out_of_mission', message: 'Hors période de mission' })
      continue
    }
    if (missionEnd && day > missionEnd) {
      out.set(day, { type: 'out_of_mission', message: 'Hors période de mission' })
    }
  }

  // Étape D : jours déjà déclarés ailleurs (n'écrase pas out_of_mission)
  for (const other of declaredByOthers) {
    for (const day of other.daysIso) {
      if (out.has(day)) continue  // already_declared a une priorité plus basse que out_of_mission
      out.set(day, {
        type: 'already_declared',
        message: `Déjà déclaré chez ${other.clientName}`,
        clientName: other.clientName,
      })
    }
  }

  return out
}

/**
 * À partir d'une liste de fields (depuis le template) + de la Map de jours bloqués,
 * retourne la Map { fieldId → DayBlockReason } pour les fields qui mappent à un jour bloqué.
 *
 * Un field "mappe à un jour" si sa wizardSection contient un nom de jour reconnu
 * (Lundi / Mardi / … via getDayOffsetFromSection).
 */
export function buildBlockedFieldsMap(args: {
  fields: SignField[]
  weekStart: string
  blockedDays: Map<string, DayBlockReason>
}): Map<string, DayBlockReason> {
  const out = new Map<string, DayBlockReason>()
  const { fields, weekStart, blockedDays } = args
  if (blockedDays.size === 0) return out

  for (const f of fields) {
    const wizardSection = f.metadata?.wizardSection as string | undefined
    const dayOffset = getDayOffsetFromSection(wizardSection)
    if (dayOffset === null) continue
    const fieldDate = dateForDayOfWeek(weekStart, dayOffset)
    if (!fieldDate) continue
    const reason = blockedDays.get(fieldDate)
    if (reason) out.set(f.id, reason)
  }

  return out
}

/**
 * Détermine pour quels jours d'une semaine on a au moins UN field non-vide.
 * Utilisé côté serveur (other-week-submissions) pour identifier les jours réellement
 * déclarés par un autre rapport (status validé).
 *
 * "Non-vide" = truthy ET (pour les number/string) > 0 / non vide après trim.
 */
export function getDeclaredDaysFromValues(args: {
  fields: SignField[]
  weekStart: string
  fieldValues: Record<string, unknown>
}): string[] {
  const { fields, weekStart, fieldValues } = args
  const set = new Set<string>()

  for (const f of fields) {
    const wizardSection = f.metadata?.wizardSection as string | undefined
    const dayOffset = getDayOffsetFromSection(wizardSection)
    if (dayOffset === null) continue
    const v = fieldValues[f.id]
    if (!isMeaningfullyFilled(v)) continue
    const date = dateForDayOfWeek(weekStart, dayOffset)
    if (date) set.add(date)
  }

  return Array.from(set).sort()
}

function isMeaningfullyFilled(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (typeof v === 'number') return v > 0
  if (typeof v === 'boolean') return v === true
  if (Array.isArray(v)) return v.length > 0
  return true
}
