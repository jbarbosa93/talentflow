// TalentFlow Rapports — Auto-save brouillon (Phase 5)
// v2.2.6 / v2.5.0 — Multi-entreprise même semaine
//
// POST { week_start, week_end, field_values, report_link_client_id? }
// → upsert sur (link_id, week_start, report_link_client_id) avec status='draft'.
// Idempotent : appelé toutes les 30s par la page candidat.
//
// v2.5.0 — IMPORTANT : le scope inclut désormais report_link_client_id, ce qui
// permet à un candidat d'avoir 2 brouillons distincts pour la même semaine si
// il travaille pour 2 entreprises différentes (mission 1 lundi-mardi, mission 2
// mercredi-vendredi). UNIQUE (link_id, week_start, report_link_client_id) en DB.
//
// Pas d'auth (lien permanent). Refuse si lien != 'active' ou si la semaine est
// déjà signée pour CETTE entreprise (status > 'draft').

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
  // v2.5.0 — Scope par entreprise (multi-entreprise même semaine)
  const reportLinkClientId = typeof body.report_link_client_id === 'string' && body.report_link_client_id.trim()
    ? body.report_link_client_id.trim()
    : null

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

  // Vérifie si déjà signée POUR CETTE ENTREPRISE (multi-entreprise possible : un
  // brouillon pour entreprise A et un brouillon pour entreprise B sur la même semaine)
  const existing = await getSubmissionByWeek(link.id, weekStartRaw, reportLinkClientId)
  if (existing && existing.status !== 'draft') {
    return NextResponse.json({
      error: 'Semaine déjà soumise pour cette entreprise — la modification est verrouillée',
      submission_id: existing.id,
      status: existing.status,
    }, { status: 409 })
  }

  const supabase = createAdminClient()
  const isCreate = !existing
  const payload = {
    link_id: link.id,
    report_link_client_id: reportLinkClientId,
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
 * GET ?week=YYYY-MM-DD&client=<report_link_client_id?>
 * → retourne field_values existants (reprise brouillon) pour ce couple semaine + entreprise.
 * Renvoie aussi l'état signé/completed pour permettre la lecture seule.
 *
 * v2.5.0 — Le paramètre `client` est désormais requis pour scoper correctement
 * en multi-entreprise. Si absent, on retourne le brouillon avec client_id=NULL
 * (mode legacy). undefined explicite signifie "n'importe quel client", mais ici
 * on choisit d'être strict pour éviter de mélanger les missions.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params
  const week = req.nextUrl.searchParams.get('week')
  const clientParam = req.nextUrl.searchParams.get('client')
  // null = filtre IS NULL (legacy) ; non-vide = filtre eq sur l'id
  const reportLinkClientId = clientParam && clientParam.trim() ? clientParam.trim() : null

  if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    return NextResponse.json({ error: 'week invalide (?week=YYYY-MM-DD)' }, { status: 400 })
  }
  const link = await getReportLinkBySlug(slug)
  if (!link || link.status !== 'active') {
    return NextResponse.json({ submission: null }, { status: link ? 403 : 404 })
  }
  const submission = await getSubmissionByWeek(link.id, week, reportLinkClientId)
  return NextResponse.json({ submission })
}
