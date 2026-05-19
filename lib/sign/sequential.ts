// TalentFlow Sign — Workflow séquentiel & multi-canaux (Phase 4c + 4d)
// v2.2.5
//
// Centralise :
//   1. dispatchInvite()       : envoie l'invitation initiale d'un signer selon
//                                delivery_channel (email / whatsapp / both)
//   2. triggerNextSigner()    : workflow séquentiel — détecte le prochain signer
//                                à servir et lui envoie son invitation
//
// Refacto de l'ancien `sendNextSigner` inline dans finalize/route.ts. Évite la
// duplication entre finalize, send (envoi initial) et relaunch.

import { createAdminClient } from '@/lib/supabase/admin'
import { generateTokensForEnvelope, type GeneratedToken } from './tokens'
import { logAuditEvent } from './audit'
import { sendSignInviteEmail } from './send-email'
import { sendSignInviteWhatsApp, sendSignNotifyNextWhatsApp } from './send-whatsapp'
import type {
  SignEnvelope, SignRecipient, SignDeliveryChannel,
} from './types'

interface SenderInfo {
  name: string
  email?: string
}

export interface DispatchResult {
  email: { ok: boolean; id?: string; error?: string } | null
  whatsapp: { ok: boolean; messageId?: string; error?: string } | null
}

interface DispatchInviteArgs {
  envelope: Pick<SignEnvelope, 'id' | 'title' | 'message' | 'delivery_channel'>
  recipient: SignRecipient
  token: GeneratedToken
  sender: SenderInfo
  documentsCount?: number
  /** Si true, utilise le wording "C'est à votre tour" (transition séquentielle).
   *  Si false (défaut), wording invitation initiale. */
  isNextSignerTransition?: boolean
  /** v2.9.15 — Si true + candidateName fourni, le headline email devient
   *  "X a rempli et signé, veuillez vérifier et confirmer" au lieu de
   *  "vous invite à signer". Calculé dans send/route.ts selon l'ordre du
   *  destinataire et le roleName des destinataires en amont. */
  reviewAfterCandidate?: { candidateName: string }
}

/**
 * Envoie l'invitation à signer pour UN destinataire selon le canal configuré
 * sur l'enveloppe. Retourne la liste des résultats par canal.
 *
 * Politique d'erreur : best-effort. Si email OK mais WhatsApp KO, on log
 * dans audit avec l'erreur WhatsApp mais on ne throw pas — l'utilisateur
 * a quand même l'email.
 */
export async function dispatchInvite(args: DispatchInviteArgs): Promise<DispatchResult> {
  const { envelope, recipient, token, sender, documentsCount, isNextSignerTransition, reviewAfterCandidate } = args
  const channel: SignDeliveryChannel = envelope.delivery_channel || 'email'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'
  const signUrl = `${appUrl}/sign/v/${token.token}`
  const result: DispatchResult = { email: null, whatsapp: null }

  // ─── EMAIL ───
  if (channel === 'email' || channel === 'both') {
    const r = await sendSignInviteEmail(token.recipient_email, {
      recipientName: token.recipient_name,
      recipientRole: recipient.role === 'cc' ? 'Copie' : 'Signataire',
      senderName: sender.name,
      senderEmail: sender.email,
      envelopeTitle: envelope.title,
      message: envelope.message,
      signUrl,
      documentsCount,
      expiresAt: token.expires_at,
      // v2.9.15 — Wording contextuel si signataire en aval du candidat
      isReviewAfterCandidate: !!reviewAfterCandidate,
      candidateName: reviewAfterCandidate?.candidateName,
    })
    result.email = { ok: r.ok, id: r.id, error: r.error }
  }

  // ─── WHATSAPP ───
  if ((channel === 'whatsapp' || channel === 'both') && (token.recipient_phone || recipient.phone)) {
    const phone = token.recipient_phone || recipient.phone || ''
    const expiresAtDate = new Date(token.expires_at)
    const r = isNextSignerTransition
      ? await sendSignNotifyNextWhatsApp({
          phone,
          recipientName: token.recipient_name,
          envelopeTitle: envelope.title,
          senderName: sender.name,
          signUrl,
          expiresAt: expiresAtDate,
        })
      : await sendSignInviteWhatsApp({
          phone,
          recipientName: token.recipient_name,
          envelopeTitle: envelope.title,
          senderName: sender.name,
          signUrl,
          expiresAt: expiresAtDate,
        })
    result.whatsapp = { ok: r.ok, messageId: r.messageId, error: r.error }
  } else if (channel === 'whatsapp' || channel === 'both') {
    // Canal whatsapp configuré MAIS pas de phone → erreur explicite
    result.whatsapp = { ok: false, error: 'Pas de phone E.164 sur le destinataire' }
  }

  return result
}

