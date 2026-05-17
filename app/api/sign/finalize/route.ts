// TalentFlow Sign — PUBLIC : finalise la signature (token utilisé)
// v2.2.0 — Phase 4a
//
// Workflow :
//  1. Vérifie le token
//  2. Vérifie qu'une signature existe (signature_data_url) — sauf rôle 'cc'
//  3. Marque sign_tokens.signed_at = now() + signed_ip + used_at = now()
//  4. Update sign_envelopes.recipients[i].status = 'signed' + signed_at
//  5. Si tous signers ont signé → status = 'completed' + completed_at
//  6. Audit log 'signed' + éventuellement 'completed'
//
// Phase 4b : génère le PDF stampé. Phase 4c : email completed + workflow séquentiel.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyToken } from '@/lib/sign/tokens'
import { logAuditEvent, extractIp } from '@/lib/sign/audit'
import type { SignEnvelope, SignRecipient, SignToken } from '@/lib/sign/types'
import { sendSignCompletedEmail, sendSignerSignedNotificationEmail } from '@/lib/sign/send-email'
import { sendSignCompletedWhatsApp } from '@/lib/sign/send-whatsapp'
import { generateAndPersistSignedPdfs } from '@/lib/sign/pdf-generator'
import { triggerNextSigner } from '@/lib/sign/sequential'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const token = body.token as string | undefined
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ ok: false, error: 'token manquant' }, { status: 400 })
    }

    const result = await verifyToken(token)
    if (!result.valid || !result.token) {
      return NextResponse.json({ ok: false, error: 'token invalide' }, { status: 403 })
    }
    const tokenObj = result.token as SignToken

    if (tokenObj.signed_at) {
      return NextResponse.json({ ok: false, error: 'déjà signé' }, { status: 409 })
    }

    const supabase = createAdminClient()
    const ip = extractIp(req)
    const userAgent = req.headers.get('user-agent') || null

    // 1. Récup enveloppe pour update recipients[].status
    const { data: env, error: envErr } = await supabase
      .from('sign_envelopes' as any)
      .select('*')
      .eq('id', tokenObj.envelope_id)
      .maybeSingle()
    if (envErr || !env) {
      return NextResponse.json({ ok: false, error: 'Enveloppe introuvable' }, { status: 404 })
    }
    const envelope = env as unknown as SignEnvelope
    const recipients = (envelope.recipients || []) as SignRecipient[]

    // Détermine le rôle du destinataire (signer ou cc)
    const lcEmail = tokenObj.recipient_email.toLowerCase().trim()
    const recipient = recipients.find(r => r.email.toLowerCase().trim() === lcEmail)
    const isCC = recipient?.role === 'cc'

    // 2. Vérifie qu'une signature existe (sauf rôle CC qui ne signe pas)
    if (!isCC && !tokenObj.signature_data_url) {
      return NextResponse.json({
        ok: false,
        error: 'Aucune signature adoptée — utilisez d\'abord /api/sign/sign-field',
      }, { status: 400 })
    }

    // 3. Marque le token comme signé/utilisé
    const nowIso = new Date().toISOString()
    const { error: tokErr } = await supabase
      .from('sign_tokens' as any)
      .update({
        signed_at: nowIso,
        signed_ip: ip,
        used_at: nowIso,
      })
      .eq('id', tokenObj.id)

    if (tokErr) {
      console.error('[sign/finalize] update token error', tokErr)
      return NextResponse.json({ ok: false, error: 'Erreur enregistrement' }, { status: 500 })
    }

    // 4. Update sign_envelopes.recipients[i].status
    const updatedRecipients = recipients.map(r => {
      if (r.email.toLowerCase().trim() !== lcEmail) return r
      return {
        ...r,
        status: 'signed' as const,
        signed_at: nowIso,
      }
    })

    // 5. Détermine si tous les signers ont signé → status completed
    const allSignersSigned = updatedRecipients
      .filter(r => r.role !== 'cc')
      .every(r => r.status === 'signed')

    const envelopeUpdate: Record<string, unknown> = {
      recipients: updatedRecipients,
    }
    if (allSignersSigned && envelope.status !== 'completed') {
      envelopeUpdate.status = 'completed'
      envelopeUpdate.completed_at = nowIso
    } else if (envelope.status === 'sent') {
      // Au moins un signer a signé → status devient in_progress
      envelopeUpdate.status = 'in_progress'
    }

    const { error: envUpdErr } = await supabase
      .from('sign_envelopes' as any)
      .update(envelopeUpdate)
      .eq('id', envelope.id)

    if (envUpdErr) {
      console.error('[sign/finalize] update envelope error', envUpdErr)
      // Pas fatal — le token est marqué signé, mais le status enveloppe reste à recalculer
    }

    // 6. Audit log
    await logAuditEvent(envelope.id, 'signed', {
      recipientEmail: tokenObj.recipient_email,
      ip,
      userAgent,
      metadata: {
        method: tokenObj.signature_method || 'drawn',
        role: isCC ? 'Copie' : 'Signataire',
        tokenId: tokenObj.id,
      },
    })

    // ─── Récup info sender (créateur enveloppe) — 1 fois pour completed + notif ───
    const senderInfo = await fetchSenderInfo(supabase, envelope.created_by)

    if (allSignersSigned && envelope.status !== 'completed') {
      // Phase 4b + 4c — Stamp tous les PDFs + envoie copie à tous (best-effort)
      let signedPdfPaths: { name: string; path: string; sha256: string }[] = []
      try {
        signedPdfPaths = await stampAllAndSendEmails({
          supabase,
          envelope,
          updatedRecipients,
          tokenObj,
          signedAt: new Date(nowIso),
          signedIp: ip,
        })
      } catch (e) {
        console.error('[sign/finalize] stamp+email pipeline failed', e)
      }

      // Phase 4d — WhatsApp completed : envoie lien public à chaque destinataire
      // qui a un phone (signers + cc). Pas de PDF en pièce jointe (lien public seulement).
      if (envelope.delivery_channel === 'whatsapp' || envelope.delivery_channel === 'both') {
        await sendCompletedWhatsAppToAll({
          supabase,
          envelope,
          updatedRecipients,
          senderName: senderInfo.name,
        })
      }

      // Phase 4c — Notif email sender (final : "tous ont signé")
      // v2.8.5 — Skip si le sender est DANS les recipients (il reçoit déjà le
      // completed email avec PDF en PJ via sendSignCompletedEmail). Évite le
      // doublon "Toutes les signatures collectées" + "Documents signés".
      const senderInRecipients = senderInfo.email && updatedRecipients.some(
        r => r.email.toLowerCase() === senderInfo.email!.toLowerCase(),
      )
      if (senderInfo.email && !senderInRecipients) {
        await sendSenderNotif({
          envelope,
          senderEmail: senderInfo.email,
          signerName: tokenObj.recipient_name,
          signerEmail: lcEmail,
          signedAt: new Date(nowIso),
          nextSignerName: null,
        })
      }

      await logAuditEvent(envelope.id, 'completed', {
        ip,
        metadata: {
          triggeredBy: lcEmail,
          signedPdfPaths: signedPdfPaths.map(p => ({ name: p.name, path: p.path })),
          docsCount: signedPdfPaths.length,
          channel: envelope.delivery_channel || 'email',
        },
      })
    } else if (!isCC) {
      // Workflow séquentiel : déclenche le prochain signer (selon canal email/whatsapp)
      try {
        await triggerNextSigner({
          envelope,
          updatedRecipients,
          currentSignerEmail: lcEmail,
          sender: senderInfo,
          ttlDays: (envelope as unknown as { expires_in_days?: number | null }).expires_in_days || undefined,
        })
      } catch (e) {
        console.error('[sign/finalize] next signer pipeline failed', e)
      }

      // Phase 4c — Notif email sender ("X a signé, en attente de Y")
      // v2.8.0 — Skip si le sender EST le signataire (sait déjà qu'il a signé).
      if (senderInfo.email && senderInfo.email.toLowerCase() !== lcEmail) {
        const nextSigner = findNextPendingSigner(updatedRecipients, lcEmail)
        await sendSenderNotif({
          envelope,
          senderEmail: senderInfo.email,
          signerName: tokenObj.recipient_name,
          signerEmail: lcEmail,
          signedAt: new Date(nowIso),
          nextSignerName: nextSigner?.name || null,
        })
      }
    }

    return NextResponse.json({
      ok: true,
      completed: allSignersSigned,
      envelopeStatus: envelopeUpdate.status || envelope.status,
    })
  } catch (e) {
    console.error('[sign/finalize] error', e)
    return NextResponse.json({ ok: false, error: 'Erreur serveur' }, { status: 500 })
  }
}

