// TalentFlow Rapports — Notifications email + WhatsApp (Phase 5)
// v2.2.6
//
// 4 fonctions exposées :
//   1. sendClientInviteEmail        : email au client pour signer (mode distant)
//   2. sendClientInviteWhatsApp     : idem WhatsApp
//   3. sendCompletedEmailToAdmin    : email à ADMIN_EMAIL avec PDF en PJ
//   4. sendCompletedWhatsAppToClient: WhatsApp client avec lien public
//
// Réutilise le pattern Resend de lib/sign/send-email.ts et lib/whatsapp.ts.
// Best-effort : retourne `{ ok, error }`, ne throw pas.

import { envoyerMessage } from '@/lib/whatsapp'
import { normalizePhoneE164 } from '@/lib/sign/phone-format'

const FROM_DEFAULT = 'TalentFlow Sign <noreply@talent-flow.ch>'

export interface NotifResult {
  ok: boolean
  id?: string
  error?: string
}

// ─── Helpers salutation ──────────────────────────────────────────────────
//
// v2.3.x — Choisit le nom à utiliser dans "Bonjour X" :
//   1. clientContactName (saisi manuellement, prioritaire si présent)
//   2. premier mot du clientName (entreprise) en fallback
//   3. clientName entier en dernier recours
function pickGreetingName(args: { clientContactName?: string | null; clientName?: string | null }): string {
  const contact = args.clientContactName?.trim()
  if (contact) return contact.split(/\s+/)[0] || contact
  const company = args.clientName?.trim() || ''
  return company.split(/\s+/)[0] || company || ''
}

// ─── 1. Email client — invitation à signer ──────────────────────────────

export async function sendClientInviteEmail(args: {
  to: string
  clientName: string
  /** v2.3.x — Nom du contact (prioritaire pour la salutation) */
  clientContactName?: string | null
  candidateName: string
  weekLabel: string
  signUrl: string
  expiresAt: Date | string
}): Promise<NotifResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY manquant' }
  if (!args.to) return { ok: false, error: 'destinataire vide' }

  const subject = `Rapport d'heures à valider — ${args.candidateName} · ${args.weekLabel}`
  const html = buildClientInviteHtml(args)
  const text = buildClientInviteText(args)

  return await sendResend({ to: args.to, subject, html, text })
}

function buildClientInviteHtml(p: {
  clientName: string
  clientContactName?: string | null
  candidateName: string
  weekLabel: string
  signUrl: string
  expiresAt: Date | string
}): string {
  const expiresStr = formatDate(p.expiresAt)
  const greetingName = pickGreetingName(p)
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:20px;">
      <span style="font-family:Georgia,serif;font-size:22px;font-weight:400;letter-spacing:-0.4px;color:#1C1A14;">L-AGENCE</span>
      <div style="font-size:9px;color:#6B7280;letter-spacing:1px;text-transform:uppercase;margin-top:2px;">Rapport hebdomadaire</div>
    </div>
    <div style="background:#fff;border:1px solid #E5E7EB;border-radius:14px;padding:28px 26px;box-shadow:0 4px 16px rgba(0,0,0,0.04);">
      <div style="display:inline-block;background:#FEF3C7;color:#A16207;padding:5px 11px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:14px;">
        Rapport à valider
      </div>
      <h1 style="font-family:Georgia,serif;font-size:24px;font-weight:400;color:#1C1A14;margin:0 0 14px;line-height:1.25;">
        Bonjour ${escapeHtml(greetingName) || 'à vous'},
      </h1>
      <p style="font-size:14.5px;color:#374151;line-height:1.6;margin:0 0 16px;">
        <strong>${escapeHtml(p.candidateName)}</strong> a soumis son rapport d'heures pour la <strong>${escapeHtml(p.weekLabel)}</strong>.
      </p>
      <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 22px;">
        Merci de le valider en cliquant ci-dessous :
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${p.signUrl}"
           style="display:inline-block;background:#EAB308;color:#1C1A14;padding:14px 28px;border-radius:10px;font-size:14px;font-weight:700;text-decoration:none;border:1px solid #1C1A14;">
          Valider le rapport →
        </a>
      </div>
      <p style="font-size:12px;color:#6B7280;line-height:1.5;margin:18px 0 0;">
        Lien valable jusqu'au ${escapeHtml(expiresStr)}.
      </p>
    </div>
    <p style="text-align:center;font-size:11px;color:#9CA3AF;margin-top:18px;">
      L-Agence SA · Sécurisé par TalentFlow Sign
    </p>
  </div>
</body></html>`
}

function buildClientInviteText(p: {
  clientName: string; clientContactName?: string | null; candidateName: string; weekLabel: string; signUrl: string; expiresAt: Date | string
}): string {
  const greetingName = pickGreetingName(p)
  return [
    `Bonjour ${greetingName || 'à vous'},`,
    '',
    `${p.candidateName} a soumis son rapport d'heures pour la ${p.weekLabel}.`,
    '',
    'Merci de le valider :',
    p.signUrl,
    '',
    `Lien valable jusqu'au ${formatDate(p.expiresAt)}.`,
    '',
    'L-Agence SA · TalentFlow Sign',
  ].join('\n')
}