// ─── Workflow séquentiel ───────────────────────────────────────────────

interface TriggerNextArgs {
  envelope: SignEnvelope
  /** Recipients à jour (post-update finalize : statuts 'signed' propagés) */
  updatedRecipients: SignRecipient[]
  /** Email du signer qui vient de signer (lowercase) */
  currentSignerEmail: string
  sender: SenderInfo
  /** TTL du token suivant (lu sur l'enveloppe) */
  ttlDays?: number
}

/**
 * Workflow séquentiel post-signature :
 *   1. Vérifie que TOUS les signers du même `order` que le signer courant ont signé
 *      (sinon attend — étape parallèle pas finie).
 *   2. Trouve le prochain `order` non encore signé.
 *   3. Pour chaque signer de cet order : génère un token + dispatchInvite() avec
 *      isNextSignerTransition=true.
 *   4. Log audit 'sent' avec metadata { triggered_by: 'sequential_workflow' }.
 *
 * Retourne le nombre de signers déclenchés (0 si étape pas terminée ou pas de suivant).
 */
export async function triggerNextSigner(args: TriggerNextArgs): Promise<number> {
  const { envelope, updatedRecipients, currentSignerEmail, sender, ttlDays } = args
  const supabase = createAdminClient()

  const allSigners = updatedRecipients.filter(r => r.role !== 'cc')
  const lcCurrent = currentSignerEmail.toLowerCase().trim()
  const currentSigner = allSigners.find(r => r.email.toLowerCase().trim() === lcCurrent)
  if (!currentSigner) return 0

  const currentOrder = currentSigner.order ?? 0

  // 1. Tous les signers de l'order courant ont-ils signé ?
  const sameOrderSigners = allSigners.filter(r => (r.order ?? 0) === currentOrder)
  const allSameOrderSigned = sameOrderSigners.every(r => r.status === 'signed')
  if (!allSameOrderSigned) {
    console.log(`[sequential] order ${currentOrder} pas encore complète (parallèle), attente`)
    return 0
  }

  // 2. Prochain order
  const upcoming = allSigners
    .filter(r => r.status !== 'signed' && (r.order ?? 0) > currentOrder)
    .map(r => r.order ?? 0)
  if (upcoming.length === 0) return 0
  const nextOrder = Math.min(...upcoming)
  const nextSigners = allSigners.filter(r =>
    (r.order ?? 0) === nextOrder && r.status !== 'signed',
  )
  if (nextSigners.length === 0) return 0

  let triggered = 0
  for (const next of nextSigners) {
    // Skip si token actif déjà existant (cas relance manuelle entre-temps)
    const { data: existingTokens } = await supabase
      .from('sign_tokens' as any)
      .select('id, used_at, signed_at')
      .eq('envelope_id', envelope.id)
      .eq('recipient_email', next.email.toLowerCase().trim())
    const tokens = (existingTokens || []) as unknown as Array<{
      id: string; used_at: string | null; signed_at: string | null
    }>
    if (tokens.some(t => !t.signed_at && !t.used_at)) continue

    const newTokens = await generateTokensForEnvelope(envelope.id, [next], ttlDays)
    if (newTokens.length === 0) continue
    const tok = newTokens[0]

    try {
      const dispatch = await dispatchInvite({
        envelope,
        recipient: next,
        token: tok,
        sender,
        isNextSignerTransition: true,
      })

      await logAuditEvent(envelope.id, 'sent', {
        recipientEmail: next.email,
        metadata: {
          triggered_by: 'sequential_workflow',
          from_order: currentOrder,
          to_order: nextOrder,
          channel: envelope.delivery_channel || 'email',
          email: dispatch.email,
          whatsapp: dispatch.whatsapp,
        },
      })
      triggered++
    } catch (e) {
      console.warn('[sequential] dispatchInvite failed for', next.email, e)
    }
  }

  return triggered
}
