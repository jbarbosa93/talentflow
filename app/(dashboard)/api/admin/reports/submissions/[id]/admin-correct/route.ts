// /api/admin/reports/submissions/[id]/admin-correct
// v2.9.42 — Correction administrative : l'admin modifie lui-même tous les champs.
//
// GET  → { fields, fieldValues, weekStart, candidatName, status }
//        (données pour afficher l'éditeur DailyReportTable)
// POST → { fieldValues, newWeekStart?, reason (5-500), sendEmail? }
//        Applique la correction : merge field_values, change la semaine si fournie,
//        régénère le PDF stampé (signatures conservées), audit 'admin_corrected',
//        envoie le PDF corrigé au candidat + au client (si sendEmail).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getReportLinkById } from '@/lib/report/queries'
import { logReportAudit, extractIp } from '@/lib/report/audit'
import { recomputeAutoFillDates } from '@/lib/report/correct-week'
import { generateReportPdf } from '@/lib/report/pdf-generator'
import { sendReportCorrectedEmail, sendClientInviteEmail } from '@/lib/report/send-notifications'
import { getWeekDates, isoDate, parseIsoDate, getMondayOf } from '@/lib/report/week-helpers'
import type { SignField } from '@/lib/sign/types'
import { CLIENT_TOKEN_TTL_MS, type ReportSubmission } from '@/lib/report/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

async function loadTemplateFields(
  admin: ReturnType<typeof createAdminClient>,
  templateId: string | null,
): Promise<SignField[]> {
  if (!templateId) return []
  const { data: tpl } = await (admin as any)
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

// ─── GET — données pour l'éditeur ──────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supa = await createClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  const admin = createAdminClient()
  const { data: subData } = await (admin as any)
    .from('report_submissions').select('*').eq('id', id).maybeSingle()
  if (!subData) return NextResponse.json({ error: 'Rapport introuvable' }, { status: 404 })
  const submission = subData as ReportSubmission

  const link = await getReportLinkById(submission.link_id)
  if (!link) return NextResponse.json({ error: 'Lien introuvable' }, { status: 404 })

  const fields = await loadTemplateFields(admin, link.template_id)

  return NextResponse.json({
    ok: true,
    fields,
    fieldValues: submission.field_values || {},
    weekStart: submission.week_start,
    candidatName: link.candidat_name,
    status: submission.status,
  })
}

