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
import { toWhatsAppSafe, formatDateChDot } from './text-format'

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

// ─── 1. Email client — invitation à signer ─────────────────────────────

export async function sendClientInviteEmail(args: {
  to: string
  clientName: string
  /** v2.3.x — Nom du contact (prioritaire pour la salutation) */
  clientContactName?: string | null
  candidateName: string
  weekLabel: string
  signUrl: string
  expiresAt: Date | string
  /** v2.7.3 — Mode portail : si true, greeting = "Bonjour" sans nom (l'email va à
   *  l'adresse principale entreprise, pas à un contact nommé). */
  portalMode?: boolean
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
  portalMode?: boolean
}): string {
  const expiresStr = formatDateChDot(p.expiresAt)
  // v2.7.3 — En mode portail, salutation neutre "Bonjour" (pas de nom de contact)
  const greetingName = p.portalMode ? '' : pickGreetingName(p)
  const greetingLine = greetingName ? `Bonjour ${escapeHtml(greetingName)},` : 'Bonjour,'
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:24px;">
      <img src="https://www.talent-flow.ch/logo-agence-officiel-noir.png" alt="L-Agence" width="200" style="height:42px;width:auto;display:inline-block;border:0;" />
      <div style="font-size:9px;color:#6B7280;letter-spacing:1px;text-transform:uppercase;margin-top:2px;">Rapport hebdomadaire</div>
    </div>
    <div style="background:#fff;border:1px solid #E5E7EB;border-radius:14px;padding:28px 26px;box-shadow:0 4px 16px rgba(0,0,0,0.04);">
      <div style="display:inline-block;background:#FEF3C7;color:#A16207;padding:5px 11px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:14px;">
        Rapport à valider
      </div>
      <h1 style="font-family:Georgia,serif;font-size:24px;font-weight:400;color:#1C1A14;margin:0 0 14px;line-height:1.25;">
        ${greetingLine}
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
  portalMode?: boolean
}): string {
  const greetingName = p.portalMode ? '' : pickGreetingName(p)
  const greetingLine = greetingName ? `Bonjour ${greetingName},` : 'Bonjour,'
  return [
    greetingLine,
    '',
    `${p.candidateName} a soumis son rapport d'heures pour la ${p.weekLabel}.`,
    '',
    'Merci de le valider :',
    p.signUrl,
    '',
    `Lien valable jusqu'au ${formatDateChDot(p.expiresAt)}.`,
    '',
    'L-Agence SA · TalentFlow Sign',
  ].join('\n')
}

// ─── 2. WhatsApp client — invitation à signer ──────────────────────────

export async function sendClientInviteWhatsApp(args: {
  phone: string
  clientContactName?: string | null
  clientName?: string | null
  candidateName: string
  weekLabel: string
  signUrl: string
  expiresAt: Date | string
}): Promise<NotifResult> {
  const greetingName = toWhatsAppSafe(pickGreetingName(args))
  const candidateName = toWhatsAppSafe(args.candidateName || '')
  const weekLabel = toWhatsAppSafe(args.weekLabel || '')
  const expiresStr = formatDateChDot(args.expiresAt)
  const body = toWhatsAppSafe([
    greetingName ? `Bonjour ${greetingName},` : 'Bonjour,',
    '',
    `${candidateName} a soumis son rapport d'heures pour la ${weekLabel}.`,
    '',
    'Merci de le valider en cliquant ici :',
    args.signUrl,
    '',
    `Lien valable jusqu'au ${expiresStr}.`,
    '- L-Agence SA',
  ].join('\n'))
  return sendWa(args.phone, body)
}

// ─── 3. Email admin (créateur du lien) — completed avec PDF en PJ ─────
// v2.3.5 Bug 2+4+5 :
//   - `to` = email du créateur du lien (plus ADMIN_EMAIL fixe)
//   - `downloadUrl` = lien direct PDF signé (plus "/historique" → 404 mobile)

