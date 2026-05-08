// TalentFlow Rapports — Auto-save brouillon (Phase 5)
// v2.2.6
//
// POST { week_start, week_end, field_values } → upsert sur (link_id, week_start)
// avec status='draft'. Idempotent : appelé toutes les 30s par la page candidat.
//
// Pas d'auth (lien permanent). Refuse si lien != 'active' ou si la semaine est
// déjà signée (status > 'draft').

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getReportLinkBySlug, getSubmissionByWeek } from '@/lib/report/queries'
import { logReportAudit, extractIp } from '@/lib/report/audit'
import { getWeekDates, parseIsoDate } from '@/lib/report/week-helpers'

export const runtime = 'nodejs'

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const weekStartRaw = body.week_start as string | undefined
  const fieldValues = (body.field_values && typeof body.field_values === 'object')
    ? body.field_values
    : {}

  if (!weekStartRaw || !/^\d{4}-\d{2}-\d{2}$/.test(weekStartRaw)) {
    return NextResponse.json({ error: 'week_start invalide (YYYY-MM-DD)' }, { status: 400 })
  }

  const link = await getReportLinkBySlug(slug)
  if (!link) return NextResponse.json({ error: 'Lien introuvable' }, { status: 404 })
  if (link.status !== 'active') {
    return NextResponse.json({ error: 'Lien désactivé' }, { status: 403 })
  }

  // Calcule week_end depuis week_start (sécurité — on ne fait pas confiance au client)
  const weekDates = getWeekDates(parseIsoDate(weekStartRaw))

  // Vérifie si déjà signée
  const existing = await getSubmissionByWeek(link.id, weekStartRaw)
  if (existing && existing.status !== 'draft') {
    return NextResponse.json({
      error: 'Semaine déjà soumise — la modification est verrouillée',
      submission_id: existing.id,
      status: existing.status,
    }, { status: 409 })
  }

  const supabase = createAdminClient()
  const isCreate = !existing
  const payload = {
    link_id: link.id,
    week_start: weekStartRaw,
    week_end: weekDates.end,
    field_values: fieldValues,
    status: 'draft' as const,
  }

  let saved: any = null
  if (isCreate) {
    const { data, error } = await supabase
      .from('report_submissions' as any)
      .insert(payload)
      .select()
      .single()
    if (error) {
      console.error('[reports/save-draft] insert', error)
      return NextResponse.json({ error: 'Erreur sauvegarde' }, { status: 500 })
    }
    saved = data
    // Audit log : création (pas pour chaque save, juste à la création de la submission)
    await logReportAudit({
      submissionId: (saved as { id: string }).id,
      action: 'created',
      ip: extractIp(req),
      metadata: { week: weekStartRaw, slug, source: 'save-draft' },
    })
  } else {
    const { data, error } = await supabase
      .from('report_submissions' as any)
      .update({ field_values: fieldValues })
      .eq('id', existing.id)
      .select()
      .single()
    if (error) {
      console.error('[reports/save-draft] update', error)
      return NextResponse.json({ error: 'Erreur sauvegarde' }, { status: 500 })
    }
    saved = data
  }

  return NextResponse.json({
    ok: true,
    submission_id: (saved as { id: string }).id,
    saved_at: new Date().toISOString(),
  })
}

/**
 * GET ?week=YYYY-MM-DD → retourne field_values existants (reprise brouillon).
 * Renvoie aussi l'état signé/completed pour permettre la lecture seule.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params
  const week = req.nextUrl.searchParams.get('week')
  if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    return NextResponse.json({ error: 'week invalide (?week=YYYY-MM-DD)' }, { status: 400 })
  }
  const link = await getReportLinkBySlug(slug)
  if (!link || link.status !== 'active') {
    return NextResponse.json({ submission: null }, { status: link ? 403 : 404 })
  }
  const submission = await getSubmissionByWeek(link.id, week)
  return NextResponse.json({ submission })
}
