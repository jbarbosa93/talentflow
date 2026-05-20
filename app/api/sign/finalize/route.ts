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
  sendSignCompletedEmail, sendSignerSignedNotificationEmail, sendSignUploadedDocsEmail,
} from '@/lib/sign/send-email'
import { sendSignCompletedWhatsApp } from '@/lib/sign/send-whatsapp'
import { generateAndPersistSignedPdfs } from '@/lib/sign/pdf-generator'
import { triggerNextSigner } from '@/lib/sign/sequential'
import { downloadSignDocument } from '@/lib/sign/storage'
import { uploadComplianceFile } from '@/lib/compliance/storage'
import { safeContentType } from '@/lib/utils/mime'

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

      // v2.9.23 — Pièces jointes candidat : email des fichiers au créateur
      // (le candidat ne reçoit pas ses propres scans) + écriture dans l'onglet
      // Conformité de la fiche candidat. Best-effort, ne bloque jamais.
      await processCandidateUploads({ supabase, envelope, senderInfo })

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

// ─── v2.9.23 — Pièces jointes candidat → email créateur + Conformité ───────
//
// À la finalisation : on collecte les fichiers chargés par le candidat dans les
// champs `attachment`, on les envoie au CRÉATEUR (jamais au candidat), et si
// l'enveloppe est liée à un candidat, on les classe dans l'onglet Conformité de
// sa fiche (sauf les champs marqués « ne pas ajouter », ex : le CV).
async function processCandidateUploads(args: {
  supabase: ReturnType<typeof createAdminClient>
  envelope: SignEnvelope
  senderInfo: { name: string; email?: string }
}): Promise<void> {
  const { supabase, envelope, senderInfo } = args
  try {
    if (!envelope.template_id) return

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
    if (attachmentFields.length === 0) return

    // 2. field_values de tous les tokens de l'enveloppe
    const { data: tokRows } = await supabase
      .from('sign_tokens' as any)
      .select('field_values, recipient_name')
      .eq('envelope_id', envelope.id)
    const tokens = (tokRows || []) as unknown as Array<{
      field_values: Record<string, unknown> | null
      recipient_name: string | null
    }>

    // 3. Collecte des fichiers chargés par champ
    type Collected = { field: SignField; files: SignAttachmentFile[]; uploaderName: string }
    const collected: Collected[] = []
    for (const af of attachmentFields) {
      for (const tok of tokens) {
        const v = (tok.field_values || {})[af.id] as SignAttachmentValue | undefined
        const files = (v?.files || []).filter(f => f && typeof f.path === 'string')
        if (files.length > 0) {
          collected.push({ field: af, files, uploaderName: tok.recipient_name || 'le candidat' })
        }
      }
    }
    const allFiles = collected.flatMap(c => c.files)
    if (allFiles.length === 0) return

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

    // 4. Email au créateur avec les fichiers en pièces jointes
    const recipientEmail = senderInfo.email || process.env.ADMIN_EMAIL
    if (recipientEmail) {
      try {
        const attachments: { filename: string; content: string }[] = []
        for (const f of allFiles) {
          const blob = await fetchBlob(f.path)
          if (!blob) continue
          const buf = Buffer.from(await blob.arrayBuffer())
          attachments.push({ filename: f.name || 'document', content: buf.toString('base64') })
        }
        if (attachments.length > 0) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'
          await sendSignUploadedDocsEmail(recipientEmail, {
            envelopeTitle: envelope.title,
            uploaderName: collected[0]?.uploaderName || 'le candidat',
            fileCount: attachments.length,
            attachments,
            envelopeUrl: `${appUrl}/sign/${envelope.id}`,
          })
        }
      } catch (e) {
        console.warn('[finalize] email pièces jointes au créateur échoué', e)
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
  } catch (e) {
    console.error('[sign/finalize] processCandidateUploads échoué (non-bloquant)', e)
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