// ─── Phase 4b + 4c — Stamp PDFs + envoie email à tous ──────────────────
//
// Refacto v2.2.5 : la logique de stamping + persistance est extraite dans
// lib/sign/pdf-generator.ts (réutilisable par /api/sign/download).
// Cette fonction se contente de :
//   1. Appeler generateAndPersistSignedPdfs() → upload + persiste signed_pdf_paths
//   2. Récupérer infos sender pour l'email
//   3. Envoyer à tous (signers + cc) + ADMIN_EMAIL avec PDFs en attachement
//
// Retourne les paths persistés (utilisés pour le metadata de l'audit log).
async function stampAllAndSendEmails(args: {
  supabase: ReturnType<typeof createAdminClient>
  envelope: SignEnvelope
  updatedRecipients: SignRecipient[]
  tokenObj: SignToken
  signedAt: Date
  signedIp: string | null
}): Promise<{ name: string; path: string; sha256: string }[]> {
  const { supabase, envelope, updatedRecipients, signedAt, signedIp } = args

  // 1. Stamp + upload + persiste signed_pdf_paths
  const result = await generateAndPersistSignedPdfs({
    envelope,
    recipients: updatedRecipients,
    signedAt,
    signedIp,
  })
  const stampedDocs = result.docs
  if (stampedDocs.length === 0) {
    console.warn('[sign/finalize] aucun PDF stampé')
    return []
  }

  // 2. Récupère le sender (créateur de l'enveloppe) pour l'email
  let senderName = result.senderCompanyName || 'L-Agence SA'
  let senderEmail: string | undefined
  if (envelope.created_by) {
    try {
      const { data: { user } } = await supabase.auth.admin.getUserById(envelope.created_by)
      if (user) {
        const meta = (user.user_metadata as { full_name?: string; entreprise?: string } | null) || null
        senderName = meta?.entreprise?.trim() || meta?.full_name || senderName
        senderEmail = user.email || undefined
      }
    } catch { /* silent */ }
  }

  // 3. Envoi email à tous (signers + cc) + admin L-Agence
  // v2.8.9 — Dedup par email normalisé (lowercase + trim) pour éviter doublon
  // quand l'admin EST déjà dans les recipients (cas : consultant qui s'envoie
  // un contrat à lui-même, ou un recipient avec une casse/espace différent).
  const normalizeEmail = (e: string) => (e || '').toLowerCase().trim()
  const seenEmails = new Set<string>()
  const recipients: { email: string; name: string }[] = []
  for (const r of updatedRecipients) {
    const norm = normalizeEmail(r.email)
    if (!norm || seenEmails.has(norm)) continue
    seenEmails.add(norm)
    recipients.push({ email: r.email, name: r.name })
  }
  const adminEmail = process.env.ADMIN_EMAIL
  if (adminEmail) {
    const normAdmin = normalizeEmail(adminEmail)
    if (normAdmin && !seenEmails.has(normAdmin)) {
      seenEmails.add(normAdmin)
      recipients.push({ email: adminEmail, name: 'L-Agence (admin)' })
    }
  }

  // v2.8.5 — Le certificat n'est PAS envoyé par email à TOUS les destinataires.
  // Il reste accessible UNIQUEMENT via la page détail enveloppe /sign/[id] pour
  // download par le créateur / admin L-Agence si besoin (audit, archive).
  // Avant : tous recevaient contrat + certificat → pollution boîtes candidats.
  const attachments = stampedDocs
    .filter(d => !d.name.startsWith('Certificat de signature'))
    .map(d => ({
      filename: d.name,
      content: d.pdfBase64,
    }))

  for (const rec of recipients) {
    try {
      await sendSignCompletedEmail(rec.email, {
        recipientName: rec.name,
        envelopeTitle: envelope.title,
        senderName,
        senderEmail,
        signedAt,
        attachments,
      })
    } catch (e) {
      console.warn('[sign/finalize] email failed for', rec.email, e)
    }
  }

  return stampedDocs.map(d => ({ name: d.name, path: d.path, sha256: d.sha256 }))
}

