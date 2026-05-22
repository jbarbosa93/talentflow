// POST /api/admin/reports/submissions/[id]/request-correction
// v2.9.42 — Renvoie un rapport signé au candidat pour qu'il le corrige.
//
// Body : { reason: string (5-500 chars), sendEmail?: boolean }
// Effet :
//   1. Efface les signatures candidat + client + le PDF stampé
//   2. status → 'draft' (le rapport redevient modifiable par le candidat)
//   3. field_values CONSERVÉS (le candidat corrige le rapport déjà rempli)
//   4. metadata.correction_request = { reason, requested_at, requested_by }
//   5. Si sendEmail : email au candidat avec la raison + lien
//   6. Audit log 'correction_requested'
// L'envoi WhatsApp est géré côté client (deep link wa.me).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getReportLinkById } from '@/lib/report/queries'
import { logReportAudit, extractIp } from '@/lib/report/audit'
import { sendCorrectionRequestEmail } from '@/lib/report/send-notifications'
import { getWeekDates } from '@/lib/report/week-helpers'
import type { ReportSubmission } from '@/lib/report/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // ─── Auth ────────────────────────────────────────────────────────────
  const supa = await createClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { id: submissionId } = await params
  if (!submissionId) {
    return NextResponse.json({ error: 'submissionId requis' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const reason = String(body.reason || '').trim()
  const sendEmail = body.sendEmail === true
  if (reason.length < 5) {
    return NextResponse.json({ error: 'Raison trop courte (min 5 caractères)' }, { status: 400 })
  }
  if (reason.length > 500) {
    return NextResponse.json({ error: 'Raison trop longue (max 500 caractères)' }, { status: 400 })
  }

  const actorEmail = user.email || null
  const ip = extractIp(req)
  const nowIso = new Date().toISOString()
  const admin = createAdminClient()

  // ─── 1. Récupère la submission ───────────────────────────────────────
  const { data: subData, error: subErr } = await (admin as any)
    .from('report_submissions')
    .select('*')
    .eq('id', submissionId)
    .maybeSingle()
  if (subErr) return NextResponse.json({ error: 'Erreur DB' }, { status: 500 })
  if (!subData) return NextResponse.json({ error: 'Rapport introuvable' }, { status: 404 })
  const submission = subData as ReportSubmission

  if (submission.status === 'draft') {
    return NextResponse.json(
      { error: "Ce rapport n'est pas encore signé — le candidat peut déjà le modifier." },
      { status: 409 },
    )
  }
  if (submission.status === 'cancelled') {
    return NextResponse.json({ error: 'Ce rapport est annulé.' }, { status: 409 })
  }

  const link = await getReportLinkById(submission.link_id)
  if (!link) return NextResponse.json({ error: 'Lien associé introuvable' }, { status: 404 })

  // ─── 2. Reset : efface signatures + PDF, status → draft ──────────────
  // field_values CONSERVÉS — le candidat corrige le rapport déjà rempli.
  const existingMeta = (submission.metadata || {}) as Record<string, unknown>
  const newMeta: Record<string, unknown> = {
    ...existingMeta,
    correction_request: { reason, requested_at: nowIso, requested_by: actorEmail },
  }
  // Les flags « modifié par le client » de l'ancien cycle ne sont plus pertinents.
  delete newMeta.client_modified
  delete newMeta.modified_fields
  delete newMeta.modified_at

  const { error: updErr } = await (admin as any)
    .from('report_submissions')
    .update({
      status: 'draft',
      candidate_signature_data_url: null,
      candidate_signed_at: null,
      candidate_signed_ip: null,
      client_signature_data_url: null,
      client_signed_at: null,
      client_signed_ip: null,
      client_token: null,
      client_token_expires_at: null,
      signed_pdf_paths: [],
      metadata: newMeta,
      updated_at: nowIso,
    })
    .eq('id', submissionId)
  if (updErr) {
    console.error('[request-correction] update error', updErr)
    return NextResponse.json({ error: 'Échec de la mise à jour' }, { status: 500 })
  }

  // ─── 3. Audit log ────────────────────────────────────────────────────
  await logReportAudit({
    submissionId,
    action: 'correction_requested',
    actorEmail,
    ip,
    metadata: { reason },
  })

  // ─── 4. Email candidat (best-effort) ─────────────────────────────────
  let email: { ok: boolean; error?: string } | null = null
  if (sendEmail) {
    const candidatEmail = (link.candidat_email || '').trim()
    if (!candidatEmail) {
      email = { ok: false, error: 'Aucun email candidat sur le lien' }
    } else {
      const week = getWeekDates(submission.week_start)
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://talent-flow.ch'
      try {
        const r = await sendCorrectionRequestEmail({
          to: candidatEmail,
          candidateName: link.candidat_name || 'Le collaborateur',
          weekLabel: week.label,
          reason,
          reportUrl: `${appUrl}/report/${link.slug}`,
        })
        email = { ok: r.ok, error: r.error }
      } catch (e) {
        email = { ok: false, error: e instanceof Error ? e.message : 'Erreur email' }
      }
    }
  }

  return NextResponse.json({ ok: true, email })
}