export async function sendCompletedEmailToAdmin(args: {
  /** Destinataire : créateur du lien. Fallback : ADMIN_EMAIL. */
  to: string
  candidateName: string
  clientName: string
  weekLabel: string
  /** Liste des PDFs en PJ : { filename, content base64 } */
  attachments: { filename: string; content: string }[]
  /** URL directe vers le PDF signé (route /api/reports/{slug}/submissions/{id}/download) */
  downloadUrl: string
  /** v2.4.0 — Note libre du candidat (max 300 chars). Affichée en bandeau si présente. */
  notesCandidat?: string | null
  /** v2.4.0 — Note libre du client (max 300 chars). Affichée en bandeau si présente. */
  notesClient?: string | null
  /** v2.6.3 — Si true, affiche un bandeau "Modifié par le client" + liste des champs modifiés. */
  clientModified?: boolean
  /** v2.6.3 — Liste des field IDs / labels modifiés par le client (depuis metadata.modified_fields). */
  modifiedFields?: string[]
}): Promise<NotifResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY manquant' }
  if (!args.to) return { ok: false, error: 'destinataire admin vide' }

  const subject = `✅ Rapport signé — ${args.candidateName} · ${args.weekLabel}`

  const notesCandidatBlock = (args.notesCandidat || '').trim() ? `
      <div style="background:#FEF3C7;border-left:3px solid #EAB308;border-radius:0 8px 8px 0;padding:12px 14px;margin:14px 0;font-size:13px;color:#92400E;line-height:1.55;">
        <strong style="color:#78350F;">📝 Note du collaborateur</strong><br>
        ${escapeHtml((args.notesCandidat || '').trim())}
      </div>` : ''
  const notesClientBlock = (args.notesClient || '').trim() ? `
      <div style="background:#DBEAFE;border-left:3px solid #2563EB;border-radius:0 8px 8px 0;padding:12px 14px;margin:14px 0;font-size:13px;color:#1E40AF;line-height:1.55;">
        <strong style="color:#1E3A8A;">📝 Note du client</strong><br>
        ${escapeHtml((args.notesClient || '').trim())}
      </div>` : ''
  // v2.6.3 — Bandeau modification client (avant les notes pour priorité visuelle)
  const modifiedFieldsList = (args.modifiedFields || []).filter(s => s && s.trim())
  const clientModifiedBlock = args.clientModified ? `
      <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:14px 16px;margin:14px 0;font-size:13px;color:#92400E;line-height:1.55;">
        <strong style="color:#78350F;display:block;margin-bottom:6px;">⚠️ Données modifiées par le client</strong>
        Le client a ajusté ${modifiedFieldsList.length > 0 ? `<strong>${modifiedFieldsList.length} champ${modifiedFieldsList.length > 1 ? 's' : ''}</strong>` : 'certains champs'} du rapport avant de signer.
        ${modifiedFieldsList.length > 0 ? `<div style="font-size:12px;margin-top:6px;color:#78350F;">Champs : ${escapeHtml(modifiedFieldsList.slice(0, 10).join(', '))}${modifiedFieldsList.length > 10 ? ` (+${modifiedFieldsList.length - 10})` : ''}</div>` : ''}
        <div style="font-size:11.5px;margin-top:6px;color:#78350F;font-style:italic;">Détails complets sur le certificat de signatures joint.</div>
      </div>` : ''

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:24px;">
      <img src="https://www.talent-flow.ch/logo-agence-officiel-noir.png" alt="L-Agence" width="200" style="height:42px;width:auto;display:inline-block;border:0;" />
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
      </div>${clientModifiedBlock}${notesCandidatBlock}${notesClientBlock}
      <p style="font-size:13px;color:#374151;line-height:1.6;margin:0 0 18px;">
        Le PDF signé est joint à cet email.
      </p>
      <div style="text-align:center;margin-top:18px;">
        <a href="${args.downloadUrl}"
           style="display:inline-block;background:#EAB308;color:#1C1A14;padding:12px 22px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;border:1px solid #1C1A14;">
          Télécharger la copie signée →
        </a>
      </div>
    </div>
    <p style="text-align:center;font-size:11px;color:#9CA3AF;margin-top:18px;">
      Notification automatique TalentFlow Rapports
    </p>
  </div>
