// TalentFlow Sign — Envois WhatsApp via Meta Cloud API
// v2.2.5 — Phase 4d
//
// Wrappers métier au-dessus de lib/whatsapp.ts (envoyerMessage).
// Pas de SDK npm, pas de templates Meta : on envoie des `text` simples avec
// preview_url désactivé. Le client doit avoir initié une conversation dans
// les 24h pour que le message session-based passe (sinon Meta exige un template
// approuvé — non couvert ici, l'utilisateur reçoit l'erreur via Resend en parallèle).
//
// 4 fonctions :
//   - sendSignInviteWhatsApp        : "Vous avez un document à signer"
//   - sendSignReminderWhatsApp      : rappel signature attendue
//   - sendSignCompletedWhatsApp     : tout est signé, voici le lien
//   - sendSignNotifyNextWhatsApp    : rappel transition séquentielle (UX)
//
// Politique d'erreur : pas de throw — retourne `{ ok: false, error }` pour ne
// pas bloquer le flow. L'admin voit l'échec dans les audit logs.

import { envoyerMessage } from '@/lib/whatsapp'
import { normalizePhoneE164 } from './phone-format'

export interface SendWhatsAppResult {
  ok: boolean
  messageId?: string
  error?: string
}

interface BaseInviteParams {
  /** Numéro destinataire (E.164 ou raw, sera normalisé) */
  phone: string
  recipientName: string
  envelopeTitle: string
  senderName: string
  signUrl: string
  expiresAt: Date | string
}

/**
 * Invitation initiale à signer.
 *
 *   Bonjour Pedro 👋
 *
 *   *L-Agence SA* vous invite à signer électroniquement votre document :
 *   📄 Rapport d'heures Semaine 12
 *
 *   Cliquez ici pour signer :
 *   https://talent-flow.ch/sign/v/abc123
 *
 *   _Lien valable jusqu'au 31.12.2026_
 */
export async function sendSignInviteWhatsApp(params: BaseInviteParams): Promise<SendWhatsAppResult> {
  return sendText(params.phone, [
    `Bonjour ${getFirstName(params.recipientName)} 👋`,
    '',
    `*${params.senderName}* vous invite à signer électroniquement votre document :`,
    `📄 *${params.envelopeTitle}*`,
    '',
    'Cliquez ici pour signer :',
    params.signUrl,
    '',
    `_Lien valable jusqu'au ${formatDate(params.expiresAt)}_`,
  ].join('\n'))
}

/**
 * Rappel : signature attendue (envoyé manuellement ou via cron remind).
 */
export async function sendSignReminderWhatsApp(params: BaseInviteParams): Promise<SendWhatsAppResult> {
  return sendText(params.phone, [
    `⏰ Rappel — ${getFirstName(params.recipientName)},`,
    '',
    `Votre signature est attendue pour *${params.envelopeTitle}*.`,
    '',
    'Cliquez ici pour signer :',
    params.signUrl,
    '',
    `_Lien valable jusqu'au ${formatDate(params.expiresAt)}_`,
  ].join('\n'))
}

/**
 * Notification au PROCHAIN signataire (workflow séquentiel).
 *   "C'est à votre tour de signer..."
 * Très proche de l'invite mais avec un wording de transition.
 */
export async function sendSignNotifyNextWhatsApp(params: BaseInviteParams): Promise<SendWhatsAppResult> {
  return sendText(params.phone, [
    `Bonjour ${getFirstName(params.recipientName)} 👋`,
    '',
    `C'est à votre tour de signer le document de *${params.senderName}* :`,
    `📄 *${params.envelopeTitle}*`,
    '',
    'Cliquez ici pour finaliser :',
    params.signUrl,
    '',
    `_Lien valable jusqu'au ${formatDate(params.expiresAt)}_`,
  ].join('\n'))
}

interface CompletedParams {
  phone: string
  recipientName: string
  envelopeTitle: string
  /** URL publique de téléchargement (lien token, perpétuel après signature) */
  downloadUrl: string
  senderName?: string
}

/**
 * Confirmation finale : tous les signataires ont signé, voici le lien de téléchargement.
 */
export async function sendSignCompletedWhatsApp(params: CompletedParams): Promise<SendWhatsAppResult> {
  return sendText(params.phone, [
    `✅ Signé par toutes les parties !`,
    '',
    `📄 *${params.envelopeTitle}*`,
    '',
    'Téléchargez vos documents signés :',
    params.downloadUrl,
    '',
    params.senderName ? `_${params.senderName} · TalentFlow Sign_` : '_TalentFlow Sign_',
  ].join('\n'))
}

// ─── Internals ──────────────────────────────────────────────────────────

async function sendText(rawPhone: string, body: string): Promise<SendWhatsAppResult> {
  const phone = normalizePhoneE164(rawPhone)
  if (!phone) {
    return { ok: false, error: `Numéro invalide: ${rawPhone}` }
  }
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID) {
    return { ok: false, error: 'WHATSAPP_TOKEN ou WHATSAPP_PHONE_ID manquant' }
  }
  try {
    // envoyerMessage normalise déjà (vire +/spaces/dashes), on lui passe l'E.164.
    const r = await envoyerMessage(phone, body)
    const messageId = r?.messages?.[0]?.id
    return { ok: true, messageId }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur WhatsApp'
    console.error('[sign/send-whatsapp]', msg)
    return { ok: false, error: msg }
  }
}

function getFirstName(fullName: string): string {
  return (fullName || '').trim().split(/\s+/)[0] || fullName || ''
}

function formatDate(d: Date | string): string {
  try {
    const date = typeof d === 'string' ? new Date(d) : d
    return date.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return String(d)
  }
}