// ─── 2. WhatsApp client — invitation à signer ──────────────────────────

export async function sendClientInviteWhatsApp(args: {
  phone: string
  clientName: string
  /** v2.3.x — Nom du contact (prioritaire pour la salutation) */
  clientContactName?: string | null
  candidateName: string
  weekLabel: string
  signUrl: string
  expiresAt: Date | string
}): Promise<NotifResult> {
  const greetingName = pickGreetingName(args)
  return sendWa(args.phone, [
    greetingName ? `Bonjour ${greetingName} 👋` : 'Bonjour 👋',
    '',
    `*${args.candidateName}* a soumis son rapport d'heures pour la *${args.weekLabel}*.`,
    '',
    'Merci de le valider en cliquant ici :',
    args.signUrl,
    '',
    `_Lien valable jusqu'au ${formatDate(args.expiresAt)}_`,
  ].join('\n'))
}

// ─── 3. Email admin (ADMIN_EMAIL) — completed avec PDF en PJ ──────────

export async function sendCompletedEmailToAdmin(args: {
  candidateName: string
  clientName: string
  weekLabel: string
  /** Liste des PDFs en PJ : { filename, content base64 } */
  attachments: { filename: string; content: string }[]
  reportLinkUrl: string
}): Promise<NotifResult> {
  const apiKey = process.env.RESEND_API_KEY
  const adminEmail = process.env.ADMIN_EMAIL
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY manquant' }
  if (!adminEmail) return { ok: false, error: 'ADMIN_EMAIL manquant' }

  const subject = `✅ Rapport signé — ${args.candidateName} · ${args.weekLabel}`
  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:20px;">
      <span style="font-family:Georgia,serif;font-size:22px;font-weight:400;letter-spacing:-0.4px;color:#1C1A14;">L-AGENCE</span>
      <div style="font-size:9px;color:#6B7280;letter-spacing:1px;text-transform:uppercase;margin-top:2px;">TalentFlow Rapports</div>
    </div>
    <div style="background:#fff;border:1px solid #E5E7EB;border-radius:14px;padding:28px 26px;">
      <div style="display:inline-block;background:#D1FAE5;color:#059669;padding:5px 11px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:14px;">
        ✓ Rapport complété
      </div>
      <h1 style="font-family:Georgia,serif;font-size:22px;font-weight:400;color:#1C1A14;margin:0 0 12px;">
        Rapport signé par les deux parties
      </h1>
      <div style="background:#FAFAF7;border:1px solid #E5E7EB;border-radius:10px;padding:14px 16px;margin:16px 0;font-size:13px;color:#1C1A14;line-height:1.7;">
        <strong>Collaborateur :</strong> ${escapeHtml(args.candidateName)}<br>
        <strong>Client :</strong> ${escapeHtml(args.clientName)}<br>
        <strong>Semaine :</strong> ${escapeHtml(args.weekLabel)}
      </div>
      <p style="font-size:13px;color:#374151;line-height:1.6;margin:0 0 18px;">
        Le PDF signé est joint à cet email.
      </p>
      <div style="text-align:center;margin-top:18px;">
        <a href="${args.reportLinkUrl}"
           style="display:inline-block;background:#EAB308;color:#1C1A14;padding:12px 22px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;border:1px solid #1C1A14;">
          Voir l'historique →
        </a>
      </div>
    </div>
    <p style="text-align:center;font-size:11px;color:#9CA3AF;margin-top:18px;">
      Notification automatique TalentFlow Rapports
    </p>
  </div>
</body></html>`

  return await sendResend({
    to: adminEmail,
    subject,
    html,
    text: `Rapport signé — ${args.candidateName} · ${args.weekLabel}\n\n${args.reportLinkUrl}`,
    attachments: args.attachments,
  })
}

// ─── 4. WhatsApp client — completed avec lien download ────────────────

export async function sendCompletedWhatsAppToClient(args: {
  phone: string
  clientName: string
  clientContactName?: string | null
  candidateName: string
  weekLabel: string
  /** URL publique vers le PDF (route /api/reports/client/[token]/download ou similaire) */
  downloadUrl: string
}): Promise<NotifResult> {
  const greetingName = pickGreetingName(args)
  return sendWa(args.phone, [
    greetingName ? `Bonjour ${greetingName} 👋` : 'Bonjour 👋',
    '',
    `✅ Le rapport d'heures de *${args.candidateName}* (${args.weekLabel}) est maintenant signé par les deux parties.`,
    '',
    'Téléchargez le PDF signé ici :',
    args.downloadUrl,
    '',
    '_L-Agence SA · TalentFlow Sign_',
  ].join('\n'))
}