</body></html>`

  const notesText = [
    args.clientModified ? `/!\\ Données modifiées par le client (${modifiedFieldsList.length || '?'} champ(s)) — détails sur le certificat.` : '',
    (args.notesCandidat || '').trim() ? `Note collaborateur : ${args.notesCandidat}` : '',
    (args.notesClient || '').trim() ? `Note client : ${args.notesClient}` : '',
  ].filter(Boolean).join('\n')

  return await sendResend({
    to: args.to,
    subject,
    html,
    text: `Rapport signé — ${args.candidateName} · ${args.weekLabel}\n\n${notesText ? notesText + '\n\n' : ''}Télécharger la copie signée :\n${args.downloadUrl}`,
    attachments: args.attachments,
  })
}

// ─── 3.5 WhatsApp candidat — completed (Q4 v2.3.x) ────────────────────

export async function sendCompletedWhatsAppToCandidat(args: {
  phone: string
  candidatName: string
  /** Nom du contact client (priorité) ou nom entreprise */
  clientLabel: string
  weekLabel: string
  /** URL publique vers le PDF (route public download) */
  downloadUrl: string
}): Promise<NotifResult> {
  // v2.3.11 Bug 2 — Strip accents + retire 👋 (rendu ◆ par certaines apps WA)
  // + retire em-dash final (rendu ❓). Tout passe par toWhatsAppSafe.
  const firstName = toWhatsAppSafe((args.candidatName || '').trim().split(/\s+/)[0] || '')
  const safeClientLabel = toWhatsAppSafe(args.clientLabel || 'le client')
  const safeWeekLabel = toWhatsAppSafe(args.weekLabel || '')
  const body = toWhatsAppSafe([
    firstName ? `Bonjour ${firstName},` : 'Bonjour,',
    '',
    'Votre rapport est valide !',
    '',
    `Votre rapport d'heures pour la *${safeWeekLabel}*`,
    `a ete signe par ${safeClientLabel}.`,
    '',
    'Telechargez la copie signee :',
    args.downloadUrl,
    '',
    '- L-Agence SA',
  ].join('\n'))
  return sendWa(args.phone, body)
}

// ─── 4. Email candidat — completed avec PDF en PJ ────────────────────

export async function sendCompletedEmailToCandidat(args: {
  to: string
  candidateName: string
  clientName: string
  weekLabel: string
  attachments: { filename: string; content: string }[]
  /** v2.6.3 — Si true, affiche un bandeau "Modifié par le client" avant le corps. */
  clientModified?: boolean
  /** v2.6.3 — Liste des champs modifiés par le client (depuis metadata.modified_fields). */
  modifiedFields?: string[]
}): Promise<NotifResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY manquant' }
  if (!args.to) return { ok: false, error: 'destinataire vide' }

  const firstName = (args.candidateName || '').normalize('NFC').trim().split(/\s+/)[0] || ''
  const subject = `Votre rapport est signé — ${args.weekLabel}`
  // v2.6.3 — Bandeau "Modifié par le client" si applicable
  const modifiedFieldsList = (args.modifiedFields || []).filter(s => s && s.trim())
  const clientModifiedBlock = args.clientModified ? `
      <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:14px 16px;margin:0 0 16px;font-size:13px;color:#92400E;line-height:1.55;">
        <strong style="color:#78350F;display:block;margin-bottom:6px;">⚠️ Le client a ajusté votre rapport</strong>
        ${modifiedFieldsList.length > 0
          ? `${escapeHtml(args.clientName)} a modifié <strong>${modifiedFieldsList.length} champ${modifiedFieldsList.length > 1 ? 's' : ''}</strong> avant de signer.`
          : `${escapeHtml(args.clientName)} a modifié certains champs avant de signer.`}
        ${modifiedFieldsList.length > 0 ? `<div style="font-size:12px;margin-top:6px;color:#78350F;">Champs : ${escapeHtml(modifiedFieldsList.slice(0, 10).join(', '))}${modifiedFieldsList.length > 10 ? ` (+${modifiedFieldsList.length - 10})` : ''}</div>` : ''}
        <div style="font-size:11.5px;margin-top:6px;color:#78350F;font-style:italic;">Détails complets sur le certificat de signatures. En cas de désaccord, contactez L-Agence.</div>
      </div>` : ''
  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:24px;">
      <img src="https://www.talent-flow.ch/logo-agence-officiel-noir.png" alt="L-Agence" width="200" style="height:42px;width:auto;display:inline-block;border:0;" />
      <div style="font-size:9px;color:#6B7280;letter-spacing:1px;text-transform:uppercase;margin-top:2px;">Rapport hebdomadaire</div>
    </div>
    <div style="background:#fff;border:1px solid #E5E7EB;border-radius:14px;padding:28px 26px;">
      <div style="display:inline-block;background:#D1FAE5;color:#059669;padding:5px 11px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:14px;">
        ✓ Rapport validé
      </div>
      <h1 style="font-family:Georgia,serif;font-size:22px;font-weight:400;color:#1C1A14;margin:0 0 12px;">
        Bonjour ${escapeHtml(firstName) || escapeHtml(args.candidateName)},
      </h1>
      ${clientModifiedBlock}
      <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 16px;">
        Votre rapport d'heures pour la <strong>${escapeHtml(args.weekLabel)}</strong> a été signé par <strong>${escapeHtml(args.clientName)}</strong>.
      </p>
      <p style="font-size:13px;color:#374151;line-height:1.6;margin:0;">
        Une copie complète signée est jointe à cet email.
      </p>
    </div>
    <p style="text-align:center;font-size:11px;color:#9CA3AF;margin-top:18px;">
      L-Agence SA · TalentFlow Sign
    </p>
  </div>
