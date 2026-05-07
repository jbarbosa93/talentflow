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
import type { SignEnvelope, SignRecipient, SignToken, SignDocument, SignTemplate } from '@/lib/sign/types'
import { stampPdf } from '@/lib/sign/pdf-stamp'
import { sendSignCompletedEmail, sendSignInviteEmail } from '@/lib/sign/send-email'
import { uploadSignDocument } from '@/lib/sign/storage'
import { generateTokensForEnvelope } from '@/lib/sign/tokens'

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

    if (allSignersSigned && envelope.status !== 'completed') {
      await logAuditEvent(envelope.id, 'completed', {
        ip,
        metadata: { triggeredBy: lcEmail },
      })
      // Phase 4b + 4c — Stamp tous les PDFs + envoie copie à tous (best-effort)
      // On ne bloque PAS la réponse en cas d'erreur ici (log + on continue)
      try {
        await stampAllAndSendEmails({
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
    } else if (!isCC) {
      // v2.2.0 Phase 4a-bis-5 — Workflow séquentiel : si ce signer vient de signer
      // mais qu'il reste des signers, on déclenche le token + email du PROCHAIN signer
      try {
        await sendNextSigner({
          supabase,
          envelope,
          updatedRecipients,
          currentSignerEmail: lcEmail,
          ip,
        })
      } catch (e) {
        console.error('[sign/finalize] next signer pipeline failed', e)
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
// 1. Récupère le template + tokens de tous les signers (pour leurs valeurs)
// 2. Pour chaque doc : récupère le PDF source, stamp avec les valeurs de CHAQUE
//    signer (un PDF unique stampé avec toutes les valeurs combinées)
// 3. Upload les PDFs stampés dans signed/{envelopeId}/
// 4. Envoie à tous les destinataires (signers + cc) + ADMIN_EMAIL un email
//    avec les PDFs stampés en attachement
async function stampAllAndSendEmails(args: {
  supabase: ReturnType<typeof createAdminClient>
  envelope: SignEnvelope
  updatedRecipients: SignRecipient[]
  tokenObj: SignToken
  signedAt: Date
  signedIp: string | null
}) {
  const { supabase, envelope, updatedRecipients, signedAt, signedIp } = args

  // 1. Récupère le template (documents)
  if (!envelope.template_id) {
    console.warn('[sign/finalize] envelope sans template_id, stamp impossible')
    return
  }
  const { data: tpl } = await supabase
    .from('sign_templates' as any)
    .select('documents')
    .eq('id', envelope.template_id)
    .maybeSingle()
  const template = tpl as unknown as Pick<SignTemplate, 'documents'> | null
  const documents = (template?.documents || []) as SignDocument[]
  if (documents.length === 0) return

  // 2. Récupère tous les tokens de l'enveloppe (pour leurs field_values + signature)
  const { data: tokens } = await supabase
    .from('sign_tokens' as any)
    .select('id, recipient_email, recipient_name, signature_data_url, field_values')
    .eq('envelope_id', envelope.id)
  const allTokens = (tokens || []) as unknown as Array<{
    id: string
    recipient_email: string
    recipient_name: string
    signature_data_url: string | null
    field_values: Record<string, unknown> | null
  }>

  // v2.2.2 — Récup companyName (override context_data > sender.entreprise meta) et
  // title (= candidat.metier_recherche) pour les fields auto-fill type=company / type=title.
  let stampCompanyName = ''
  let stampTitle = ''
  try {
    const ctx = (envelope as unknown as { context_data?: Record<string, unknown> | null }).context_data || null
    if (ctx && typeof ctx.companyName === 'string' && ctx.companyName.trim()) {
      stampCompanyName = ctx.companyName.trim()
    } else if (envelope.created_by) {
      const { data: { user: senderUser } } = await supabase.auth.admin.getUserById(envelope.created_by)
      const meta = (senderUser?.user_metadata as { entreprise?: string } | null) || null
      if (meta?.entreprise && meta.entreprise.trim()) stampCompanyName = meta.entreprise.trim()
    }
    if (!stampCompanyName) stampCompanyName = 'L-Agence SA'
  } catch { /* silencieux */ }
  if (envelope.candidate_id) {
    try {
      const { data: cand } = await supabase
        .from('candidats')
        .select('metier_recherche')
        .eq('id', envelope.candidate_id)
        .maybeSingle()
      const c = cand as unknown as { metier_recherche?: string | null } | null
      if (c?.metier_recherche) stampTitle = c.metier_recherche
    } catch { /* silencieux */ }
  }

  // 3. Pour chaque doc : stamp avec les valeurs MERGED de tous les signers
  // Note simplifiée : chaque field appartient à un recipient particulier (recipientOrder).
  // On stamp la signature/valeurs de chaque field selon son recipientOrder.
  const stampedDocs: { name: string; storagePath: string; pdfBase64: string }[] = []
  for (const doc of documents) {
    if (!doc.storage_path) continue
    try {
      const { data: blob, error: dlErr } = await supabase.storage
        .from('talentflow-sign')
        .download(doc.storage_path)
      if (dlErr || !blob) {
        console.warn('[sign/finalize] download failed', doc.name, dlErr?.message)
        continue
      }
      const sourceBuf = new Uint8Array(await blob.arrayBuffer())

      // Pour chaque signer, on stamp ses fields. On itère et chaque pass enrichit le PDF.
      let currentBuf: Uint8Array = sourceBuf
      for (let recIdx = 0; recIdx < updatedRecipients.length; recIdx++) {
        const rec = updatedRecipients[recIdx]
        const recipientOrder = recIdx + 1
        const tok = allTokens.find(t =>
          t.recipient_email.toLowerCase().trim() === rec.email.toLowerCase().trim()
        )
        if (!tok) continue
        const recFields = (doc.fields || []).filter(f => f.recipientOrder === recipientOrder)
        if (recFields.length === 0) continue

        const nameParts = (rec.name || '').trim().split(/\s+/)
        const firstName = nameParts[0] || ''
        const lastName = nameParts.slice(1).join(' ') || ''
        const today = signedAt.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })

        currentBuf = await stampPdf({
          pdfBuffer: currentBuf,
          fields: recFields,
          fieldValues: tok.field_values || {},
          signatureDataUrl: tok.signature_data_url,
          autoFill: {
            firstName, lastName, fullName: rec.name, email: rec.email, today,
            companyName: stampCompanyName, title: stampTitle,
          },
          envelopeId: envelope.id,
          recipientName: rec.name,
          recipientEmail: rec.email,
          signedAt,
          signedIp,
          // N'ajoute le footer audit qu'au DERNIER passage (sinon footer multiple)
          addAuditFooter: recIdx === updatedRecipients.length - 1,
        })
      }

      // Upload final
      const blobOut = new Blob([currentBuf as BlobPart], { type: 'application/pdf' })
      const signedPath = await uploadSignDocument('signed', envelope.id, blobOut, doc.name)
      const pdfBase64 = Buffer.from(currentBuf).toString('base64')
      stampedDocs.push({
        name: doc.name,
        storagePath: signedPath,
        pdfBase64,
      })
    } catch (e) {
      console.error('[sign/finalize] stamp failed for', doc.name, e)
    }
  }

  if (stampedDocs.length === 0) {
    console.warn('[sign/finalize] aucun PDF stampé')
    return
  }

  // 4. Récupère le sender (créateur de l'enveloppe) pour l'email
  let senderName = 'L-Agence SA'
  let senderEmail: string | undefined
  if (envelope.created_by) {
    try {
      const { data: { user } } = await supabase.auth.admin.getUserById(envelope.created_by)
      if (user) {
        const meta = (user.user_metadata as { full_name?: string; entreprise?: string } | null) || null
        senderName = meta?.entreprise?.trim() || meta?.full_name || 'L-Agence SA'
        senderEmail = user.email || undefined
      }
    } catch { /* silent */ }
  }

  // 5. Envoi email à tous (signers + cc) + admin L-Agence
  const recipients: { email: string; name: string }[] = updatedRecipients.map(r => ({
    email: r.email,
    name: r.name,
  }))
  // Ajoute ADMIN_EMAIL si défini et non déjà dans la liste
  const adminEmail = process.env.ADMIN_EMAIL
  if (adminEmail && !recipients.some(r => r.email.toLowerCase() === adminEmail.toLowerCase())) {
    recipients.push({ email: adminEmail, name: 'L-Agence SA (admin)' })
  }

  const attachments = stampedDocs.map(d => ({
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
}

// ─── Workflow séquentiel : déclenche le token + email du prochain signer ──────
async function sendNextSigner(args: {
  supabase: ReturnType<typeof createAdminClient>
  envelope: SignEnvelope
  updatedRecipients: SignRecipient[]
  currentSignerEmail: string
  ip: string | null
}) {
  const { supabase, envelope, updatedRecipients, currentSignerEmail } = args

  // v2.2.1 — Routing parallèle : plusieurs signers peuvent partager le même order.
  // L'étape passe au suivant uniquement quand TOUS les signers de l'order courant
  // ont signé. Sinon on attend (rien à faire ici, le signer qui vient de signer
  // n'est qu'un parmi plusieurs).
  const allSigners = updatedRecipients.filter(r => r.role !== 'cc')
  const currentSigner = allSigners.find(r =>
    r.email.toLowerCase().trim() === currentSignerEmail,
  )
  if (!currentSigner) return
  const currentOrder = currentSigner.order ?? 0

  // Vérifie : tous les signers du MÊME order ont-ils signé ?
  const sameOrderSigners = allSigners.filter(r => (r.order ?? 0) === currentOrder)
  const allSameOrderSigned = sameOrderSigners.every(r => r.status === 'signed')
  if (!allSameOrderSigned) {
    // Étape pas finie, on attend les autres signers du même order
    console.log(`[sign/finalize] order ${currentOrder} pas encore complète (parallèle), attente`)
    return
  }

  // Étape courante terminée → cherche le prochain order non signé
  const nextOrder = Math.min(
    ...allSigners
      .filter(r => r.status !== 'signed' && (r.order ?? 0) > currentOrder)
      .map(r => r.order ?? 0)
      .concat([Infinity]),
  )
  if (nextOrder === Infinity) return  // pas de suivant
  const nextSigners = allSigners.filter(r =>
    (r.order ?? 0) === nextOrder && r.status !== 'signed',
  )
  if (nextSigners.length === 0) return

  // Pour chaque signer du prochain order, génère token + envoie email (best-effort)
  const ttlDays = (envelope as unknown as { expires_in_days?: number | null }).expires_in_days || undefined

  // Récup info expéditeur (1 fois)
  let senderName = 'L-Agence SA'
  let senderEmail: string | undefined
  if (envelope.created_by) {
    try {
      const { data: { user } } = await supabase.auth.admin.getUserById(envelope.created_by)
      if (user) {
        const meta = (user.user_metadata as { entreprise?: string } | null) || null
        senderName = meta?.entreprise?.trim() || senderName
        senderEmail = user.email || undefined
      }
    } catch { /* */ }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'

  for (const next of nextSigners) {
    // Skip si token actif déjà existant
    const { data: existingTokens } = await supabase
      .from('sign_tokens' as any)
      .select('id, used_at, signed_at')
      .eq('envelope_id', envelope.id)
      .eq('recipient_email', next.email.toLowerCase().trim())
    const tokens = (existingTokens || []) as unknown as Array<{ id: string; used_at: string | null; signed_at: string | null }>
    if (tokens.some(t => !t.signed_at && !t.used_at)) continue

    const newTokens = await generateTokensForEnvelope(envelope.id, [next], ttlDays || undefined)
    if (newTokens.length === 0) continue
    const tok = newTokens[0]

    try {
      await sendSignInviteEmail(next.email, {
        recipientName: next.name,
        recipientRole: next.role === 'cc' ? 'Copie' : 'Signataire',
        senderName,
        senderEmail,
        envelopeTitle: envelope.title,
        message: envelope.message,
        signUrl: `${appUrl}/sign/v/${tok.token}`,
        expiresAt: tok.expires_at,
      })
      await logAuditEvent(envelope.id, 'sent', {
        recipientEmail: next.email,
        metadata: { triggered_by: 'sequential_workflow', from_order: currentOrder, to_order: nextOrder },
      })
    } catch (e) {
      console.warn('[sign/finalize] sendNextSigner email failed', next.email, e)
    }
  }
}
