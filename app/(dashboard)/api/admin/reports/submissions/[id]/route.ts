// DELETE /api/admin/reports/submissions/[id]
// v2.9.42 — Suppression complète d'un rapport (tous statuts confondus).
//   - Supprime le(s) PDF stampé(s) du Storage (best-effort)
//   - Supprime la ligne report_submissions → la semaine se libère,
//     le candidat peut la re-soumettre à neuf.
//   - Audit log 'submission_deleted'
// Le rapport disparaît du portail candidat, du portail client et du dashboard.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logReportAudit, extractIp } from '@/lib/report/audit'
import type { ReportSubmission } from '@/lib/report/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // ─── Auth ────────────────────────────────────────────────────────────
  const supa = await createClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'id requis' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: subData, error: subErr } = await (admin as any)
    .from('report_submissions')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (subErr) return NextResponse.json({ error: 'Erreur DB' }, { status: 500 })
  if (!subData) return NextResponse.json({ error: 'Rapport introuvable' }, { status: 404 })
  const submission = subData as ReportSubmission

  // ─── 1. Nettoyage Storage (best-effort) ──────────────────────────────
  const paths = (submission.signed_pdf_paths || [])
    .map(p => p.path)
    .filter((p): p is string => !!p)
  if (paths.length > 0) {
    try {
      await admin.storage.from('talentflow-sign').remove(paths)
    } catch (e) {
      console.warn('[submission delete] storage cleanup failed', e)
    }
  }

  // ─── 2. Suppression de la ligne ──────────────────────────────────────
  const { error: delErr } = await (admin as any)
    .from('report_submissions')
    .delete()
    .eq('id', id)
  if (delErr) {
    console.error('[submission delete] error', delErr)
    return NextResponse.json({ error: 'Erreur suppression' }, { status: 500 })
  }

  // ─── 3. Audit ────────────────────────────────────────────────────────
  await logReportAudit({
    submissionId: id,
    action: 'submission_deleted',
    actorEmail: user.email || null,
    ip: extractIp(req),
    metadata: { week_start: submission.week_start, status: submission.status },
  })

  return NextResponse.json({ ok: true })
}