// ─── Helpers internes ─────────────────────────────────────────────────────

/**
 * Récupère les infos de l'expéditeur (créateur de l'enveloppe).
 * Retourne fallback 'L-Agence SA' si user introuvable / pas de meta entreprise.
 */
async function fetchSenderInfo(
  supabase: ReturnType<typeof createAdminClient>,
  createdBy: string | null,
): Promise<{ name: string; email?: string }> {
  let name = 'L-Agence SA'
  let email: string | undefined
  if (!createdBy) return { name }
  try {
    const { data: { user } } = await supabase.auth.admin.getUserById(createdBy)
    if (user) {
      const meta = (user.user_metadata as { full_name?: string; entreprise?: string } | null) || null
      name = meta?.entreprise?.trim() || meta?.full_name || name
      email = user.email || undefined
    }
  } catch { /* silent */ }
  return { name, email }
}

/**
 * Trouve le prochain signer "pending" après celui qui vient de signer
 * (ordre croissant, exclu CC, exclu signed).
 */
function findNextPendingSigner(
  recipients: SignRecipient[],
  currentEmail: string,
): SignRecipient | null {
  const lc = currentEmail.toLowerCase().trim()
  const current = recipients.find(r => r.email.toLowerCase().trim() === lc)
  const currentOrder = current?.order ?? 0
  const candidates = recipients
    .filter(r => r.role !== 'cc' && r.status !== 'signed')
    .filter(r => (r.order ?? 0) >= currentOrder)
    .filter(r => r.email.toLowerCase().trim() !== lc)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  return candidates[0] || null
}