// ─── 5. Email client — completed avec PDF en PJ (Q7 v2.3.x) ──────────

export async function sendCompletedEmailToClient(args: {
  to: string
  clientName: string
  clientContactName?: string | null
  candidateName: string
  weekLabel: string
  /** PDF en PJ (filename + content base64) */
  attachments: { filename: string; content: string }[]
}): Promise<NotifResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY manquant' }
  if (!args.to) return { ok: false, error: 'destinataire vide' }

  const greetingName = pickGreetingName(args)
  const subject = `Rapport signé — ${args.candidateName} · ${args.weekLabel}`
  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:20px;">
      <span style="font-family:Georgia,serif;font-size:22px;font-weight:400;letter-spacing:-0.4px;color:#1C1A14;">L-AGENCE</span>
      <div style="font-size:9px;color:#6B7280;letter-spacing:1px;text-transform:uppercase;margin-top:2px;">Rapport hebdomadaire</div>
    </div>
    <div style="background:#fff;border:1px solid #E5E7EB;border-radius:14px;padding:28px 26px;">
      <div style="display:inline-block;background:#D1FAE5;color:#059669;padding:5px 11px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:14px;">
        ✓ Rapport complété
      </div>
      <h1 style="font-family:Georgia,serif;font-size:22px;font-weight:400;color:#1C1A14;margin:0 0 12px;">
        Bonjour ${escapeHtml(greetingName) || 'à vous'},
      </h1>
      <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 16px;">
        Le rapport d'heures de <strong>${escapeHtml(args.candidateName)}</strong> pour la <strong>${escapeHtml(args.weekLabel)}</strong> est maintenant signé par les deux parties.
      </p>
      <p style="font-size:13px;color:#374151;line-height:1.6;margin:0;">
        Une copie complète signée est jointe à cet email.
      </p>
    </div>
    <p style="text-align:center;font-size:11px;color:#9CA3AF;margin-top:18px;">
      L-Agence SA · Sécurisé par TalentFlow Sign
    </p>
  </div>
</body></html>`

  const text = [
    `Bonjour ${greetingName || 'à vous'},`,
    '',
    `Le rapport d'heures de ${args.candidateName} pour la ${args.weekLabel} est maintenant signé par les deux parties.`,
    'Une copie est jointe à cet email.',
    '',
    'L-Agence SA · TalentFlow Sign',
  ].join('\n')

  return await sendResend({
    to: args.to,
    subject,
    html,
    text,
    attachments: args.attachments,
  })
}

// ─── Internals ──────────────────────────────────────────────────────────

async function sendResend(args: {
  to: string
  subject: string
  html: string
  text: string
  attachments?: { filename: string; content: string }[]
}): Promise<NotifResult> {
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_DEFAULT,
        to: [args.to],
        subject: args.subject,
        html: args.html,
        text: args.text,
        attachments: args.attachments,
      }),
    })
    if (!r.ok) {
      const err = await r.text()
      return { ok: false, error: `Resend ${r.status}: ${err.slice(0, 200)}` }
    }
    const data = await r.json() as { id?: string }
    return { ok: true, id: data.id }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur réseau'
    return { ok: false, error: msg }
  }
}

async function sendWa(rawPhone: string, body: string): Promise<NotifResult> {
  const phone = normalizePhoneE164(rawPhone)
  if (!phone) return { ok: false, error: `Numéro invalide: ${rawPhone}` }
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID) {
    return { ok: false, error: 'WHATSAPP_TOKEN ou WHATSAPP_PHONE_ID manquant' }
  }
  try {
    const r = await envoyerMessage(phone, body)
    return { ok: true, id: r?.messages?.[0]?.id }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur WhatsApp'
    return { ok: false, error: msg }
  }
}

function getFirstName(s: string): string {
  return (s || '').trim().split(/\s+/)[0] || s || ''
}

function formatDate(d: Date | string): string {
  try {
    const date = typeof d === 'string' ? new Date(d) : d
    return date.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return String(d)
  }
}

function escapeHtml(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
