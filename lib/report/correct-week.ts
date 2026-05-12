// TalentFlow Rapports — Correction de la semaine d'une submission signée
// v2.6.17
//
// Quand un candidat a signé son rapport pour une mauvaise semaine (ex: il déclare
// la semaine 19 mais coche semaine 20), un consultant/admin peut corriger :
//   1. Check conflit (pas de submission déjà existante pour la nouvelle semaine)
//   2. UPDATE week_start + week_end (les dates par jour du PDF sont dérivées de week_start)
//   3. Regénère le PDF stampé (les signatures restent intactes, seules les dates changent)
//   4. Append metadata.corrections (audit historique)
//   5. INSERT report_audit_log action='week_corrected'
//   6. Retourne les buffers + metadata pour envoi email (orchestré par la route)

import { createAdminClient } from '@/lib/supabase/admin'
import { generateReportPdf, type GeneratedReportDoc } from './pdf-generator'
import { getWeekDates, isoDate, parseIsoDate, getMondayOf } from './week-helpers'
import { logReportAudit } from './audit'
import { getDayOffsetFromSection, dateForDayOfWeek } from '@/lib/sign/field-helpers'
import type { SignField } from '@/lib/sign/types'
import type { ReportLink, ReportSubmission } from './types'

/**
 * Recalcule les valeurs des fields de type date auto-fill (Lundi/Mardi/...
 * et "Numéro de semaine" dateFormat=WW) à partir d'un nouveau week_start.
 * Préserve toutes les autres valeurs (heures, repas, signatures, etc.).
 */
export function recomputeAutoFillDates(
  fieldValues: Record<string, unknown>,
  fields: SignField[],
  newWeekStartIso: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(fieldValues || {}) }
  for (const f of fields) {
    if (f.type !== 'date') continue
    // a) Date du jour de semaine (via wizardSection Lundi/Mardi/...)
    const dayOffset = getDayOffsetFromSection(f.wizardSection)
    if (dayOffset !== null) {
      const d = dateForDayOfWeek(newWeekStartIso, dayOffset)
      if (d) next[f.id] = d
      continue
    }
    // b) Numéro de semaine (dateFormat contient WW) — stocke le weekStart, le PDF formate
    const fmt = (f.dateFormat || '').toString()
    if (fmt.includes('WW')) {
      next[f.id] = newWeekStartIso
    }
  }
  return next
}

async function loadTemplateFields(supabase: ReturnType<typeof createAdminClient>, templateId: string): Promise<SignField[]> {
  const { data: tpl } = await (supabase as any)
    .from('sign_templates')
    .select('documents')
    .eq('id', templateId)
    .maybeSingle()
  const docs = (tpl?.documents || []) as { fields?: SignField[] }[]
  const out: SignField[] = []
  for (const d of docs) {
    if (Array.isArray(d.fields)) out.push(...d.fields)
  }
  return out
}

export interface CorrectWeekParams {
  submissionId: string
  /** Nouvelle date de début (sera normalisée vers le lundi ISO 8601) */
  newWeekStart: string
  /** Raison libre — affichée dans les emails uniquement (pas sur le PDF) */
  reason: string
  /** Email de l'utilisateur qui déclenche la correction (audit) */
  actorEmail?: string | null
  /** IP de la requête (audit) */
  actorIp?: string | null
}

export interface CorrectWeekResult {
  submission: ReportSubmission
  link: ReportLink
  fromWeek: { start: string; end: string; label: string; weekNumber: number }
  toWeek: { start: string; end: string; label: string; weekNumber: number }
  newPdfs: GeneratedReportDoc[]
}

export class CorrectWeekError extends Error {
  constructor(message: string, public code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID' | 'NOT_SIGNED' | 'INTERNAL') {
    super(message)
    this.name = 'CorrectWeekError'
  }
}

/**
 * Corrige la semaine d'une submission signée.
 * Idempotent : si newWeekStart == week_start actuel → throw INVALID.
 * Throw CONFLICT si une autre submission existe déjà pour la nouvelle semaine.
 */