</body></html>`

  const text = [
    `Bonjour ${firstName || args.candidateName},`,
    '',
    args.clientModified
      ? `/!\\ ${args.clientName} a modifié ${modifiedFieldsList.length || 'certains'} champ(s) avant de signer. Détails sur le certificat joint.`
      : '',
    `Votre rapport d'heures pour la ${args.weekLabel} a été signé par ${args.clientName}.`,
    'Une copie complète signée est jointe à cet email.',
    '',
    'L-Agence SA · TalentFlow Sign',
  ].filter(Boolean).join('\n')

  return await sendResend({
    to: args.to,
    subject,
    html,
    text,
    attachments: args.attachments,
  })
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
    <div style="text-align:center;margin-bottom:24px;">
      <img src="https://www.talent-flow.ch/logo-agence-officiel-noir.png" alt="L-Agence" width="200" style="height:42px;width:auto;display:inline-block;border:0;" />
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

// ─── 5b. WhatsApp client — completed (Critique 2) ─────────────────────

export async function sendCompletedWhatsAppToClient(args: {
  phone: string
  clientContactName?: string | null
  clientName?: string | null
  candidateName: string
  weekLabel: string
}): Promise<NotifResult> {
  const greetingName = toWhatsAppSafe(pickGreetingName(args))
  const candidateName = toWhatsAppSafe(args.candidateName || '')
  const weekLabel = toWhatsAppSafe(args.weekLabel || '')
  const body = toWhatsAppSafe([
    greetingName ? `Bonjour ${greetingName},` : 'Bonjour,',
    '',
    `Le rapport d'heures de ${candidateName} pour la ${weekLabel} est maintenant signe par les deux parties.`,
    '',
    '- L-Agence SA',
  ].join('\n'))
  return sendWa(args.phone, body)
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

function escapeHtml(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ─── 5. Email correction administrative (v2.6.17) ────────────────────
//
// Envoyé après qu'un admin/consultant corrige la semaine d'une submission signée.
// 3 audiences : admin (créateur du lien), candidat, client.
// La mention "correction" apparaît UNIQUEMENT dans l'email — pas sur le PDF.

export type CorrectionAudience = 'admin' | 'candidat' | 'client'

export async function sendCorrectionEmail(args: {
  to: string
  audience: CorrectionAudience
  candidateName: string
  clientName: string
  /** Nom du contact client (priorité salutation client) */
  clientContactName?: string | null
  fromWeekLabel: string
  fromWeekNumber: number
  toWeekLabel: string
  toWeekNumber: number
  reason: string
  /** Email de l'admin/consultant qui a corrigé */
  correctedBy: string
  attachments: { filename: string; content: string }[]
}): Promise<NotifResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY manquant' }
  if (!args.to) return { ok: false, error: 'destinataire vide' }

  const subject = `🔄 Correction rapport d'heures — ${args.candidateName} · ${args.toWeekLabel}`

  // Salutation adaptée à l'audience
  let greeting = ''
  if (args.audience === 'candidat') {
    const first = getFirstName(args.candidateName)
    greeting = first ? `Bonjour ${escapeHtml(first)},` : 'Bonjour,'
  } else if (args.audience === 'client') {
    const first = getFirstName(args.clientContactName || args.clientName || '')
    greeting = first ? `Bonjour ${escapeHtml(first)},` : 'Bonjour,'
  } else {
    greeting = 'Bonjour,'
  }

  // Intro adaptée
  const introBody = args.audience === 'admin'
    ? `Le rapport d'heures de <strong>${escapeHtml(args.candidateName)}</strong> chez <strong>${escapeHtml(args.clientName)}</strong> a été corrigé.`
    : args.audience === 'candidat'
      ? `Une correction administrative a été effectuée sur votre rapport d'heures signé.`
      : `Le rapport d'heures de <strong>${escapeHtml(args.candidateName)}</strong> a été corrigé. Le PDF mis à jour ci-joint <strong>remplace le précédent</strong>.`

  // Note candidat — invite à remplir la semaine libérée
  const candidatHint = args.audience === 'candidat' ? `
      <div style="background:#DBEAFE;border-left:3px solid #2563EB;border-radius:0 8px 8px 0;padding:12px 14px;margin:16px 0;font-size:13px;color:#1E40AF;line-height:1.55;">
        <strong style="color:#1E3A8A;">ℹ️ Bon à savoir</strong><br>
        La <strong>${escapeHtml(args.fromWeekLabel)}</strong> est désormais à nouveau disponible dans votre portail.
        Si vous avez travaillé cette semaine-là, vous pouvez la déclarer normalement.
      </div>` : ''

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:24px;">
      <img src="https://www.talent-flow.ch/logo-agence-officiel-noir.png" alt="L-Agence" width="200" style="height:42px;width:auto;display:inline-block;border:0;" />
      <div style="font-size:9px;color:#6B7280;letter-spacing:1px;text-transform:uppercase;margin-top:2px;">Correction rapport d'heures</div>
    </div>
    <div style="background:#fff;border:1px solid #E5E7EB;border-radius:14px;padding:28px 26px;box-shadow:0 4px 16px rgba(0,0,0,0.04);">
      <div style="display:inline-block;background:#FED7AA;color:#9A3412;padding:5px 11px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:14px;">
        🔄 Rapport corrigé
      </div>
      <h1 style="font-family:Georgia,serif;font-size:22px;font-weight:400;color:#1C1A14;margin:0 0 14px;line-height:1.25;">
        ${greeting}
      </h1>
      <p style="font-size:14.5px;color:#374151;line-height:1.6;margin:0 0 18px;">
        ${introBody}
      </p>
      <div style="background:#FAFAF7;border:1px solid #E5E7EB;border-radius:10px;padding:14px 16px;margin:16px 0;font-size:13px;color:#1C1A14;line-height:1.7;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span style="color:#9CA3AF;text-decoration:line-through;font-size:12px;">Semaine ${args.fromWeekNumber} · ${escapeHtml(args.fromWeekLabel)}</span>
        </div>
        <div style="font-size:14px;">
          <span style="color:#059669;font-weight:700;">→ Semaine ${args.toWeekNumber}</span>
          <span style="color:#1C1A14;"> · ${escapeHtml(args.toWeekLabel)}</span>
        </div>
      </div>
      <div style="background:#FEF3C7;border-left:3px solid #EAB308;border-radius:0 8px 8px 0;padding:12px 14px;margin:16px 0;font-size:13px;color:#92400E;line-height:1.55;">
        <strong style="color:#78350F;display:block;margin-bottom:4px;">Raison de la correction</strong>
        ${escapeHtml(args.reason)}
      </div>
      ${candidatHint}
      <p style="font-size:13px;color:#374151;line-height:1.6;margin:18px 0 6px;">
        Le rapport corrigé est joint à cet email.
      </p>
      <p style="font-size:11.5px;color:#6B7280;line-height:1.5;margin:14px 0 0;font-style:italic;">
        Correction effectuée par ${escapeHtml(args.correctedBy)} via TalentFlow.
      </p>
    </div>
    <p style="text-align:center;font-size:11px;color:#9CA3AF;margin-top:18px;">
      L-Agence SA · Notification TalentFlow Rapports
    </p>
  </div>
</body></html>`

  const text = [
    greeting.replace(/<[^>]+>/g, ''),
    '',
    args.audience === 'candidat'
      ? 'Une correction administrative a été effectuée sur votre rapport d\'heures.'
      : `Le rapport d'heures de ${args.candidateName} chez ${args.clientName} a été corrigé.`,
    '',
    `Ancienne semaine : S${args.fromWeekNumber} (${args.fromWeekLabel})`,
    `Nouvelle semaine : S${args.toWeekNumber} (${args.toWeekLabel})`,
    '',
    `Raison : ${args.reason}`,
    '',
    args.audience === 'candidat'
      ? `La ${args.fromWeekLabel} est à nouveau disponible dans votre portail.`
      : 'Le PDF corrigé est joint à cet email.',
    '',
    `Correction effectuée par ${args.correctedBy} via TalentFlow.`,
  ].join('\n')

  return await sendResend({
    to: args.to,
    subject,
    html,
    text,
    attachments: args.attachments,
  })
}
