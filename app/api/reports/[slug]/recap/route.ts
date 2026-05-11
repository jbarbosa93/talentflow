// TalentFlow Rapports — Récapitulatif par période (route publique candidat)
// v2.4.1 — Phase 2
//
// GET /api/reports/[slug]/recap?from=YYYY-MM-DD&to=YYYY-MM-DD&scope=candidate|dashboard
//
// Retourne :
// - byMission[] : totaux par entreprise (groupe report_link_client_id)
// - total       : totaux globaux période
// - count       : nb soumissions incluses
//
// scope=candidate (défaut) : status='completed' uniquement
// scope=dashboard          : completed + client_signed + candidate_signed

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getReportLinkBySlug, getTemplateForLink } from '@/lib/report/queries'
import {
  aggregateTotals, sumSubmissionMetrics, type SubmissionTotals,
  CANDIDATE_RECAP_STATUSES, DASHBOARD_RECAP_STATUSES,
} from '@/lib/report/recap'
import type { SignField } from '@/lib/sign/types'
import type { ReportSubmission } from '@/lib/report/types'

export const runtime = 'nodejs'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params
  if (!slug) return NextResponse.json({ error: 'slug manquant' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const from = (searchParams.get('from') || '').trim()
  const to = (searchParams.get('to') || '').trim()
  const scope = searchParams.get('scope') === 'dashboard' ? 'dashboard' : 'candidate'

  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json({ error: 'from/to manquants ou invalides (YYYY-MM-DD)' }, { status: 400 })
  }
  if (from > to) {
    return NextResponse.json({ error: 'from doit être <= to' }, { status: 400 })
  }

  const link = await getReportLinkBySlug(slug)
  if (!link) return NextResponse.json({ error: 'Lien introuvable' }, { status: 404 })
  if (link.status !== 'active') return NextResponse.json({ error: 'Lien inactif' }, { status: 403 })

  const template = await getTemplateForLink(link.template_id)
  if (!template) return NextResponse.json({ error: 'Template introuvable' }, { status: 404 })

  // Tous les fields du template (tous documents confondus)
  const templateFields: SignField[] = (template.documents || []).flatMap(d => d.fields || [])

  // Statuts inclus
  const statuses = scope === 'dashboard' ? DASHBOARD_RECAP_STATUSES : CANDIDATE_RECAP_STATUSES

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('report_submissions' as any)
    .select('id, week_start, week_end, status, field_values, report_link_client_id')
    .eq('link_id', link.id)
    .gte('week_start', from)
    .lte('week_start', to)
    .in('status', statuses as any)
    .order('week_start', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const submissions = (data || []) as unknown as ReportSubmission[]

  // Fetch entreprises pour résoudre les noms
  const linkClientIds = Array.from(new Set(
    submissions.map(s => s.report_link_client_id).filter(Boolean),
  )) as string[]

  let clientsById = new Map<string, { id: string; client_name: string }>()
  if (linkClientIds.length > 0) {
    const { data: clients } = await supabase
      .from('report_link_clients' as any)
      .select('id, client_name')
      .in('id', linkClientIds)
    for (const c of (clients || []) as any[]) {
      clientsById.set(c.id, c)
    }
  }

  // Calcul totaux par submission
  const enriched = submissions.map(s => ({
    submission: s,
    totals: sumSubmissionMetrics(s, templateFields),
  }))

  // Groupage par entreprise
  const missionMap = new Map<string, {
    client_id: string | null
    client_name: string
    count: number
    totals: SubmissionTotals
    submissions: { id: string; week_start: string; week_end: string; status: string }[]
  }>()

  for (const { submission: s, totals } of enriched) {
    const key = s.report_link_client_id || '__legacy__'
    const fallbackName = link.client_name || 'Sans entreprise'
    const clientName = s.report_link_client_id
      ? (clientsById.get(s.report_link_client_id)?.client_name || fallbackName)
      : fallbackName

    if (!missionMap.has(key)) {
      missionMap.set(key, {
        client_id: s.report_link_client_id,
        client_name: clientName,
        count: 0,
        totals: { heures_normales: 0, heures_sup: 0, repas: 0, deplacement: 0 },
        submissions: [],
      })
    }
    const m = missionMap.get(key)!
    m.count += 1
    m.totals = aggregateTotals([m.totals, totals])
    m.submissions.push({
      id: s.id,
      week_start: s.week_start,
      week_end: s.week_end,
      status: s.status,
    })
  }

  const byMission = Array.from(missionMap.values()).sort((a, b) => b.totals.heures_normales - a.totals.heures_normales)
  const total = aggregateTotals(enriched.map(e => e.totals))

  return NextResponse.json({
    slug,
    candidat_name: link.candidat_name,
    from,
    to,
    scope,
    count: enriched.length,
    byMission,
    total,
  })
}