export async function correctSubmissionWeek(p: CorrectWeekParams): Promise<CorrectWeekResult> {
  if (!p.submissionId) throw new CorrectWeekError('submissionId requis', 'INVALID')
  if (!p.newWeekStart) throw new CorrectWeekError('newWeekStart requis', 'INVALID')
  const reasonTrim = (p.reason || '').trim()
  if (reasonTrim.length < 10) throw new CorrectWeekError('Raison trop courte (min 10 caractères)', 'INVALID')
  if (reasonTrim.length > 500) throw new CorrectWeekError('Raison trop longue (max 500 caractères)', 'INVALID')

  // Normalise vers le lundi ISO
  const newMonday = getMondayOf(parseIsoDate(p.newWeekStart))
  const newWeekStartIso = isoDate(newMonday)
  const newWeekDates = getWeekDates(newMonday)

  const supabase = createAdminClient()

  // 1. Récupère la submission + link
  const { data: subData, error: subErr } = await (supabase as any)
    .from('report_submissions')
    .select('*')
    .eq('id', p.submissionId)
    .maybeSingle()
  if (subErr) throw new CorrectWeekError(`DB error: ${subErr.message}`, 'INTERNAL')
  if (!subData) throw new CorrectWeekError('Submission introuvable', 'NOT_FOUND')
  const submission = subData as ReportSubmission

  if (submission.week_start === newWeekStartIso) {
    throw new CorrectWeekError('La nouvelle semaine est identique à la semaine actuelle', 'INVALID')
  }
  if (!submission.candidate_signed_at) {
    throw new CorrectWeekError('La submission n\'est pas signée par le candidat — correction inutile, modifie le brouillon directement', 'NOT_SIGNED')
  }

  const { data: linkData, error: linkErr } = await (supabase as any)
    .from('report_links')
    .select('*')
    .eq('id', submission.link_id)
    .maybeSingle()
  if (linkErr || !linkData) throw new CorrectWeekError('Lien associé introuvable', 'NOT_FOUND')
  const link = linkData as ReportLink

  // Capture l'ancienne semaine AVANT update
  const fromWeekDates = getWeekDates(submission.week_start)

  // 2. Check conflit : autre submission pour (link_id, newWeekStartIso, report_link_client_id) ?
  let conflictQuery = (supabase as any)
    .from('report_submissions')
    .select('id, week_start')
    .eq('link_id', submission.link_id)
    .eq('week_start', newWeekStartIso)
    .neq('id', submission.id)

  if (submission.report_link_client_id) {
    conflictQuery = conflictQuery.eq('report_link_client_id', submission.report_link_client_id)
  } else {
    conflictQuery = conflictQuery.is('report_link_client_id', null)
  }
  const { data: conflicts } = await conflictQuery.limit(1)
  if (conflicts && conflicts.length > 0) {
    throw new CorrectWeekError(
      `Une autre submission existe déjà pour la semaine ${newWeekDates.weekNumber} (${newWeekDates.label}). Vérifie avant de corriger.`,
      'CONFLICT'
    )
  }

  // 3. Récupère candidat lié (pour pdf-generator)
  let candidat: { prenom: string | null; nom: string | null; email: string | null } | null = null
  if (link.candidat_id) {
    const { data: candData } = await (supabase as any)
      .from('candidats')
      .select('prenom, nom, email')
      .eq('id', link.candidat_id)
      .maybeSingle()
    if (candData) candidat = candData
  }

  // 4. UPDATE week_start + week_end + metadata.corrections
  const correctionEntry = {
    from_week_start: submission.week_start,
    from_week_number: fromWeekDates.weekNumber,
    to_week_start: newWeekStartIso,
    to_week_number: newWeekDates.weekNumber,
    reason: reasonTrim,
    corrected_by: p.actorEmail || null,
    corrected_at: new Date().toISOString(),
  }
  const existingCorrections = Array.isArray((submission.metadata as any)?.corrections)
    ? (submission.metadata as any).corrections
    : []
  const newMetadata = {
    ...(submission.metadata || {}),
    corrections: [...existingCorrections, correctionEntry],
    last_correction_at: correctionEntry.corrected_at,
  }

  // Recalcul des field_values auto-fill (dates par jour + numéro de semaine)
  let newFieldValues = submission.field_values || {}
  if (link.template_id) {
    try {
      const fields = await loadTemplateFields(supabase, link.template_id)
      newFieldValues = recomputeAutoFillDates(submission.field_values || {}, fields, newWeekStartIso)
    } catch (e) {
      console.warn('[correct-week] template recompute skipped:', e instanceof Error ? e.message : String(e))
    }
  }

  const { error: updErr } = await (supabase as any)
    .from('report_submissions')
    .update({
      week_start: newWeekStartIso,
      week_end: newWeekDates.end,
      field_values: newFieldValues,
      metadata: newMetadata,
      updated_at: new Date().toISOString(),
    })
    .eq('id', submission.id)
  if (updErr) throw new CorrectWeekError(`Échec update: ${updErr.message}`, 'INTERNAL')

  // 5. Re-fetch updated submission pour regen PDF avec nouvelles dates
  const { data: updatedSub } = await (supabase as any)
    .from('report_submissions')
    .select('*')
    .eq('id', submission.id)
    .maybeSingle()
  const finalSubmission = (updatedSub || { ...submission, week_start: newWeekStartIso, week_end: newWeekDates.end }) as ReportSubmission

  // 6. Regénère PDF stampé (écrase signed_pdf_paths)
  let newPdfs: GeneratedReportDoc[] = []
  try {
    newPdfs = await generateReportPdf({ link, submission: finalSubmission, candidat })
  } catch (e) {
    console.error('[correct-week] generateReportPdf failed', e)
    // On ne throw pas : la correction DB est faite, l'email sera best-effort
  }

  // 7. Audit log
  await logReportAudit({
    submissionId: submission.id,
    action: 'week_corrected',
    actorEmail: p.actorEmail || null,
    ip: p.actorIp || null,
    metadata: correctionEntry,
  })

  return {
    submission: finalSubmission,
    link,
    fromWeek: { start: fromWeekDates.start, end: fromWeekDates.end, label: fromWeekDates.label, weekNumber: fromWeekDates.weekNumber },
    toWeek: { start: newWeekDates.start, end: newWeekDates.end, label: newWeekDates.label, weekNumber: newWeekDates.weekNumber },
    newPdfs,
  }
}
