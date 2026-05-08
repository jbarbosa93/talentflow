// TalentFlow Rapports — Signature client + completion (Phase 5)
// v2.2.6
//
// POST { signature_data_url } :
//   1. Vérif token valide + non expiré + status='candidate_signed'
//   2. UPDATE submission : status='client_signed', signature client + IP
//   3. Génère le PDF stampé (lib/report/pdf-generator.ts)
//   4. UPDATE submission : status='completed', signed_pdf_paths persistés
//   5. Notifications :
//      - Email ADMIN_EMAIL avec PDFs en PJ
//      - Email/WhatsApp client avec lien public download
//   6. Audit log 'client_signed' + 'completed'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSubmissionByToken, getReportLinkById } from '@/lib/report/queries'
import { logReportAudit, extractIp } from '@/lib/report/audit'
import { generateReportPdf } from '@/lib/report/pdf-generator'
import {
  sendCompletedEmailToAdmin, sendCompletedWhatsAppToClient,
} from '@/lib/report/send-notifications'
import { getWeekDates } from '@/lib/report/week-helpers'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params
  if (!token) return NextResponse.json({ error: 'token manquant' }, { status: 400 })

  let body: any
  try { body = await req.json() } catch { body = {} }
  const signatureDataUrl = typeof body.signature_data_url === 'string' ? body.signature_data_url : null
  if (!signatureDataUrl || !signatureDataUrl.startsWith('data:image/')) {
    return NextResponse.json({ error: 'signature_data_url manquante' }, { status: 400 })
  }

  // 1. Vérif token + status
  const submission = await getSubmissionByToken(token)
  if (!submission) return NextResponse.json({ error: 'Token invalide' }, { status: 404 })
  if (submission.status === 'completed' || submission.status === 'client_signed') {
    return NextResponse.json({ error: 'Déjà signé' }, { status: 409 })
  }
  if (submission.status !== 'candidate_signed') {
    return NextResponse.json({ error: `Statut invalide : ${submission.status}` }, { status: 409 })
  }
  if (submission.client_token_expires_at) {
    const expires = new Date(submission.client_token_expires_at).getTime()
    if (expires < Date.now()) {
      return NextResponse.json({ error: 'Token expiré' }, { status: 410 })
    }
  }

  const link = await getReportLinkById(submission.link_id)
  if (!link) return NextResponse.json({ error: 'Lien introuvable' }, { status: 404 })

  const supabase = createAdminClient()
  const ip = extractIp(req)
  const nowIso = new Date().toISOString()

  // 2. UPDATE 1ère phase : signature client posée, status=client_signed
  const { error: upd1Err } = await supabase
    .from('report_submissions' as any)
    .update({
      status: 'client_signed',
      client_signature_data_url: signatureDataUrl,
      client_signed_at: nowIso,
      client_signed_ip: ip,
    })
    .eq('id', submission.id)

  if (upd1Err) {
    console.error('[reports/client/sign] update error', upd1Err)
    return NextResponse.json({ error: 'Erreur signature' }, { status: 500 })
  }

  await logReportAudit({
    submissionId: submission.id,
    action: 'client_signed',
    ip,
    metadata: { client_email: link.client_email },
  })

  // Refresh submission pour passer la signature client à pdf-generator
  const updatedSubmission = {
    ...submission,
    client_signature_data_url: signatureDataUrl,
    client_signed_at: nowIso,
    client_signed_ip: ip,
    status: 'client_signed' as const,
  }

  // Récup candidat pour pdf-generator (pré-fill autoFill candidat)
  let candidat: { prenom: string | null; nom: string | null; email: string | null } | null = null
  if (link.candidat_id) {
    try {
      const { data } = await supabase
        .from('candidats')
        .select('prenom, nom, email')
        .eq('id', link.candidat_id)
        .maybeSingle()
      candidat = data as { prenom: string | null; nom: string | null; email: string | null } | null
    } catch { /* silent */ }
  }

  // 3. Génération PDF (best-effort)
  let stampedDocs: { name: string; path: string; sha256: string; pdfBase64: string }[] = []
  try {
    stampedDocs = await generateReportPdf({
      link,
      submission: updatedSubmission,
      candidat,
    })
  } catch (e) {
    console.error('[reports/client/sign] generateReportPdf failed', e)
  }

  // 4. UPDATE finale : status=completed (signed_pdf_paths déjà persisté par generateReportPdf)
  await supabase
    .from('report_submissions' as any)
    .update({ status: 'completed' })
    .eq('id', submission.id)

  // 5. Notifications
  const candidateName = candidat
    ? [candidat.prenom, candidat.nom].filter(Boolean).join(' ').trim() || (candidat.email || '')
    : 'Le collaborateur'
  const weekDates = getWeekDates(submission.week_start)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'

  const notifs: { admin_email?: any; client_whatsapp?: any } = {}
  if (stampedDocs.length > 0) {
    const attachments = stampedDocs.map(d => ({
      filename: d.name,
      content: d.pdfBase64,
    }))
    notifs.admin_email = await sendCompletedEmailToAdmin({
      candidateName,
      clientName: link.client_name || link.client_email || '',
      weekLabel: weekDates.label,
      attachments,
      reportLinkUrl: `${appUrl}/sign/rapports/${link.id}`,
    })

    if ((link.delivery_channel === 'whatsapp' || link.delivery_channel === 'both') && link.client_phone) {
      // Lien public download par token (le client_token reste valide post-signature
      // pour permettre re-download ; route /api/reports/client/[token]/download non
      // implémentée ici — on pointe vers la page client qui sait télécharger).
      const downloadUrl = `${appUrl}/report/client/${token}`
      notifs.client_whatsapp = await sendCompletedWhatsAppToClient({
        phone: link.client_phone,
        clientName: link.client_name || link.client_phone,
        candidateName,
        weekLabel: weekDates.label,
        downloadUrl,
      })
    }
  }

  await logReportAudit({
    submissionId: submission.id,
    action: 'completed',
    ip,
    metadata: {
      docsCount: stampedDocs.length,
      signedPdfPaths: stampedDocs.map(d => ({ name: d.name, path: d.path })),
      notifs,
    },
  })

  return NextResponse.json({
    ok: true,
    completed: true,
    docs: stampedDocs.map(d => ({ name: d.name, sha256: d.sha256 })),
  })
}
