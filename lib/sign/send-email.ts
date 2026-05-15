// TalentFlow Sign — Envoi email via Resend
// v2.2.0 — Phase 3
//
// Pattern repo : fetch direct https://api.resend.com/emails (pas de SDK npm).
// Cohérent avec app/(dashboard)/api/annonces/france-travail, /api/auth/welcome, etc.

import {
  buildSignInviteHtml, buildSignInviteText,
  buildSignReminderHtml, buildSignReminderText,
  type SignEmailParams,
} from './email-templates'

const FROM_DEFAULT = 'TalentFlow Sign <noreply@talent-flow.ch>'

export interface SendEmailResult {
  ok: boolean
  id?: string
  error?: string
}

/**
 * Envoie un email d'invitation à signer (HTML + plain text fallback).
 * Pas de throw — retourne un résultat structuré pour ne pas bloquer
 * l'envoi des autres destinataires en cas d'erreur ponctuelle.
 */
export async function sendSignInviteEmail(
  to: string,
  params: SignEmailParams,
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY manquant' }
  }
  if (!to) {
    return { ok: false, error: 'destinataire vide' }
  }

  // v2.8.6 — Subject adapté singulier/pluriel selon documentsCount
  const isCC = params.recipientRole === 'Copie' || params.recipientRole === 'cc'
  const action = isCC ? 'consulter' : 'signer'
  const isPlural = (params.documentsCount || 1) > 1
  const subject = `${params.envelopeTitle} — ${isPlural ? 'Documents' : 'Document'} à ${action}`
  const html = buildSignInviteHtml(params)
  const text = buildSignInviteText(params)

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_DEFAULT,
        to: [to],
        // Reply-to vers l'expéditeur si fourni → le destinataire peut répondre directement
        reply_to: params.senderEmail ? [params.senderEmail] : undefined,
        subject,
        html,
        text,
      }),
    })
    if (!r.ok) {
      const err = await r.text()
      console.error('[sign/send-email] Resend error', r.status, err)
      return { ok: false, error: `Resend ${r.status}: ${err.slice(0, 200)}` }
    }
    const data = await r.json() as { id?: string }
    return { ok: true, id: data.id }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur réseau'
    console.error('[sign/send-email] exception', e)
    return { ok: false, error: msg }
  }
}

/**
 * Envoie un email de RAPPEL (reminder) au destinataire — Phase 3.
 * Identique à sendSignInviteEmail mais avec sujet "Rappel : ..." et template reminder.
 */
export async function sendSignReminderEmail(
  to: string,
  params: SignEmailParams,
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY manquant' }
  if (!to) return { ok: false, error: 'destinataire vide' }

  // v2.8.6 — Subject adapté singulier/pluriel selon documentsCount
  const isPluralReminder = (params.documentsCount || 1) > 1
  const subject = `Rappel : ${params.envelopeTitle} — ${isPluralReminder ? 'Documents' : 'Document'} en attente de signature`
  const html = buildSignReminderHtml(params)
  const text = buildSignReminderText(params)

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_DEFAULT,
        to: [to],
        reply_to: params.senderEmail ? [params.senderEmail] : undefined,
        subject,
        html,
        text,
      }),
    })
    if (!r.ok) {
      const err = await r.text()
      console.error('[sign/send-email] Resend reminder error', r.status, err)
      return { ok: false, error: `Resend ${r.status}: ${err.slice(0, 200)}` }
    }
    const data = await r.json() as { id?: string }
    return { ok: true, id: data.id }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur réseau'
    console.error('[sign/send-email] reminder exception', e)
    return { ok: false, error: msg }
  }
}

// ─── Phase 4c — Email de finalisation avec PDFs signés en attachement ───

export interface SignCompletedEmailParams {
  recipientName: string
  envelopeTitle: string
  senderName: string
  senderEmail?: string
  signedAt: Date
  /** Liste des PDFs signés à attacher (filename + content base64) */
  attachments: { filename: string; content: string }[]
}

