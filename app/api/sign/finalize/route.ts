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
import type {
  SignEnvelope, SignRecipient, SignToken,
  SignDocument, SignField, SignAttachmentValue, SignAttachmentFile,
} from '@/lib/sign/types'
import {
  sendSignCompletedEmail, sendSignerSignedNotificationEmail, sendSignFinalRecapEmail,
} from '@/lib/sign/send-email'
import { sendSignCompletedWhatsApp } from '@/lib/sign/send-whatsapp'
import { generateAndPersistSignedPdfs } from '@/lib/sign/pdf-generator'
import { triggerNextSigner } from '@/lib/sign/sequential'
import { downloadSignDocument } from '@/lib/sign/storage'
import { uploadComplianceFile } from '@/lib/compliance/storage'
import { safeContentType } from '@/lib/utils/mime'
import { composeImagesToPdf, isComposableImage, type ComposableImage } from '@/lib/sign/compose-attachment-pdf'

export const runtime = 'nodejs'
// v2.9.23 — Marge pour le traitement des pièces jointes candidat (download +
// email créateur + écriture Conformité) en plus du stamping PDF + emails.
export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const token = body.token as string | undefined
    // v2.9.24 — Filet de sécurité : le client envoie aussi ses field_values
    // dans le body (au cas où le debounce 600ms n'aurait pas encore tiré).
    const bodyFieldValues = (body.fieldValues && typeof body.fieldValues === 'object')
      ? body.fieldValues as Record<string, unknown>
      : null
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
    const tokenUpdate: Record<string, unknown> = {
      signed_at: nowIso,
      signed_ip: ip,
      used_at: nowIso,
    }
    // v2.9.24 — On réécrit les field_values transmis par le client juste avant
    // de figer le token : garantit que les dernières valeurs (pièces jointes
    // incluses) sont en DB même si le debounce client a sauté.
    if (bodyFieldValues) {
      tokenUpdate.field_values = bodyFieldValues
    }
    const { error: tokErr } = await supabase
      .from('sign_tokens' as any)
      .update(tokenUpdate)
      .eq('id', tokenObj.id)

    if (tokErr) {
      console.error('[sign/finalize] update token error', tokErr)
      return NextResponse.json({ ok: false, error: 'Erreur enregistrement' }, { status: 500 })
    }

    // 4. v2.9.24 — Re-lecture FRAÎCHE de l'enveloppe avant de toucher recipients[]
    // (sinon on écrase le status d'un autre signataire ayant signé entre-temps —
    // même faille de lecture-modification-écriture JSONB que l'incident #77).
    const { data: freshEnv } = await supabase
      .from('sign_envelopes' as any)
      .select('recipients, status')
      .eq('id', envelope.id)
      .maybeSingle()
    const freshRecipients = (((freshEnv as unknown as { recipients?: SignRecipient[] })?.recipients)
      || recipients) as SignRecipient[]
    const freshStatus = (freshEnv as unknown as { status?: string })?.status || envelope.status

    const updatedRecipients = freshRecipients.map(r => {
      if (r.email.toLowerCase().trim() !== lcEmail) return r
      return { ...r, status: 'signed' as const, signed_at: nowIso }
    })

    // Écrit recipients[] (pour l'affichage). La décision de complétion ne dépend
    // PAS de ce JSONB mais de la table sign_tokens (1 ligne/destinataire, fiable).
    const { error: envUpdErr } = await supabase
      .from('sign_envelopes' as any)
      .update({ recipients: updatedRecipients })
      .eq('id', envelope.id)
    if (envUpdErr) {
      console.error('[sign/finalize] update recipients error', envUpdErr)
    }

    // 5. v2.9.24 — allSignersSigned dérivé de sign_tokens (source fiable, pas de
    // race JSONB) : chaque signataire doit avoir un token avec signed_at.
    const { data: allTokRows } = await supabase
      .from('sign_tokens' as any)
      .select('recipient_email, signed_at')
      .eq('envelope_id', envelope.id)
    const signedEmails = new Set(
      ((allTokRows || []) as unknown as Array<{ recipient_email: string; signed_at: string | null }>)
        .filter(t => t.signed_at)
        .map(t => (t.recipient_email || '').toLowerCase().trim()),
    )
    const signerRecipients = updatedRecipients.filter(r => r.role !== 'cc')
    const allSignersSigned = signerRecipients.length > 0
      && signerRecipients.every(r => signedEmails.has(r.email.toLowerCase().trim()))

    // 5b. v2.9.24 — Verrou de complétion ATOMIQUE. L'UPDATE conditionnel
    // `WHERE status != 'completed'` ne réussit que pour UNE seule requête → le
    // bloc de complétion (PDF + emails) ne s'exécute jamais en double, et
    // l'enveloppe n'est plus jamais bloquée en « in_progress ».
    let weCompletedIt = false
    if (allSignersSigned) {
      const { data: completedRows } = await supabase
        .from('sign_envelopes' as any)
        .update({ status: 'completed', completed_at: nowIso })
        .eq('id', envelope.id)
        .neq('status', 'completed')
        .select('id')
      weCompletedIt = Array.isArray(completedRows) && completedRows.length > 0
    } else if (freshStatus === 'sent') {
      await supabase
        .from('sign_envelopes' as any)
        .update({ status: 'in_progress' })
        .eq('id', envelope.id)
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

    if (weCompletedIt) {
      // v2.9.31 — Le créateur reçoit UN SEUL email fusionné (docs signés +
      // pièces jointes candidat). On l'identifie ici pour l'exclure de l'email
      // "completed" standard envoyé aux autres destinataires.
      const creatorEmail = senderInfo.email || process.env.ADMIN_EMAIL || undefined

      // Phase 4b + 4c — Stamp tous les PDFs + envoie copie aux destinataires
      // (best-effort). Le créateur est exclu : il aura l'email fusionné.
      let stampResult: {
        paths: { name: string; path: string; sha256: string }[]
        signedAttachments: { filename: string; content: string }[]
      } = { paths: [], signedAttachments: [] }
      try {
        stampResult = await stampAllAndSendEmails({
          supabase,
          envelope,
          updatedRecipients,
          tokenObj,
          signedAt: new Date(nowIso),
          signedIp: ip,
          creatorEmail,
        })
      } catch (e) {
        console.error('[sign/finalize] stamp+email pipeline failed', e)
      }
      const signedPdfPaths = stampResult.paths

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

      // v2.9.23 — Pièces jointes candidat : on collecte les fichiers chargés
      // par le candidat + on les classe dans l'onglet Conformité. Best-effort.
      let uploadResult: {
        attachments: { filename: string; content: string }[]
        uploaderName: string
      } = { attachments: [], uploaderName: 'le candidat' }
      try {
        uploadResult = await processCandidateUploads({ supabase, envelope, creatorEmail })
      } catch (e) {
        console.error('[sign/finalize] processCandidateUploads échoué', e)
      }

      // v2.9.31 — UN SEUL email fusionné au créateur : documents signés +
      // pièces jointes chargées par le candidat. Remplace les 2 emails séparés
      // ("Documents signés" + "X documents chargés"). Le candidat, lui, ne
      // reçoit QUE ses documents signés (jamais ses propres scans).
      if (creatorEmail) {
        try {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'
          await sendSignFinalRecapEmail(creatorEmail, {
            envelopeTitle: envelope.title,
            uploaderName: uploadResult.uploaderName,
            signedCount: stampResult.signedAttachments.length,
            uploadCount: uploadResult.attachments.length,
            signedAt: new Date(nowIso),
            attachments: [...stampResult.signedAttachments, ...uploadResult.attachments],
            envelopeUrl: `${appUrl}/sign/${envelope.id}`,
          })
        } catch (e) {
          console.warn('[sign/finalize] email récap fusionné échoué', e)
        }
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
    } else if (!isCC && !allSignersSigned) {
      // Workflow séquentiel : déclenche le prochain signer (selon canal email/whatsapp).
      // v2.9.24 — `&& !allSignersSigned` : si tout est signé mais qu'on a perdu la
      // course au verrou de complétion, on ne déclenche rien (le gagnant gère tout).
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
      // v2.9.19 — Skip AUSSI si le sender est le prochain signataire : il va
      // recevoir l'email d'invitation contextuel ("X a signé, vérifie et confirme")
      // → inutile de lui envoyer un 2e email de notification.
      if (senderInfo.email && senderInfo.email.toLowerCase() !== lcEmail) {
        const nextSigner = findNextPendingSigner(updatedRecipients, lcEmail)
        const senderIsNextSigner = !!nextSigner
          && nextSigner.email.toLowerCase().trim() === senderInfo.email.toLowerCase().trim()
        if (!senderIsNextSigner) {
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
    }

    return NextResponse.json({
      ok: true,
      completed: allSignersSigned,
      envelopeStatus: allSignersSigned ? 'completed' : 'in_progress',
    })
  } catch (e) {
    console.error('[sign/finalize] error', e)
    return NextResponse.json({ ok: false, error: 'Erreur serveur' }, { status: 500 })
  }
}

/**
 * Garantit que le nom de fichier finit par `.pdf`.
 * v2.9.31 — Sans extension, les clients mail interprètent la pièce jointe
 * comme un fichier texte (.txt) → le PDF signé s'ouvrait dans TextEdit.
 */
function ensurePdfFilename(name: string): string {
  const n = (name || 'document').trim()
  return /\.pdf$/i.test(n) ? n : `${n}.pdf`
}

// ─── Phase 4b + 4c — Stamp PDFs + envoie email aux destinataires ───────────
//
// Refacto v2.2.5 : la logique de stamping + persistance est extraite dans
// lib/sign/pdf-generator.ts (réutilisable par /api/sign/download).
// Cette fonction :
//   1. Appelle generateAndPersistSignedPdfs() → upload + persiste signed_pdf_paths
//   2. Récupère infos sender pour l'email
//   3. Envoie à tous les destinataires (signers + cc) SAUF le créateur, qui
//      reçoit séparément un email fusionné (docs signés + pièces jointes).
//
// Retourne les paths persistés (audit log) + les pièces jointes base64 des
// documents signés (réutilisées pour l'email fusionné du créateur).
async function stampAllAndSendEmails(args: {
  supabase: ReturnType<typeof createAdminClient>
  envelope: SignEnvelope
  updatedRecipients: SignRecipient[]
  tokenObj: SignToken
  signedAt: Date
  signedIp: string | null
  /** Email du créateur — exclu de l'envoi (il reçoit l'email fusionné) */
  creatorEmail?: string
}): Promise<{
  paths: { name: string; path: string; sha256: string }[]
  signedAttachments: { filename: string; content: string }[]
}> {
  const { supabase, envelope, updatedRecipients, signedAt, signedIp, creatorEmail } = args

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
    return { paths: [], signedAttachments: [] }
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
  // v2.9.31 — ensurePdfFilename : le nom de doc n'a pas toujours l'extension
  // `.pdf` → sans elle, la PJ s'ouvrait comme un fichier texte.
  const signedAttachments = stampedDocs
    .filter(d => !d.name.startsWith('Certificat de signature'))
    .map(d => ({
      filename: ensurePdfFilename(d.name),
      content: d.pdfBase64,
    }))

  // v2.9.31 — Le créateur ne reçoit PAS cet email "completed" : il recevra un
  // email fusionné unique (docs signés + pièces jointes candidat).
  const creatorNorm = normalizeEmail(creatorEmail || '')
  for (const rec of recipients) {
    if (creatorNorm && normalizeEmail(rec.email) === creatorNorm) continue
    try {
      await sendSignCompletedEmail(rec.email, {
        recipientName: rec.name,
        envelopeTitle: envelope.title,
        senderName,
        senderEmail,
        signedAt,
        attachments: signedAttachments,
      })
    } catch (e) {
      console.warn('[sign/finalize] email failed for', rec.email, e)
    }
  }

  return {
    paths: stampedDocs.map(d => ({ name: d.name, path: d.path, sha256: d.sha256 })),
    signedAttachments,
  }
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

// ─── v2.9.23 — Pièces jointes candidat → Conformité + retour pour email ────
//
// À la finalisation : on collecte les fichiers chargés par le candidat dans les
// champs `attachment`, on les classe dans l'onglet Conformité de sa fiche (si
// l'enveloppe est liée à un candidat, sauf champs « ne pas ajouter » ex : CV),
// et on RETOURNE les pièces jointes (base64) pour l'email fusionné du créateur.
// v2.9.31 — Cette fonction n'envoie plus d'email : le créateur reçoit un seul
// email fusionné (docs signés + pièces jointes) géré par le bloc finalize.
async function processCandidateUploads(args: {
  supabase: ReturnType<typeof createAdminClient>
  envelope: SignEnvelope
  /** Email du créateur — sert à identifier le VRAI candidat ayant chargé */
  creatorEmail?: string
}): Promise<{ attachments: { filename: string; content: string }[]; uploaderName: string }> {
  const { supabase, envelope, creatorEmail } = args
  const empty = { attachments: [] as { filename: string; content: string }[], uploaderName: 'le candidat' }
  try {
    if (!envelope.template_id) return empty

    // 1. Champs `attachment` du template
    const { data: tpl } = await supabase
      .from('sign_templates' as any)
      .select('documents')
      .eq('id', envelope.template_id)
      .maybeSingle()
    const tplDocs = ((tpl as unknown as { documents?: SignDocument[] })?.documents || [])
    const attachmentFields: SignField[] = []
    for (const d of tplDocs) {
      for (const f of (d.fields || [])) {
        if (f.type === 'attachment') attachmentFields.push(f)
      }
    }
    if (attachmentFields.length === 0) return empty

    // 2. field_values de tous les tokens de l'enveloppe
    const { data: tokRows } = await supabase
      .from('sign_tokens' as any)
      .select('field_values, recipient_name, recipient_email')
      .eq('envelope_id', envelope.id)
    const tokens = (tokRows || []) as unknown as Array<{
      field_values: Record<string, unknown> | null
      recipient_name: string | null
      recipient_email: string | null
    }>

    // 3. Collecte des fichiers chargés par champ.
    // v2.9.31 — DÉDUP : la valeur d'un champ pièce jointe est recopiée sur
    // PLUSIEURS tokens (le candidat la remplit, puis le consultant la voit en
    // « valeur précédente » et son token la réenregistre). On dédup par chemin
    // de fichier → chaque fichier n'apparaît qu'une fois. On traite d'abord
    // les tokens NON-créateur pour que `uploaderName` soit le vrai candidat.
    const creatorNorm = (creatorEmail || '').toLowerCase().trim()
    const orderedTokens = [...tokens].sort((a, b) => {
      const aC = (a.recipient_email || '').toLowerCase().trim() === creatorNorm ? 1 : 0
      const bC = (b.recipient_email || '').toLowerCase().trim() === creatorNorm ? 1 : 0
      return aC - bC
    })
    type Collected = { field: SignField; files: SignAttachmentFile[]; uploaderName: string }
    const collected: Collected[] = []
    for (const af of attachmentFields) {
      const seenPaths = new Set<string>()
      const files: SignAttachmentFile[] = []
      let uploaderName = ''
      for (const tok of orderedTokens) {
        const v = (tok.field_values || {})[af.id] as SignAttachmentValue | undefined
        for (const f of (v?.files || [])) {
          if (!f || typeof f.path !== 'string' || seenPaths.has(f.path)) continue
          seenPaths.add(f.path)
          files.push(f)
          if (!uploaderName && tok.recipient_name) uploaderName = tok.recipient_name
        }
      }
      if (files.length > 0) {
        collected.push({ field: af, files, uploaderName: uploaderName || 'le candidat' })
      }
    }
    if (collected.length === 0) return empty

    // Cache de téléchargement (un fichier peut servir email + Conformité)
    const blobCache = new Map<string, Blob>()
    const fetchBlob = async (path: string): Promise<Blob | null> => {
      if (blobCache.has(path)) return blobCache.get(path)!
      try {
        const b = await downloadSignDocument(path)
        blobCache.set(path, b)
        return b
      } catch (e) {
        console.warn('[finalize] download pièce jointe échoué', path, e)
        return null
      }
    }
    // Nom de fichier propre basé sur le champ (ex: « CV.pdf », « Permis (2).jpg »).
    const extOf = (name: string | undefined): string => {
      const m = (name || '').match(/\.([a-z0-9]{1,5})$/i)
      return m ? m[1].toLowerCase() : 'jpg'
    }
    const namedFile = (base: string, original: string | undefined, idx: number): string =>
      idx > 0 ? `${base} (${idx}).${extOf(original)}` : `${base}.${extOf(original)}`

    // 4. Construit les pièces jointes pour l'email fusionné du créateur.
    // v2.9.25 — Les images JPEG/PNG d'un MÊME champ (recto + verso) sont
    // assemblées en UN seul PDF A4 « type scan ». v2.9.31 — Inclut le cas
    // 1 seule image (CV photo → CV.pdf) + nom de fichier basé sur le champ.
    const attachments: { filename: string; content: string }[] = []
    for (const c of collected) {
      const imgFiles = c.files.filter(f => isComposableImage(f.mimeType, f.name))
      const otherFiles = c.files.filter(f => !isComposableImage(f.mimeType, f.name))
      const baseName = ((c.field.tooltip || c.field.label || 'Document')
        .replace(/[^\w\s.-]+/g, ' ').trim() || 'Document').slice(0, 80)

      // ≥ 1 image → 1 PDF A4 nommé d'après le champ. Sinon → fichiers bruts.
      if (imgFiles.length >= 1) {
        const composable: ComposableImage[] = []
        for (const f of imgFiles) {
          const blob = await fetchBlob(f.path)
          if (!blob) continue
          composable.push({
            buffer: Buffer.from(await blob.arrayBuffer()),
            mimeType: f.mimeType || blob.type || '',
            name: f.name || 'image',
          })
        }
        const composed = composable.length >= 1 ? await composeImagesToPdf(composable) : null
        if (composed) {
          attachments.push({ filename: `${baseName}.pdf`, content: composed.toString('base64') })
        } else {
          // Composition échouée → fichiers bruts, nommés d'après le champ
          let idx = 1
          for (const f of imgFiles) {
            const blob = await fetchBlob(f.path)
            if (!blob) continue
            attachments.push({
              filename: namedFile(baseName, f.name, imgFiles.length > 1 ? idx++ : 0),
              content: Buffer.from(await blob.arrayBuffer()).toString('base64'),
            })
          }
        }
      }
      // Fichiers non composables (PDF, webp, heic…) → bruts, nommés d'après le champ
      let oIdx = 1
      for (const f of otherFiles) {
        const blob = await fetchBlob(f.path)
        if (!blob) continue
        attachments.push({
          filename: namedFile(baseName, f.name, otherFiles.length > 1 ? oIdx++ : 0),
          content: Buffer.from(await blob.arrayBuffer()).toString('base64'),
        })
      }
    }

    // 5. Conformité — uniquement si l'enveloppe est liée à un candidat
    if (envelope.candidate_id) {
      for (const c of collected) {
        const docTypeId = c.field.attachmentComplianceTypeId
        if (!docTypeId) continue  // ex: CV → « ne pas ajouter »
        // Paires recto/verso : un document Conformité = 2 fichiers max
        for (let i = 0; i < c.files.length; i += 2) {
          await writeComplianceDoc({
            supabase,
            candidatId: envelope.candidate_id,
            documentTypeId: docTypeId,
            label: (c.field.tooltip || c.field.label || 'Document').slice(0, 200),
            files: c.files.slice(i, i + 2),
            envelopeId: envelope.id,
            createdBy: envelope.created_by,
            fetchBlob,
          })
        }
      }
    }

    // 6. v2.9.46 — Photo de profil candidat (si flagué + fiche sans photo)
    if (envelope.candidate_id) {
      for (const c of collected) {
        if (!c.field.attachmentSetAsCandidatePhoto) continue
        const firstImg = c.files.find(f => (f.mimeType || '').startsWith('image/'))
        if (!firstImg) continue
        try {
          await maybeSetCandidatPhotoFromSign({
            supabase,
            candidatId: envelope.candidate_id,
            file: firstImg,
            fetchBlob,
          })
        } catch (e) {
          console.warn('[finalize] maybeSetCandidatPhotoFromSign échoué', e)
        }
      }
    }

    return { attachments, uploaderName: collected[0]?.uploaderName || 'le candidat' }
  } catch (e) {
    console.error('[sign/finalize] processCandidateUploads échoué (non-bloquant)', e)
    return empty
  }
}

/** Crée une ligne candidat_documents (1 ou 2 fichiers) dans la Conformité. */
async function writeComplianceDoc(args: {
  supabase: ReturnType<typeof createAdminClient>
  candidatId: string
  documentTypeId: string
  label: string
  files: SignAttachmentFile[]
  envelopeId: string
  createdBy: string | null
  fetchBlob: (path: string) => Promise<Blob | null>
}): Promise<void> {
  const { supabase, candidatId, documentTypeId, label, files, envelopeId, createdBy, fetchBlob } = args
  try {
    const expiry = files.map(f => f.expiryDate).find(d => !!d) || null
    // 1. INSERT de la ligne (pour récupérer l'id)
    const { data: inserted, error: insErr } = await (supabase as any)
      .from('candidat_documents')
      .insert({
        candidat_id: candidatId,
        document_type_id: documentTypeId,
        label,
        expiry_date: expiry,
        notes: 'Importé depuis TalentFlow Sign',
        created_by: createdBy,
        metadata: { source: 'sign_envelope', envelope_id: envelopeId },
      })
      .select('id')
      .single()
    if (insErr || !inserted) {
      console.warn('[finalize] candidat_documents insert échoué', insErr)
      return
    }
    const docId = inserted.id as string

    // 2. Upload des fichiers (recto = 1er, verso = 2e)
    const patch: Record<string, string> = {}
    for (let i = 0; i < files.length && i < 2; i++) {
      const f = files[i]
      const side: 'recto' | 'verso' = i === 0 ? 'recto' : 'verso'
      const blob = await fetchBlob(f.path)
      if (!blob) continue
      try {
        const mime = safeContentType(f.mimeType || blob.type || 'application/octet-stream', f.name)
        const path = await uploadComplianceFile({
          candidatId, documentId: docId, side, file: blob, mimeType: mime,
        })
        patch[side === 'recto' ? 'file_recto_path' : 'file_verso_path'] = path
      } catch (e) {
        console.warn('[finalize] upload fichier Conformité échoué', f.path, e)
      }
    }
    if (Object.keys(patch).length > 0) {
      await (supabase as any).from('candidat_documents').update(patch).eq('id', docId)
    }
  } catch (e) {
    console.warn('[finalize] writeComplianceDoc échoué', e)
  }
}

/**
 * v2.9.46 — Si le candidat n'a pas encore de photo de profil, utilise la 1ʳᵉ image
 * chargée via un champ « pièce jointe » flagué `attachmentSetAsCandidatePhoto`
 * (ex: photo selfie). Upload dans le bucket `cvs/photos/{candidatId}/...`,
 * signed URL 10 ans, UPDATE candidats.photo_url. Best-effort, non-bloquant.
 */
async function maybeSetCandidatPhotoFromSign(args: {
  supabase: ReturnType<typeof createAdminClient>
  candidatId: string
  file: SignAttachmentFile
  fetchBlob: (path: string) => Promise<Blob | null>
}): Promise<void> {
  const { supabase, candidatId, file, fetchBlob } = args
  // 1. Vérifier que la fiche n'a pas déjà une photo
  const { data: cand } = await (supabase as any)
    .from('candidats')
    .select('photo_url')
    .eq('id', candidatId)
    .maybeSingle()
  const existing = (cand?.photo_url || '').trim()
  if (existing) {
    console.log('[finalize] candidat a déjà une photo — set photo skipped')
    return
  }
  // 2. Fetch + upload dans cvs/photos/{candidatId}/sign-selfie-{ts}.{ext}
  const blob = await fetchBlob(file.path)
  if (!blob) return
  const mime = (file.mimeType || blob.type || 'image/jpeg').toLowerCase()
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'
  const ts = Date.now()
  const path = `photos/${candidatId}/sign-selfie-${ts}.${ext}`
  const { error: upErr } = await (supabase as any).storage
    .from('cvs')
    .upload(path, blob, { contentType: mime, upsert: false })
  if (upErr) {
    console.warn('[finalize] upload photo selfie échoué', upErr)
    return
  }
  // 3. Signed URL 10 ans
  const { data: pUrl } = await (supabase as any).storage
    .from('cvs')
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10)
  const signedUrl = pUrl?.signedUrl || null
  if (!signedUrl) return
  // 4. UPDATE candidats.photo_url (uniquement si toujours vide — anti race condition)
  await (supabase as any)
    .from('candidats')
    .update({ photo_url: signedUrl })
    .eq('id', candidatId)
    .or('photo_url.is.null,photo_url.eq.')
  console.log('[finalize] photo profil candidat définie depuis selfie Sign')
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
