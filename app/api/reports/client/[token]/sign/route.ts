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
  sendCompletedEmailToAdmin, sendCompletedEmailToClient,
  sendCompletedWhatsAppToClient, sendCompletedWhatsAppToCandidat,
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
  console.log('[REPORT SIGN] Starting PDF generation for submission:', submission.id)
  console.log('[REPORT SIGN] Template ID:', link.template_id || 'NONE')
  let stampedDocs: { name: string; path: string; sha256: string; pdfBase64: string }[] = []
  try {
    stampedDocs = await generateReportPdf({
      link,
      submission: updatedSubmission,
      candidat,
    })
    console.log('[REPORT SIGN] PDF generation result:', {
      docsCount: stampedDocs.length,
      pdfSizes: stampedDocs.map(d => ({ name: d.name, base64Len: d.pdfBase64.length, sha256: d.sha256.slice(0, 12) })),
    })
    if (stampedDocs.length === 0) {
      console.warn('[REPORT SIGN] generateReportPdf returned 0 docs — PJ manquante dans les emails')
    }
  } catch (e) {
    console.error('[REPORT SIGN] generateReportPdf FAILED', e)
  }

  // 4. UPDATE finale : status=completed (signed_pdf_paths déjà persisté par generateReportPdf)
  await supabase
    .from('report_submissions' as any)
    .update({ status: 'completed' })
    .eq('id', submission.id)

  // 5. Notifications — v2.3.x bug 6 fix : envoie même si PDF KO (lien public reste utilisable)
  // v2.3.x Bug 7 — Priorité link.candidat_name (source unique) > concat fiche DB > fallback
  const candidateName = (link.candidat_name && link.candidat_name.trim())
    || (candidat ? [candidat.prenom, candidat.nom].filter(Boolean).join(' ').trim() : '')
    || 'Le collaborateur'
  const weekDates = getWeekDates(submission.week_start)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'
  const downloadUrl = `${appUrl}/report/client/${token}`

  console.log('[REPORT SIGN] Delivery channel:', link.delivery_channel)
  console.log('[REPORT SIGN] Client email:', link.client_email || 'NONE')
  console.log('[REPORT SIGN] Client phone:', link.client_phone || 'NONE')
  console.log('[REPORT SIGN] Candidat phone:', link.candidat_phone || 'NONE')

  const notifs: {
    admin_email?: { ok: boolean; error?: string }
    client_email?: { ok: boolean; error?: string }
    client_whatsapp?: { ok: boolean; error?: string }
    candidat_whatsapp?: { ok: boolean; error?: string }
  } = {}

  // v2.3.3 Bug 5b — PDFs en pièce jointe si dispo.
  // Resend attend { filename: string; content: string (base64) }.
  // Si génération PDF échoue : emails envoyés sans PJ (best-effort, lien dashboard inclus).
  const attachments = stampedDocs.length > 0
    ? stampedDocs.map(d => ({ filename: d.name, content: d.pdfBase64 }))
    : []
  console.log('[REPORT SIGN] Attachments count:', attachments.length, '| Sizes:', attachments.map(a => a.content.length))

  // 5a. Email admin (envoyé sauf si admin_email === client_email pour éviter le doublon)
  // v2.3.3 Bug 5a — João teste souvent avec son propre email comme client_email :
  // dans ce cas il recevrait 2 emails identiques. Si destinataires identiques,
  // l'email client (5b) porte le même contenu + PJ donc l'admin n'a pas besoin du sien.
  const adminEmail = process.env.ADMIN_EMAIL
  const skipAdminEmail = !!(adminEmail && link.client_email
    && adminEmail.toLowerCase() === link.client_email.toLowerCase()
    && (link.delivery_channel === 'email' || link.delivery_channel === 'both'))
  if (!skipAdminEmail) {
  try {
    notifs.admin_email = await sendCompletedEmailToAdmin({
      candidateName,
      clientName: link.client_name || link.client_email || '',
      weekLabel: weekDates.label,
      attachments,
      reportLinkUrl: `${appUrl}/sign/rapports/${link.id}`,
    })
    if (!notifs.admin_email.ok) {
      console.error('[reports/client/sign] admin email FAILED:', notifs.admin_email.error)
    } else {
      console.log('[reports/client/sign] admin email sent OK')
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur admin email'
    console.error('[reports/client/sign] admin email exception', msg)
    notifs.admin_email = { ok: false, error: msg }
  }
  } else {
    console.log('[REPORT SIGN] Skip admin email (= client_email, doublon évité)')
    notifs.admin_email = { ok: true }
  }

  // 5b. Email client (selon delivery_channel email/both + client_email présent)
  if ((link.delivery_channel === 'email' || link.delivery_channel === 'both') && link.client_email) {
    try {
      notifs.client_email = await sendCompletedEmailToClient({
        to: link.client_email,
        clientName: link.client_name || link.client_email,
        clientContactName: link.client_contact_name,
        candidateName,
        weekLabel: weekDates.label,
        attachments,
      })
      if (!notifs.client_email.ok) {
        console.error('[reports/client/sign] client email FAILED:', notifs.client_email.error)
      } else {
        console.log('[reports/client/sign] client email sent OK to', link.client_email)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur client email'
      console.error('[reports/client/sign] client email exception', msg)
      notifs.client_email = { ok: false, error: msg }
    }
  } else if (link.delivery_channel === 'email' || link.delivery_channel === 'both') {
    notifs.client_email = { ok: false, error: 'client_email manquant sur le lien' }
    console.warn('[reports/client/sign] client_email manquant — skip notif client email')
  }

  // 5c. WhatsApp client (selon delivery_channel whatsapp/both + client_phone présent)
  if ((link.delivery_channel === 'whatsapp' || link.delivery_channel === 'both') && link.client_phone) {
    try {
      notifs.client_whatsapp = await sendCompletedWhatsAppToClient({
        phone: link.client_phone,
        clientName: link.client_name || link.client_phone,
        clientContactName: link.client_contact_name,
        candidateName,
        weekLabel: weekDates.label,
        downloadUrl,
      })
      if (!notifs.client_whatsapp.ok) {
        console.error('[reports/client/sign] client WhatsApp FAILED:', notifs.client_whatsapp.error)
      } else {
        console.log('[reports/client/sign] client WhatsApp sent OK to', link.client_phone)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur WhatsApp client'
      console.error('[reports/client/sign] client WhatsApp exception', msg)
      notifs.client_whatsapp = { ok: false, error: msg }
    }
  } else if (link.delivery_channel === 'whatsapp' || link.delivery_channel === 'both') {
    notifs.client_whatsapp = { ok: false, error: 'client_phone manquant sur le lien' }
    console.warn('[reports/client/sign] client_phone manquant — skip notif WhatsApp')
  }

  // 5d. WhatsApp candidat (post-completion, si candidat_phone configuré sur le lien)
  // Bug 8c v2.3.x — Notif au candidat que son rapport a été signé.
  // Indépendant du delivery_channel (qui concerne le client).
  if (link.candidat_phone) {
    try {
      const clientLabel = link.client_contact_name?.trim()
        || link.client_name?.trim()
        || 'le client'
      // Lien public download : on utilise l'URL slug candidat
      // (le client_token expire après usage, mais le slug reste perpétuel)
      const candidatDownloadUrl = `${appUrl}/report/${link.slug}`
      notifs.candidat_whatsapp = await sendCompletedWhatsAppToCandidat({
        phone: link.candidat_phone,
        candidatName: candidateName,
        clientLabel,
        weekLabel: weekDates.label,
        downloadUrl: candidatDownloadUrl,
      })
      if (!notifs.candidat_whatsapp.ok) {
        console.error('[REPORT SIGN] candidat WhatsApp FAILED:', notifs.candidat_whatsapp.error)
      } else {
        console.log('[REPORT SIGN] candidat WhatsApp sent OK to', link.candidat_phone)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur WhatsApp candidat'
      console.error('[REPORT SIGN] candidat WhatsApp exception', msg)
      notifs.candidat_whatsapp = { ok: false, error: msg }
    }
  }

  console.log('[REPORT SIGN] Notifications summary:', JSON.stringify(notifs, null, 2))

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