/**
 * Envoie un email de confirmation de signature avec les PDFs signés en pièces jointes.
 * Utilisé pour : tous les destinataires + admin L-Agence après finalize.
 */
export async function sendSignCompletedEmail(
  to: string,
  params: SignCompletedEmailParams,
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY manquant' }
  if (!to) return { ok: false, error: 'destinataire vide' }

  const dateStr = params.signedAt.toLocaleDateString('fr-CH', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
  const timeStr = params.signedAt.toLocaleTimeString('fr-CH', {
    hour: '2-digit', minute: '2-digit',
  })

  // v2.8.6 — Subject + corps adaptés au nombre de PDFs (attachments contient
  // le contrat + éventuellement le certificat exclu via filter dans finalize).
  const docsCount = params.attachments.length
  const subject = docsCount > 1
    ? `Documents signés — ${params.envelopeTitle}`
    : `Document signé — ${params.envelopeTitle}`
  const html = buildCompletedHtml(params, dateStr, timeStr)
  const text = buildCompletedText(params, dateStr, timeStr)

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_DEFAULT,
        to: [to],
        reply_to: params.senderEmail ? [params.senderEmail] : undefined,
        subject,
        html,
        text,
        attachments: params.attachments,
      }),
    })
    if (!r.ok) {
      const err = await r.text()
      console.error('[sign/send-email] Resend completed error', r.status, err)
      return { ok: false, error: `Resend ${r.status}: ${err.slice(0, 200)}` }
    }
    const data = await r.json() as { id?: string }
    return { ok: true, id: data.id }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur réseau'
    console.error('[sign/send-email] completed exception', e)
    return { ok: false, error: msg }
  }
}

function normalizeSender(name: string): string {
  if (!name) return name
  let n = name.trim()
  n = n.replace(/\s+(SA|S\.A\.|SARL|Sàrl|S\.à r\.l\.|SAS|AG|GmbH|Ltd|Limited|S\.A\.S\.)\.?$/i, '').trim()
  if (n === n.toUpperCase() && n.length > 3) {
    n = n.split(/(\s+|-+)/).map(part => {
      if (/^[\s-]+$/.test(part)) return part
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    }).join('')
  }
  return n
}

