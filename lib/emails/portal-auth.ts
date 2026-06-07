// lib/emails/portal-auth.ts
// Templates emails branding L-Agence pour le portail (invitation + reset password).
// Logo officiel + style harmonisé avec les autres emails TalentFlow Sign/Rapport.

const FROM = 'L-Agence <noreply@talent-flow.ch>'
const LOGO = 'https://www.talent-flow.ch/logo-agence-officiel-noir.png'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.talent-flow.ch'

async function sendEmail(opts: { to: string; subject: string; html: string }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[portal-auth] RESEND_API_KEY absent — email non envoyé')
    return { ok: false, error: 'RESEND_API_KEY missing' }
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to: [opts.to], subject: opts.subject, html: opts.html }),
  })
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    return { ok: false, error: `Resend ${r.status}: ${t.slice(0, 200)}` }
  }
  return { ok: true }
}

// Wrapper HTML commun (header logo + footer L-Agence)
function emailLayout(content: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>L-Agence SA</title></head>
<body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1C1A14;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF7;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#FFFFFF;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.06);overflow:hidden;">
        <tr><td style="padding:32px 32px 16px;text-align:center;border-bottom:1px solid #F3F4F6;">
          <img src="${LOGO}" alt="L-Agence" width="200" style="height:42px;width:auto;display:inline-block;border:0;" />
        </td></tr>
        <tr><td style="padding:28px 32px;font-size:15px;line-height:1.55;color:#1C1A14;">
          ${content}
        </td></tr>
        <tr><td style="padding:20px 32px 28px;border-top:1px solid #F3F4F6;font-size:12px;color:#6B7280;text-align:center;line-height:1.5;">
          L-Agence SA — Emplois fixes & temporaires<br>
          Av. des Alpes 3, 1870 Monthey · +41 24 552 18 70 · info@l-agence.ch
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function btn(href: string, label: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:20px 0;"><tr><td style="background:#EAB308;border-radius:10px;">
    <a href="${href}" style="display:inline-block;padding:12px 24px;color:#1C1A14;text-decoration:none;font-weight:600;font-size:14px;">${label}</a>
  </td></tr></table>`
}

// ──────────────────────────────────────────────────────────────────────────
// Email CODE de changement d'email (v2.10.44) — envoyé sur le NOUVEL email
// ──────────────────────────────────────────────────────────────────────────
export async function sendEmailChangeCodeEmail(opts: { to: string; code: string }) {
  const html = emailLayout(`
    <h1 style="font-size:20px;font-weight:700;margin:0 0 14px;">Confirme ton nouvel e-mail</h1>
    <p style="margin:0 0 12px;">Tu as demandé à changer l'adresse e-mail de ton compte L-Agence. Voici ton code de confirmation :</p>
    <div style="text-align:center;margin:22px 0;">
      <span style="display:inline-block;font-size:32px;font-weight:800;letter-spacing:8px;color:#1C1A14;background:#FEF3C7;padding:14px 22px;border-radius:12px;">${opts.code}</span>
    </div>
    <p style="margin:0 0 6px;color:#6B7280;font-size:13.5px;">Saisis ce code dans l'application pour valider le changement. Il expire dans 15 minutes.</p>
    <p style="margin:0;color:#6B7280;font-size:13.5px;">Si tu n'es pas à l'origine de cette demande, ignore cet e-mail — rien ne sera modifié.</p>
  `)
  return sendEmail({ to: opts.to, subject: 'Code de confirmation — Changement d\'e-mail', html })
}

// ──────────────────────────────────────────────────────────────────────────
// Email INVITATION (admin invite un client/candidat → il crée son mdp)
// ──────────────────────────────────────────────────────────────────────────

export async function sendInvitationEmail(opts: {
  to: string
  accountType: 'client' | 'candidat'
  token: string
  contextLabel?: string // ex: nom entreprise client ou nom candidat
}) {
  const path = opts.accountType === 'client' ? '/client-portal/set-password' : '/report/set-password'
  const url = `${APP_URL}${path}?token=${encodeURIComponent(opts.token)}`
  const audience = opts.accountType === 'client' ? 'votre portail' : 'votre espace rapports'
  const greeting = opts.accountType === 'client' ? 'Bonjour' : 'Bonjour'

  const html = emailLayout(`
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#1C1A14;">${greeting},</h1>
    <p style="margin:0 0 12px;">Nous vous invitons à accéder à ${audience}${opts.contextLabel ? ` <strong>${opts.contextLabel}</strong>` : ''}.</p>
    <p style="margin:0 0 12px;">Cliquez sur le bouton ci-dessous pour créer votre mot de passe (valable 7 jours).</p>
    ${btn(url, 'Créer mon mot de passe')}
    <p style="margin:16px 0 0;font-size:13px;color:#6B7280;">Si vous n'avez pas demandé cet accès, vous pouvez ignorer cet email.</p>
    <p style="margin:8px 0 0;font-size:12px;color:#9CA3AF;word-break:break-all;">${url}</p>
  `)

  return sendEmail({
    to: opts.to,
    subject: `L-Agence SA — Accès à ${audience}`,
    html,
  })
}

// ──────────────────────────────────────────────────────────────────────────
// Email RESET PASSWORD (utilisateur a oublié son mdp)
// ──────────────────────────────────────────────────────────────────────────

export async function sendResetPasswordEmail(opts: {
  to: string
  accountType: 'client' | 'candidat'
  token: string
}) {
  const path = opts.accountType === 'client' ? '/client-portal/set-password' : '/report/set-password'
  const url = `${APP_URL}${path}?token=${encodeURIComponent(opts.token)}`

  const html = emailLayout(`
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#1C1A14;">Réinitialisation du mot de passe</h1>
    <p style="margin:0 0 12px;">Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous (lien valable 1 heure).</p>
    ${btn(url, 'Réinitialiser mon mot de passe')}
    <p style="margin:16px 0 0;font-size:13px;color:#6B7280;">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email — votre mot de passe actuel reste inchangé.</p>
    <p style="margin:8px 0 0;font-size:12px;color:#9CA3AF;word-break:break-all;">${url}</p>
  `)

  return sendEmail({
    to: opts.to,
    subject: 'L-Agence SA — Réinitialisation du mot de passe',
    html,
  })
}
