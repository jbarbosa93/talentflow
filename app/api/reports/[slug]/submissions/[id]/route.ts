// TalentFlow Rapports — DELETE brouillon candidat
// v2.6.0
//
// DELETE /api/reports/{slug}/submissions/{id}
// → supprime une submission UNIQUEMENT si status='draft' (jamais une signée).
// Pas d'auth (lien permanent slug), mais on vérifie que la submission appartient
// bien au link désigné par le slug avant de supprimer.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getReportLinkBySlug } from '@/lib/report/queries'
import { logReportAudit, extractIp } from '@/lib/report/audit'

export const runtime = 'nodejs'

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await ctx.params

  const link = await getReportLinkBySlug(slug)
  if (!link) return NextResponse.json({ error: 'Lien introuvable' }, { status: 404 })
  if (link.status !== 'active') {
    return NextResponse.json({ error: 'Lien désactivé' }, { status: 403 })
  }

  const supabase = createAdminClient()
  const { data: sub, error: fetchErr } = await supabase
    .from('report_submissions' as any)
    .select('id, link_id, status, week_start')
    .eq('id', id)
    .maybeSingle()

  if (fetchErr) {
    console.error('[reports/submissions/delete] fetch', fetchErr)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
  const submission = sub as { id: string; link_id: string; status: string; week_start: string } | null
  if (!submission) return NextResponse.json({ error: 'Brouillon introuvable' }, { status: 404 })
  if (submission.link_id !== link.id) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }
  if (submission.status !== 'draft') {
    return NextResponse.json({
      error: 'Seuls les brouillons peuvent être supprimés',
      status: submission.status,
    }, { status: 409 })
  }

  const { error: delErr } = await supabase
    .from('report_submissions' as any)
    .delete()
    .eq('id', id)
  if (delErr) {
    console.error('[reports/submissions/delete] delete', delErr)
    return NextResponse.json({ error: 'Erreur suppression' }, { status: 500 })
  }

  await logReportAudit({
    submissionId: id,
    action: 'draft_deleted',
    ip: extractIp(req),
    metadata: { slug, week: submission.week_start },
  })

  return NextResponse.json({ ok: true })
}