function buildCompletedHtml(p: SignCompletedEmailParams, dateStr: string, timeStr: string): string {
  const senderName = normalizeSender(p.senderName)
  const docsCount = p.attachments.length
  const docsNoun = docsCount > 1 ? 'documents' : 'document'
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:24px;">
      <img src="https://www.talent-flow.ch/logo-agence-officiel-noir.png" alt="L-Agence — Emplois fixes & temporaires" width="200" style="height:42px;width:auto;display:inline-block;border:0;" />
    </div>
    <div style="background:#fff;border:1px solid #E5E7EB;border-radius:14px;padding:28px 26px;box-shadow:0 4px 16px rgba(0,0,0,0.04);">
      <div style="display:inline-block;background:#D1FAE5;color:#059669;padding:5px 11px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:14px;">
        ✓ Signé électroniquement
      </div>
      <h1 style="font-family:Georgia,serif;font-size:24px;font-weight:400;color:#1C1A14;margin:0 0 14px;line-height:1.25;">
        Bonjour ${escapeHtml(p.recipientName.split(/\s+/)[0] || p.recipientName)},
      </h1>
      <p style="font-size:14.5px;color:#374151;line-height:1.6;margin:0 0 16px;">
        ${docsNoun === 'documents' ? 'Vos documents' : 'Votre document'} <strong>${escapeHtml(p.envelopeTitle)}</strong> ${docsNoun === 'documents' ? 'ont été signés' : 'a été signé'} électroniquement avec succès.
      </p>
      <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 18px;">
        Une copie complète signée est jointe à cet email (${docsCount} ${docsNoun}).
      </p>
      <div style="background:#FAFAF7;border:1px solid #E5E7EB;border-radius:10px;padding:14px 16px;margin:20px 0;">
        <div style="font-size:11px;color:#6B7280;letter-spacing:0.05em;text-transform:uppercase;font-weight:700;margin-bottom:6px;">Détails signature</div>
        <div style="font-size:13px;color:#1C1A14;line-height:1.7;">
          <strong>Date :</strong> ${dateStr} à ${timeStr}<br>
          <strong>Signé par :</strong> ${escapeHtml(p.recipientName)}<br>
          <strong>Plateforme :</strong> TalentFlow Sign · Conforme ZertES
        </div>
      </div>
      <p style="font-size:13px;color:#6B7280;line-height:1.6;margin:18px 0 0;">
        Conservez cet email et les pièces jointes — ils constituent la preuve de votre signature.
        Pour toute question, contactez ${escapeHtml(senderName)}${p.senderEmail ? ` (<a href="mailto:${escapeHtml(p.senderEmail)}" style="color:#A16207;">${escapeHtml(p.senderEmail)}</a>)` : ''}.
      </p>
    </div>
    <p style="text-align:center;font-size:11px;color:#9CA3AF;margin-top:18px;">
      ${escapeHtml(senderName)} · Sécurisé par TalentFlow Sign
    </p>
  </div>
</body></html>`
}

function buildCompletedText(p: SignCompletedEmailParams, dateStr: string, timeStr: string): string {
  const senderName = normalizeSender(p.senderName)
  const docsCount = p.attachments.length
  const isPlural = docsCount > 1
  return [
    `Bonjour ${p.recipientName.split(/\s+/)[0] || p.recipientName},`,
    '',
    `${isPlural ? 'Vos documents' : 'Votre document'} "${p.envelopeTitle}" ${isPlural ? 'ont été signés' : 'a été signé'} électroniquement avec succès.`,
    `Une copie complète signée est jointe à cet email (${docsCount} ${isPlural ? 'documents' : 'document'}).`,
    '',
    'Détails signature :',
    `  Date : ${dateStr} à ${timeStr}`,
    `  Signé par : ${p.recipientName}`,
    '  Plateforme : TalentFlow Sign · Conforme ZertES',
    '',
    'Conservez cet email et les pièces jointes — ils constituent la preuve de votre signature.',
    `${senderName}${p.senderEmail ? ` · ${p.senderEmail}` : ''}`,
  ].join('\n')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ─── Phase 4c — Notif sender après chaque signature ─────────────────────

export interface SignerSignedNotifyParams {
  /** Email de l'admin qui a créé l'enveloppe */
  to: string
  /** Nom de l'enveloppe */
  envelopeTitle: string
  /** Nom du signataire qui vient de signer */
  signerName: string
  /** Email du signataire qui vient de signer */
  signerEmail: string
  /** Date/heure de la signature */
  signedAt: Date
  /** Nom du PROCHAIN signataire attendu (null si tous ont signé) */
  nextSignerName: string | null
  /** Lien vers la page dashboard de l'enveloppe */
  envelopeUrl: string
}

/**
 * Notif au sender (admin créateur) après CHAQUE signature.
 * Body : "✅ {signer} a signé. En attente de {next}." OU "✅ Tous ont signé."
 */
export async function sendSignerSignedNotificationEmail(
  params: SignerSignedNotifyParams,
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY manquant' }
  if (!params.to) return { ok: false, error: 'destinataire vide' }

  const isCompleted = !params.nextSignerName
  const subject = isCompleted
    ? `✅ Toutes les signatures sont collectées — ${params.envelopeTitle}`
    : `✍️ ${params.signerName} a signé — ${params.envelopeTitle}`

  const html = buildSignerSignedHtml(params, isCompleted)
  const text = buildSignerSignedText(params, isCompleted)

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_DEFAULT,
        to: [params.to],
        subject,
        html,
        text,
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

function buildSignerSignedHtml(p: SignerSignedNotifyParams, isCompleted: boolean): string {
  const dateStr = p.signedAt.toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' })
  const timeStr = p.signedAt.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })
  const badgeBg = isCompleted ? '#D1FAE5' : '#FEF3C7'
  const badgeColor = isCompleted ? '#059669' : '#A16207'
  const badgeLabel = isCompleted ? '✓ Toutes les signatures' : '✓ Une signature reçue'
  const headline = isCompleted
    ? `Toutes les parties ont signé l'enveloppe.`
    : `${escapeHtml(p.signerName)} vient de signer.`
  const subline = isCompleted
    ? `L'enveloppe est complète. Les PDFs signés ont été envoyés à tous les destinataires.`
    : `En attente de la signature de <strong>${escapeHtml(p.nextSignerName || '')}</strong>.`

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:20px;">
      <span style="font-family:Georgia,serif;font-size:22px;font-weight:400;letter-spacing:-0.4px;color:#1C1A14;">L-Agence</span>
      <div style="font-size:9px;color:#6B7280;letter-spacing:1px;text-transform:uppercase;margin-top:2px;">TalentFlow Sign</div>
    </div>
    <div style="background:#fff;border:1px solid #E5E7EB;border-radius:14px;padding:28px 26px;box-shadow:0 4px 16px rgba(0,0,0,0.04);">
      <div style="display:inline-block;background:${badgeBg};color:${badgeColor};padding:5px 11px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:14px;">
        ${badgeLabel}
      </div>
      <h1 style="font-family:Georgia,serif;font-size:22px;font-weight:400;color:#1C1A14;margin:0 0 10px;line-height:1.3;">
        ${headline}
      </h1>
      <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 18px;">
        ${subline}
      </p>
      <div style="background:#FAFAF7;border:1px solid #E5E7EB;border-radius:10px;padding:14px 16px;margin:16px 0;">
        <div style="font-size:11px;color:#6B7280;letter-spacing:0.05em;text-transform:uppercase;font-weight:700;margin-bottom:6px;">Détails</div>
        <div style="font-size:13px;color:#1C1A14;line-height:1.7;">
          <strong>Enveloppe :</strong> ${escapeHtml(p.envelopeTitle)}<br>
          <strong>Signataire :</strong> ${escapeHtml(p.signerName)} (${escapeHtml(p.signerEmail)})<br>
          <strong>Signé le :</strong> ${dateStr} à ${timeStr}
        </div>
      </div>
      <div style="text-align:center;margin-top:22px;">
        <a href="${p.envelopeUrl}"
           style="display:inline-block;background:#EAB308;color:#1C1A14;padding:12px 22px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;border:1px solid #1C1A14;">
          Voir l'enveloppe →
        </a>
      </div>
    </div>
    <p style="text-align:center;font-size:11px;color:#9CA3AF;margin-top:18px;">
      Notification automatique TalentFlow Sign
    </p>
  </div>
</body></html>`
}

function buildSignerSignedText(p: SignerSignedNotifyParams, isCompleted: boolean): string {
  const dateStr = p.signedAt.toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' })
  const timeStr = p.signedAt.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })
  return [
    isCompleted
      ? `Toutes les parties ont signé l'enveloppe « ${p.envelopeTitle} ».`
      : `${p.signerName} vient de signer « ${p.envelopeTitle} ».`,
    '',
    isCompleted
      ? `L'enveloppe est complète. Les PDFs signés ont été envoyés à tous les destinataires.`
      : `En attente de la signature de ${p.nextSignerName || '—'}.`,
    '',
    `Signataire : ${p.signerName} (${p.signerEmail})`,
    `Signé le : ${dateStr} à ${timeStr}`,
    '',
    `Voir l'enveloppe : ${p.envelopeUrl}`,
  ].join('\n')
}
