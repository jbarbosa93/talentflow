// TalentFlow Rapports — Récapitulatif par période (helpers)
// v2.4.1 — Phase 2 Historique & Récap
//
// Heuristique label-based pour détecter la catégorie d'un field rapport :
// - heures_normales : label matche "heures normales" et ne commence pas par "Total"
// - heures_sup      : label matche "heures sup..."  et ne commence pas par "Total"
// - repas           : label matche "repas"           et ne commence pas par "Total"
// - deplacement     : label matche "déplacement|temps de d" et pas "Total"
// - autre           : aucun match (ignoré dans le récap)
//
// Cette approche fonctionne immédiatement sur le template L-Agence existant
// sans config admin supplémentaire. Pour futur : ajouter recapCategory au type.

import type { SignField } from '@/lib/sign/types'
import type { ReportSubmission } from './types'
import { pointageHours } from '@/lib/sign/pointage'

export type RecapCategory = 'heures_normales' | 'heures_sup' | 'repas' | 'deplacement' | 'autre'

const RE_TOTAL_PREFIX = /^\s*total/i
const RE_HEURES_NORMALES = /heures?\s*normales?/i
const RE_HEURES_SUP = /heures?\s*sup/i
const RE_REPAS = /\brepas\b/i
const RE_DEPLACEMENT = /(d[ée]placement|temps\s*de\s*d)/i

/** Détermine la catégorie de récap d'un field d'après son label. */
export function detectFieldCategory(field: SignField): RecapCategory {
  const label = (field.label || '').trim()
  if (!label) return 'autre'
  // Exclut les "Total ..." (formula calculée) pour éviter le double-count
  if (RE_TOTAL_PREFIX.test(label)) return 'autre'
  if (RE_HEURES_SUP.test(label)) return 'heures_sup'
  if (RE_HEURES_NORMALES.test(label)) return 'heures_normales'
  if (RE_REPAS.test(label)) return 'repas'
  if (RE_DEPLACEMENT.test(label)) return 'deplacement'
  return 'autre'
}

export interface SubmissionTotals {
  heures_normales: number
  heures_sup: number
  repas: number
  deplacement: number
}

const EMPTY_TOTALS: SubmissionTotals = {
  heures_normales: 0, heures_sup: 0, repas: 0, deplacement: 0,
}

/** Parse une valeur number tolérante (gère "7.5", "7,5", "  8 ", 0, etc.). */
function parseNum(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const norm = v.trim().replace(',', '.')
    if (!norm) return 0
    const n = parseFloat(norm)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

/** Compte un repas si la valeur checkbox est truthy (true, 'true', 1, '1'). */
function isCheckboxTrue(v: unknown): boolean {
  if (v === true) return true
  if (v === 1 || v === '1') return true
  if (typeof v === 'string' && v.toLowerCase() === 'true') return true
  return false
}

/** Calcule les totaux d'une submission donnée à partir des fields du template. */
export function sumSubmissionMetrics(
  submission: ReportSubmission,
  templateFields: SignField[],
): SubmissionTotals {
  const totals: SubmissionTotals = { ...EMPTY_TOTALS }
  const values = submission.field_values || {}

  for (const f of templateFields) {
    const raw = (values as Record<string, unknown>)[f.id]

    // v2.9.95 — Pointeuse : ses heures (Fin−Début−pauses) comptent comme heures normales.
    if (f.type === 'pointage') {
      totals.heures_normales += pointageHours(raw)
      continue
    }

    const cat = detectFieldCategory(f)
    if (cat === 'autre') continue

    if (cat === 'repas') {
      // checkbox : compte 1 par true
      if (isCheckboxTrue(raw)) totals.repas += 1
      continue
    }

    // number : ajoute la valeur (ignore les non-numériques)
    totals[cat] += parseNum(raw)
  }

  return totals
}

/** Agrège plusieurs submissions. */
export function aggregateTotals(items: SubmissionTotals[]): SubmissionTotals {
  return items.reduce<SubmissionTotals>((acc, t) => ({
    heures_normales: acc.heures_normales + t.heures_normales,
    heures_sup: acc.heures_sup + t.heures_sup,
    repas: acc.repas + t.repas,
    deplacement: acc.deplacement + t.deplacement,
  }), { ...EMPTY_TOTALS })
}

/** Groupe des submissions par mois (clé "YYYY-MM" pour ordre stable). */
export function groupByMonth<T extends { week_start: string }>(items: T[]): Array<{
  key: string
  label: string
  items: T[]
}> {
  const groups = new Map<string, T[]>()
  for (const it of items) {
    const d = new Date(it.week_start + 'T00:00:00Z')
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(it)
  }
  const sorted = Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  return sorted.map(([key, list]) => {
    const [y, m] = key.split('-').map(Number)
    const monthName = new Date(Date.UTC(y, m - 1, 1))
      .toLocaleDateString('fr-CH', { month: 'long', year: 'numeric' })
    return {
      key,
      label: monthName.charAt(0).toUpperCase() + monthName.slice(1),
      items: list,
    }
  })
}

/** Format compact des totaux pour affichage ("40h · 2 repas · 3h sup"). */
export function formatTotalsShort(t: SubmissionTotals): string {
  const parts: string[] = []
  if (t.heures_normales > 0) parts.push(`${formatHours(t.heures_normales)}h`)
  if (t.repas > 0) parts.push(`${t.repas} repas`)
  if (t.heures_sup > 0) parts.push(`${formatHours(t.heures_sup)}h sup`)
  if (t.deplacement > 0) parts.push(`${formatHours(t.deplacement)}h dépl.`)
  return parts.join(' · ') || '—'
}

/** Format heures décimales sans trailing zero ("7", "7.5", "12.25"). */
export function formatHours(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(2).replace(/\.?0+$/, '')
}

/** Statuts inclus dans le récap candidat (completed seulement). */
export const CANDIDATE_RECAP_STATUSES: ReadonlyArray<ReportSubmission['status']> = ['completed']
/** Statuts inclus dans le récap dashboard (completed + intermédiaires). */
export const DASHBOARD_RECAP_STATUSES: ReadonlyArray<ReportSubmission['status']> = [
  'completed', 'client_signed', 'candidate_signed',
]