/** Notif email au sender avec lien dashboard. Best-effort, pas de throw. */
async function sendSenderNotif(args: {
  envelope: SignEnvelope
  senderEmail: string
  signerName: string
  signerEmail: string
  signedAt: Date
  nextSignerName: string | null
}): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'
  try {
    await sendSignerSignedNotificationEmail({
      to: args.senderEmail,
      envelopeTitle: args.envelope.title,
      signerName: args.signerName,
      signerEmail: args.signerEmail,
      signedAt: args.signedAt,
      nextSignerName: args.nextSignerName,
      envelopeUrl: `${appUrl}/sign/${args.envelope.id}`,
    })
  } catch (e) {
    console.warn('[sign/finalize] sender notif failed', e)
  }
}

/**
 * Phase 4d — Envoie le message WhatsApp "complété" à tous les destinataires
 * qui ont un phone, avec le lien public de download.
 */
async function sendCompletedWhatsAppToAll(args: {
  supabase: ReturnType<typeof createAdminClient>
  envelope: SignEnvelope
  updatedRecipients: SignRecipient[]
  senderName: string
}): Promise<void> {
  const { supabase, envelope, updatedRecipients, senderName } = args
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'

  // Récup tous les tokens (1 par destinataire, lien public utilise leur token)
  const { data: tokRows } = await supabase
    .from('sign_tokens' as any)
    .select('recipient_email, recipient_phone, token')
    .eq('envelope_id', envelope.id)
  const tokens = (tokRows || []) as unknown as Array<{
    recipient_email: string; recipient_phone: string | null; token: string
  }>

  for (const rec of updatedRecipients) {
    const tok = tokens.find(t =>
      t.recipient_email.toLowerCase().trim() === rec.email.toLowerCase().trim(),
    )
    const phone = tok?.recipient_phone || rec.phone
    if (!phone || !tok) continue
    try {
      await sendSignCompletedWhatsApp({
        phone,
        recipientName: rec.name,
        envelopeTitle: envelope.title,
        downloadUrl: `${appUrl}/api/sign/download/public/${tok.token}`,
        senderName,
      })
    } catch (e) {
      console.warn('[sign/finalize] WhatsApp completed failed for', rec.email, e)
    }
  }
}