// ─── POST — applique la correction ─────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supa = await createClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const fieldValues = (body.fieldValues && typeof body.fieldValues === 'object' && !Array.isArray(body.fieldValues))
    ? body.fieldValues as Record<string, unknown>
    : {}
  const newWeekStart = String(body.newWeekStart || '').trim()
  const reason = String(body.reason || '').trim()
  const sendEmail = body.sendEmail === true
  // v2.9.43 — Rapport pas encore signé par le client : envoyer le lien de signature
  const sendClientSignInvite = body.sendClientSignInvite === true
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

  // 1. Récupère submission + link
  const { data: subData } = await (admin as any)
    .from('report_submissions').select('*').eq('id', id).maybeSingle()
  if (!subData) return NextResponse.json({ error: 'Rapport introuvable' }, { status: 404 })
  const submission = subData as ReportSubmission

  if (submission.status === 'draft') {
    return NextResponse.json(
      { error: "Ce rapport n'est pas signé — utilise plutôt « Renvoyer pour correction »." },
      { status: 409 },
    )
  }
  if (submission.status === 'cancelled') {
    return NextResponse.json({ error: 'Ce rapport est annulé.' }, { status: 409 })
  }

  const link = await getReportLinkById(submission.link_id)
  if (!link) return NextResponse.json({ error: 'Lien introuvable' }, { status: 404 })

  const fields = await loadTemplateFields(admin, link.template_id)

  // 2. Merge field_values + changement de semaine éventuel
  let newFieldValues: Record<string, unknown> = { ...(submission.field_values || {}), ...fieldValues }
  let weekStart = submission.week_start
  let weekEnd = submission.week_end
  let weekChanged = false
  if (newWeekStart && newWeekStart !== submission.week_start) {
    const monday = getMondayOf(parseIsoDate(newWeekStart))
    weekStart = isoDate(monday)
    weekEnd = getWeekDates(monday).end
    newFieldValues = recomputeAutoFillDates(newFieldValues, fields, weekStart)
    weekChanged = true
  }

  // 3. metadata — historique des corrections admin
  const existingMeta = (submission.metadata || {}) as Record<string, unknown>
  const corrections = Array.isArray(existingMeta.admin_corrections)
    ? existingMeta.admin_corrections as unknown[]
    : []
  const newMeta: Record<string, unknown> = {
    ...existingMeta,
    admin_corrections: [...corrections, {
      reason,
      corrected_by: actorEmail,
      corrected_at: nowIso,
      week_changed: weekChanged,
    }],
    last_admin_correction_at: nowIso,
  }

  // 4. UPDATE submission (signatures CONSERVÉES — correction d'autorité L-Agence)
  const { error: updErr } = await (admin as any)
    .from('report_submissions')
    .update({
      field_values: newFieldValues,
      week_start: weekStart,
      week_end: weekEnd,
      metadata: newMeta,
      updated_at: nowIso,
    })
    .eq('id', id)
  if (updErr) {
    console.error('[admin-correct] update error', updErr)
    return NextResponse.json({ error: 'Échec de la mise à jour' }, { status: 500 })
  }

  // 5. Re-fetch + regénère le PDF stampé
  const { data: freshData } = await (admin as any)
    .from('report_submissions').select('*').eq('id', id).maybeSingle()
  const fresh = (freshData || { ...submission, field_values: newFieldValues, week_start: weekStart, week_end: weekEnd }) as ReportSubmission

  let candidat: { prenom: string | null; nom: string | null; email: string | null } | null = null
  if (link.candidat_id) {
    const { data } = await (admin as any)
      .from('candidats').select('prenom, nom, email').eq('id', link.candidat_id).maybeSingle()
    if (data) candidat = data
  }

  let newPdfs: { name: string; pdfBase64: string }[] = []
  try {
    newPdfs = await generateReportPdf({ link, submission: fresh, candidat })
  } catch (e) {
    console.error('[admin-correct] generateReportPdf failed', e)
  }

  // 6. Audit
  await logReportAudit({
    submissionId: id,
    action: 'admin_corrected',
    actorEmail,
    ip,
    metadata: { reason, week_changed: weekChanged, fields_count: Object.keys(fieldValues).length },
  })

  // 7. Notifications (best-effort)
  const week = getWeekDates(weekStart)
  const candidateName = (link.candidat_name || '').trim()
    || (candidat ? [candidat.prenom, candidat.nom].filter(Boolean).join(' ').trim() : '')
    || 'Le collaborateur'
  const attachments = (newPdfs || [])
    .filter(d => !/certificat/i.test(d.name))
    .map(d => ({ filename: d.name, content: d.pdfBase64 }))

  // Email client : multi-entreprise via report_link_client_id, fallback link.client_email
  let clientEmail = ''
  if (submission.report_link_client_id) {
    const { data: rlc } = await (admin as any)
      .from('report_link_clients')
      .select('client_email')
      .eq('id', submission.report_link_client_id)
      .maybeSingle()
    clientEmail = (rlc?.client_email || '').trim()
  }
  if (!clientEmail) clientEmail = (link.client_email || '').trim()

  const emails: { audience: string; to: string; ok: boolean; error?: string }[] = []

  // 7a. PDF corrigé au candidat + au client (rapports déjà finalisés)
  if (sendEmail) {
    const candidatEmail = (link.candidat_email || '').trim()
    if (candidatEmail) {
      try {
        const r = await sendReportCorrectedEmail({
          to: candidatEmail, audience: 'candidat', candidateName,
          weekLabel: week.label, reason, attachments,
        })
        emails.push({ audience: 'candidat', to: candidatEmail, ok: r.ok, error: r.error })
      } catch (e) {
        emails.push({ audience: 'candidat', to: candidatEmail, ok: false, error: e instanceof Error ? e.message : 'err' })
      }
    }
    if (clientEmail) {
      try {
        const r = await sendReportCorrectedEmail({
          to: clientEmail, audience: 'client', candidateName,
          weekLabel: week.label, reason, attachments,
        })
        emails.push({ audience: 'client', to: clientEmail, ok: r.ok, error: r.error })
      } catch (e) {
        emails.push({ audience: 'client', to: clientEmail, ok: false, error: e instanceof Error ? e.message : 'err' })
      }
    }
  }

  // 7b. Invitation client à signer le rapport corrigé (rapport pas encore signé par le client)
  let clientInvite: { ok: boolean; error?: string } | null = null
  if (sendClientSignInvite) {
    if (submission.status !== 'candidate_signed') {
      clientInvite = { ok: false, error: "Le rapport n'est pas en attente de signature client" }
    } else if (!submission.client_token) {
      clientInvite = { ok: false, error: 'Aucun lien de signature client sur ce rapport' }
    } else if (!clientEmail) {
      clientInvite = { ok: false, error: 'Aucun email client renseigné' }
    } else {
      const newExpires = new Date(Date.now() + CLIENT_TOKEN_TTL_MS.remote).toISOString()
      await (admin as any)
        .from('report_submissions')
        .update({ client_token_expires_at: newExpires })
        .eq('id', id)
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://talent-flow.ch'
      try {
        const r = await sendClientInviteEmail({
          to: clientEmail,
          clientName: link.client_name || clientEmail,
          clientContactName: link.client_contact_name,
          candidateName,
          weekLabel: week.label,
          signUrl: `${appUrl}/report/client/${submission.client_token}`,
          expiresAt: newExpires,
        })
        clientInvite = { ok: r.ok, error: r.error }
      } catch (e) {
        clientInvite = { ok: false, error: e instanceof Error ? e.message : 'err' }
      }
      await logReportAudit({
        submissionId: id, action: 'client_notified', actorEmail, ip,
        metadata: { source: 'admin_correction' },
      })
    }
  }

  return NextResponse.json({ ok: true, pdf_count: attachments.length, emails, clientInvite })
}
