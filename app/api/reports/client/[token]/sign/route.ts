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
  sendCompletedEmailToCandidat, sendCompletedWhatsAppToCandidat,
  sendCompletedWhatsAppToClient,
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
  // Anti-DoS data URL — aligné sur sign-field (1.5 MB)
  if (signatureDataUrl.length > 1_500_000) {
    return NextResponse.json({ error: 'signature trop volumineuse (max 1.5 MB)' }, { status: 413 })
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

  // v2.3.5 Bug 5 — Email admin = créateur du lien (pas ADMIN_EMAIL fixe)
  // Fallback : ADMIN_EMAIL si créateur introuvable
  // v2.3.8 Bug 9a — Logs détaillés pour diagnostiquer pourquoi le consultant ne
  // reçoit pas l'email après signature client.
  const adminEnvEmail = process.env.ADMIN_EMAIL || ''
  let creatorEmail: string = adminEnvEmail
  let creatorEmailSource: 'created_by_user' | 'admin_env_fallback' | 'none' = adminEnvEmail ? 'admin_env_fallback' : 'none'
  console.log('[REPORT SIGN] link.created_by:', link.created_by || 'NULL')
  console.log('[REPORT SIGN] ADMIN_EMAIL env present:', !!adminEnvEmail)
  try {
    if (link.created_by) {
      const { data: creatorUser, error: creatorErr } = await supabase.auth.admin.getUserById(link.created_by)
      if (creatorErr) {
        console.error('[REPORT SIGN] getUserById error:', creatorErr.message)
      } else if (creatorUser?.user?.email) {
        creatorEmail = creatorUser.user.email
        creatorEmailSource = 'created_by_user'
        console.log('[REPORT SIGN] Creator email resolved from auth.users:', creatorEmail)
      } else {
        console.warn('[REPORT SIGN] User found but no email field:', JSON.stringify(creatorUser?.user || {}).slice(0, 200))
      }
    } else {
      console.warn('[REPORT SIGN] link.created_by is NULL — falling back to ADMIN_EMAIL')
    }
  } catch (e) {
    console.error('[REPORT SIGN] getUserById exception:', e instanceof Error ? e.message : String(e))
  }
  // v2.9.82 — Override explicite : si notify_email est renseigné sur le lien, il PRIME
  // sur le créateur / ADMIN_EMAIL (modifiable depuis la fiche du lien rapport).
  const notifyOverride = (link as { notify_email?: string | null }).notify_email
  if (notifyOverride && typeof notifyOverride === 'string' && notifyOverride.trim()) {
    creatorEmail = notifyOverride.trim()
    creatorEmailSource = 'created_by_user'
    console.log('[REPORT SIGN] notify_email override actif:', creatorEmail)
  }
  console.log('[REPORT SIGN] Final creatorEmail:', creatorEmail || 'EMPTY', '— source:', creatorEmailSource)

  console.log('[REPORT SIGN] Delivery channel:', link.delivery_channel)
  console.log('[REPORT SIGN] Client email:', link.client_email || 'NONE')
  console.log('[REPORT SIGN] Client phone:', link.client_phone || 'NONE')
  console.log('[REPORT SIGN] Candidat phone:', link.candidat_phone || 'NONE')

  const notifs: {
    admin_email?: { ok: boolean; error?: string }
    client_email?: { ok: boolean; error?: string }
    client_whatsapp?: { ok: boolean; error?: string }
    candidat_email?: { ok: boolean; error?: string }
    candidat_whatsapp?: { ok: boolean; error?: string }
  } = {}

  // v2.3.9 Bug 11 — Filtrage attachments par destinataire :
  //   - Créateur : reçoit RAPPORT + CERTIFICAT (les deux PDFs)
  //   - Client + Candidat : reçoivent UNIQUEMENT le rapport signé
  // Le certificat est privé au créateur du lien (preuve ZertES interne).
  // Distinction par filename : 'certificat' (case insensitive) vs reste = rapport.
  const allAttachments = stampedDocs.length > 0
    ? stampedDocs.map(d => ({ filename: d.name, content: d.pdfBase64 }))
    : []
  const reportAttachments = allAttachments.filter(a => !/certificat/i.test(a.filename))
  const certAttachments = allAttachments.filter(a => /certificat/i.test(a.filename))
  console.log('[REPORT SIGN] Attachments split:', {
    total: allAttachments.length,
    reportOnly: reportAttachments.map(a => a.filename),
    certOnly: certAttachments.map(a => a.filename),
  })

  // 5a. Email créateur du lien (sauf si creator_email === client_email → doublon évité)
  // v2.3.5 Bug 2+5 — creator_email remplace ADMIN_EMAIL fixe.
  // v2.3.5 Bug 4 — downloadUrl (PDF signé) remplace le lien historique dashboard → 404 mobile.
  const pdfDownloadUrl = `${appUrl}/api/reports/${link.slug}/submissions/${submission.id}/download`
  // v2.3.9 Bug 10 — TOUJOURS envoyer la copie au créateur, même si
  // creatorEmail === clientEmail. Le créateur a besoin de SA copie avec le
  // certificat (le client n'en reçoit jamais). L'ancien skip (v2.3.5) cachait
  // le bug "consultant ne reçoit rien" en mode test.
  console.log('[REPORT SIGN] Admin email decision:', {
    creatorEmail: creatorEmail || 'EMPTY',
    clientEmail: link.client_email || 'EMPTY',
    deliveryChannel: link.delivery_channel,
    willSend: !!creatorEmail,
  })
  if (!creatorEmail) {
    console.error('[REPORT SIGN] CRITICAL — Cannot send consultant copy : creatorEmail empty. Check link.created_by + ADMIN_EMAIL env.')
    notifs.admin_email = { ok: false, error: 'creatorEmail empty (no created_by, no ADMIN_EMAIL)' }
  } else {
    try {
      // v2.3.9 Bug 11b — Le créateur reçoit RAPPORT + CERTIFICAT
      // v2.4.0 — Notes candidat + client affichées en bandeau dans l'email créateur uniquement
      notifs.admin_email = await sendCompletedEmailToAdmin({
        to: creatorEmail,
        candidateName,
        clientName: link.client_name || link.client_email || '',
        weekLabel: weekDates.label,
        attachments: allAttachments,
        downloadUrl: pdfDownloadUrl,
        notesCandidat: (submission as any).notes_candidat || null,
        notesClient: (submission as any).notes_client || null,
        clientModified: !!(submission.metadata as any)?.client_modified,
        modifiedFields: Array.isArray((submission.metadata as any)?.modified_fields)
          ? (submission.metadata as any).modified_fields as string[]
          : [],
      })
      if (!notifs.admin_email.ok) {
        console.error('[REPORT SIGN] admin email FAILED — to:', creatorEmail, '— err:', notifs.admin_email.error)
      } else {
        console.log('[REPORT SIGN] admin email sent OK to', creatorEmail, '— Resend id:', (notifs.admin_email as any).id, '— attachments:', allAttachments.map(a => a.filename))
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur admin email'
      console.error('[REPORT SIGN] admin email exception', msg)
      notifs.admin_email = { ok: false, error: msg }
    }
  }

  // 5b. Email client (selon delivery_channel email/both + client_email présent)
  // v2.3.9 Bug 11a — Client reçoit UNIQUEMENT le rapport (pas le certificat)
  if ((link.delivery_channel === 'email' || link.delivery_channel === 'both') && link.client_email) {
    try {
      notifs.client_email = await sendCompletedEmailToClient({
        to: link.client_email,
        clientName: link.client_name || link.client_email,
        clientContactName: link.client_contact_name,
        candidateName,
        weekLabel: weekDates.label,
        attachments: reportAttachments,
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

  // 5b-bis. WhatsApp client — completed (Critique 2)
  if ((link.delivery_channel === 'whatsapp' || link.delivery_channel === 'both') && link.client_phone) {
    try {
      notifs.client_whatsapp = await sendCompletedWhatsAppToClient({
        phone: link.client_phone,
        clientName: link.client_name,
        clientContactName: link.client_contact_name,
        candidateName,
        weekLabel: weekDates.label,
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
  }

  // 5c. Email candidat (post-completion, si candidat_email configuré sur le lien)
  // v2.3.9 Bug 11a — Candidat reçoit UNIQUEMENT le rapport (pas le certificat)
  if (link.candidat_email) {
    try {
      notifs.candidat_email = await sendCompletedEmailToCandidat({
        to: link.candidat_email,
        candidateName,
        clientName: link.client_name || link.client_email || '',
        weekLabel: weekDates.label,
        attachments: reportAttachments,
        clientModified: !!(submission.metadata as any)?.client_modified,
        modifiedFields: Array.isArray((submission.metadata as any)?.modified_fields)
          ? (submission.metadata as any).modified_fields as string[]
          : [],
      })
      if (!notifs.candidat_email.ok) {
        console.error('[reports/client/sign] candidat email FAILED:', notifs.candidat_email.error)
      } else {
        console.log('[reports/client/sign] candidat email sent OK to', link.candidat_email)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur email candidat'
      console.error('[reports/client/sign] candidat email exception', msg)
      notifs.candidat_email = { ok: false, error: msg }
    }
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
