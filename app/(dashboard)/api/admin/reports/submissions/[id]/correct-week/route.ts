// POST /api/admin/reports/submissions/[id]/correct-week
// v2.6.17 — Corrige la semaine d'une submission signée + envoi des emails de correction
//
// Body : { newWeekStart: 'YYYY-MM-DD', reason: string (10-500 chars) }
// Auth : requireAuth() — tout user authentifié peut corriger (admin + consultants)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  correctSubmissionWeek,
  CorrectWeekError,
} from '@/lib/report/correct-week'
import {
  sendCorrectionEmail,
  type CorrectionAudience,
} from '@/lib/report/send-notifications'
import { extractIp } from '@/lib/report/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ResultPerRecipient = {
  audience: CorrectionAudience
  to: string
  ok: boolean
  error?: string
}

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
  const newWeekStart = String(body.newWeekStart || '').trim()
  const reason = String(body.reason || '').trim()
  if (!newWeekStart) return NextResponse.json({ error: 'newWeekStart requis' }, { status: 400 })
  if (!reason) return NextResponse.json({ error: 'reason requise' }, { status: 400 })

  const actorEmail = user.email || null
  const actorIp = extractIp(req)

  // ─── 1. Correction (lib) ─────────────────────────────────────────────
  let correction
  try {
    correction = await correctSubmissionWeek({
      submissionId,
      newWeekStart,
      reason,
      actorEmail,
      actorIp,
    })
  } catch (e: any) {
    if (e instanceof CorrectWeekError) {
      const code = e.code === 'NOT_FOUND' ? 404
                 : e.code === 'CONFLICT' ? 409
                 : e.code === 'INVALID' ? 400
                 : e.code === 'NOT_SIGNED' ? 422
                 : 500
      return NextResponse.json({ error: e.message, code: e.code }, { status: code })
    }
    console.error('[correct-week] unexpected', e)
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }

  const { submission, link, fromWeek, toWeek, newPdfs } = correction

  // ─── 2. Préparation PDF en PJ (rapport seul, pas le certificat) ─────
  const attachments = (newPdfs || [])
    .filter(d => !/certificat/i.test(d.name))
    .map(d => ({ filename: d.name, content: d.pdfBase64 }))

  if (attachments.length === 0) {
    console.warn('[correct-week] no report PDF generated — emails will be sent without attachment')
  }

  // ─── 3. Résolution des destinataires ─────────────────────────────────
  const adminClient = createAdminClient()
  const adminEnvEmail = (process.env.ADMIN_EMAIL || '').trim()

  // Créateur du lien (peut être un consultant ou João)
  let creatorEmail = ''
  if (link.created_by) {
    try {
      const { data: creatorUser } = await adminClient.auth.admin.getUserById(link.created_by)
      creatorEmail = (creatorUser?.user?.email || '').trim()
    } catch (e) {
      console.warn('[correct-week] getUserById error:', e instanceof Error ? e.message : String(e))
    }
  }

  // Candidat
  const candidatEmail = (link.candidat_email || '').trim()

  // Client (multi-entreprise via report_link_client_id)
  let clientEmail = ''
  let clientContactName: string | null = null
  let clientName = (link.client_name || '').trim()
  if (submission.report_link_client_id) {
    try {
      const { data: rlc } = await (adminClient as any)
        .from('report_link_clients')
        .select('client_email, client_contact_name, client_name')
        .eq('id', submission.report_link_client_id)
        .maybeSingle()
      if (rlc) {
        clientEmail = (rlc.client_email || '').trim()
        clientContactName = rlc.client_contact_name || null
        clientName = rlc.client_name || clientName
      }
    } catch (e) {
      console.warn('[correct-week] report_link_clients lookup error', e)
    }
  }
  if (!clientEmail) clientEmail = (link.client_email || '').trim()
  if (!clientContactName) clientContactName = link.client_contact_name || null

  const candidateName = (link.candidat_name || '').trim() || 'Le collaborateur'

  // ─── 4. Envoi emails (dedup par email pour éviter doublons) ──────────
  const results: ResultPerRecipient[] = []
  const seen = new Set<string>()

  const targets: { audience: CorrectionAudience; to: string }[] = []
  if (adminEnvEmail) targets.push({ audience: 'admin', to: adminEnvEmail })
  if (creatorEmail && creatorEmail.toLowerCase() !== adminEnvEmail.toLowerCase()) {
    targets.push({ audience: 'admin', to: creatorEmail })
  }
  if (candidatEmail) targets.push({ audience: 'candidat', to: candidatEmail })
  if (clientEmail) targets.push({ audience: 'client', to: clientEmail })

  for (const t of targets) {
    const key = `${t.audience}:${t.to.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    try {
      const r = await sendCorrectionEmail({
        to: t.to,
        audience: t.audience,
        candidateName,
        clientName: clientName || 'le client',
        clientContactName,
        fromWeekLabel: fromWeek.label,
        fromWeekNumber: fromWeek.weekNumber,
        toWeekLabel: toWeek.label,
        toWeekNumber: toWeek.weekNumber,
        reason,
        correctedBy: actorEmail || 'TalentFlow',
        attachments,
      })
      results.push({ audience: t.audience, to: t.to, ok: r.ok, error: r.error })
    } catch (e: any) {
      results.push({ audience: t.audience, to: t.to, ok: false, error: e?.message || String(e) })
    }
  }

  return NextResponse.json({
    ok: true,
    submission_id: submission.id,
    from_week: fromWeek,
    to_week: toWeek,
    pdf_count: attachments.length,
    recipients: results,
  })
}
