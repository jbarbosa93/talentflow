// TalentFlow Rapports — Jours déjà déclarés sur d'autres rapports validés
// v2.6.2 — Étape D
//
// GET /api/reports/{slug}/declared-days?week=YYYY-MM-DD&exclude=clientId
// → Retourne les jours ISO sur lesquels le candidat a déjà soumis un rapport
//   pour une AUTRE entreprise sur la même semaine (status candidate_signed,
//   client_signed ou completed → pas les drafts).
//
// Permet au front de griser ces jours quand le candidat ouvre la même semaine
// pour une 2e entreprise (évite la double facturation des heures).
//
// Format de réponse :
//   { byClient: [{ client_id, client_name, daysIso: ['2026-05-04', ...] }] }

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getReportLinkBySlug, getTemplateForLink } from '@/lib/report/queries'
import { getDeclaredDaysFromValues } from '@/lib/report/day-blocking'

export const runtime = 'nodejs'

const COUNTED_STATUS = ['candidate_signed', 'client_signed', 'completed'] as const

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params
  const week = req.nextUrl.searchParams.get('week')
  const excludeClientId = req.nextUrl.searchParams.get('exclude') || null

  if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    return NextResponse.json({ error: 'week invalide (?week=YYYY-MM-DD)' }, { status: 400 })
  }

  const link = await getReportLinkBySlug(slug)
  if (!link) return NextResponse.json({ error: 'Lien introuvable' }, { status: 404 })
  if (link.status !== 'active') return NextResponse.json({ error: 'Lien inactif' }, { status: 403 })

  // Template requis pour mapper field → jour de semaine
  const template = await getTemplateForLink(link.template_id)
  if (!template) {
    // Template manquant : pas de mapping possible, on retourne vide (pas d'erreur dure)
    return NextResponse.json({ byClient: [] })
  }
  const allFields = (template.documents || []).flatMap((d: any) => d.fields || [])

  const supabase = createAdminClient()
  let q = supabase
    .from('report_submissions' as any)
    .select('id, report_link_client_id, field_values, status')
    .eq('link_id', link.id)
    .eq('week_start', week)
    .in('status', COUNTED_STATUS as unknown as string[])
  if (excludeClientId) q = q.neq('report_link_client_id', excludeClientId)

  const { data: subs, error } = await q
  if (error) {
    console.error('[declared-days]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }

  const rows = (subs || []) as unknown as Array<{
    id: string; report_link_client_id: string | null; field_values: Record<string, unknown> | null; status: string
  }>
  if (rows.length === 0) return NextResponse.json({ byClient: [] })

  // Récupère les noms d'entreprises en 1 requête
  const clientIds = Array.from(new Set(rows.map(r => r.report_link_client_id).filter((x): x is string => !!x)))
  const namesByClientId = new Map<string, string>()
  if (clientIds.length) {
    const { data: clientsData } = await supabase
      .from('report_link_clients' as any)
      .select('id, client_name')
      .in('id', clientIds)
    for (const c of (clientsData || []) as unknown as Array<{ id: string; client_name: string }>) {
      namesByClientId.set(c.id, c.client_name)
    }
  }

  const byClient = rows.map(r => {
    const daysIso = getDeclaredDaysFromValues({
      fields: allFields,
      weekStart: week,
      fieldValues: r.field_values || {},
    })
    return {
      client_id: r.report_link_client_id,
      client_name: r.report_link_client_id
        ? (namesByClientId.get(r.report_link_client_id) || link.client_name || 'Autre entreprise')
        : (link.client_name || 'Autre entreprise'),
      daysIso,
    }
  }).filter(c => c.daysIso.length > 0)

  return NextResponse.json({ byClient })
}
