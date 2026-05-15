// TalentFlow Sign — Templates email (design L-AGENCE v2)
// v2.2.0 — Phase 3
//
// HTML inline styles (compatibilité Outlook / Gmail / clients mobiles).
// Pas de CSS externe, pas de @media query non triviale, pas de SVG inline complexe.

export interface SignEmailParams {
  recipientName: string
  recipientRole?: string         // 'Signataire' | 'Copie'
  senderName: string             // Nom de l'expéditeur (créateur de l'enveloppe)
  senderEmail?: string
  envelopeTitle: string
  message?: string | null         // Message libre saisi à la création
  signUrl: string                 // URL complète /sign/v/{token}
  documentsCount?: number
  expiresAt?: string              // ISO date pour afficher "expire le X"
}

// Palette v2.2.0 Phase 3 — TalentFlow Sign emails
const PRIMARY = '#f59e0b'         // amber accent (brief Phase 3)
const PRIMARY_FG = '#000000'
const FOREGROUND = '#1C1A14'
const MUTED = '#78716c'           // gris stone-500 (footer)
const BORDER = '#E5E7EB'
const SOFT_BG = '#FAFAF7'         // crème doux (fond général)
const FOOTER_BG = '#f5f5f4'       // gris stone-100 (footer)
const HEADER_BG = '#FAFAF7'       // crème doux (header sobre, plus de fond noir agressif)
const HEADER_FG = '#1C1A14'       // texte du header (gris foncé sur fond crème)
const REMINDER_RED = '#dc2626'    // rouge badge "RAPPEL"

/**
 * Build le HTML de l'email d'invitation à signer.
 * Style L-AGENCE v2 : crème + or + noir, simple et lisible.
 */
export function buildSignInviteHtml(p: SignEmailParams): string {
  const isCC = p.recipientRole === 'Copie' || p.recipientRole === 'cc'
  const ctaLabel = isCC ? 'Voir le document' : 'Signer le document'
  const headline = isCC
    ? 'Vous recevez ce document en copie'
    : `${p.senderName} vous invite à signer un document`

  const expiresLine = p.expiresAt
    ? `<p style="${pStyle()}; color:${MUTED}; font-size:12px; margin-top:24px;">
         Ce lien expire le ${formatExpiryDate(p.expiresAt)}.
       </p>`
    : ''

  const messageBlock = p.message?.trim()
    ? `<div style="background:${SOFT_BG}; border:1px solid ${BORDER}; border-radius:8px; padding:16px; margin:20px 0;">
         <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:${MUTED}; margin-bottom:6px;">
           Message de ${escapeHtml(p.senderName)}
         </div>
         <div style="font-size:14px; color:${FOREGROUND}; line-height:1.5; white-space:pre-wrap;">
           ${escapeHtml(p.message)}
         </div>
       </div>`
    : ''

  const docsLine = (p.documentsCount && p.documentsCount > 1)
    ? `<p style="${pStyle()};">${p.documentsCount} documents à examiner.</p>`
    : ''

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(p.envelopeTitle)}</title>
</head>
<body style="margin:0; padding:0; background:${SOFT_BG}; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; color:${FOREGROUND};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${SOFT_BG};">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; width:100%; background:#ffffff; border:1px solid ${BORDER}; border-radius:14px; overflow:hidden;">

          <!-- v2.8.0 — Logo officiel L-Agence (PNG transparent, même que compliance/report/etc) -->
          <tr>
            <td style="padding:28px 32px 18px 32px; background:${HEADER_BG}; text-align:center; border-bottom:1px solid ${BORDER};">
              <img src="https://www.talent-flow.ch/logo-agence-officiel-noir.png" alt="L-Agence — Emplois fixes & temporaires" width="200" style="height:42px;width:auto;display:inline-block;border:0;" />
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 32px 8px 32px;">
              <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:${PRIMARY}; margin-bottom:8px;">
                ${isCC ? 'Document à consulter' : 'Document à signer'}
              </div>
              <h1 style="margin:0 0 14px 0; font-family:Georgia,'Times New Roman',serif; font-size:22px; font-weight:400; line-height:1.3; color:${FOREGROUND};">
                ${escapeHtml(headline)}
              </h1>
              <p style="${pStyle()};">
                Bonjour ${escapeHtml(firstName(p.recipientName))},
              </p>
              <p style="${pStyle()};">
                Vous avez reçu un document à ${isCC ? 'consulter' : 'signer'} :
                <strong style="color:${FOREGROUND};">${escapeHtml(p.envelopeTitle)}</strong>.
              </p>
              ${docsLine}
              ${messageBlock}
            </td>
          </tr>

          <!-- CTA — bouton plat jaune amber #f59e0b, rayon 8px (brief Phase 3) -->
          <tr>
            <td align="center" style="padding:8px 32px 24px 32px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="background:${PRIMARY}; border-radius:8px;">
                    <a href="${p.signUrl}"
                       style="display:inline-block; padding:14px 28px; font-size:15px; font-weight:700; color:${PRIMARY_FG}; text-decoration:none; font-family:inherit; letter-spacing:0.01em;">
                      ${ctaLabel}
                    </a>
                  </td>
                </tr>
              </table>
              <!-- Mention signature au doigt (mobile) — note grise sous le bouton -->
              ${isCC ? '' : `
              <p style="margin:12px 0 0 0; font-size:11.5px; color:${MUTED}; line-height:1.5;">
                <span style="font-size:13px;">⚠️</span>
                Sur mobile, signez impérativement avec votre doigt
              </p>`}
              <p style="${pStyle()}; font-size:12px; color:${MUTED}; margin-top:14px;">
                Ou copiez ce lien dans votre navigateur :<br>
                <a href="${p.signUrl}" style="color:${PRIMARY}; word-break:break-all;">${p.signUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer — branding L-Agence renforcé (fond gris stone) -->
          <tr>
            <td style="padding:24px 32px 26px 32px; border-top:1px solid ${BORDER}; background:${FOOTER_BG};">
              ${expiresLine}
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding-bottom:10px; border-bottom:1px solid ${BORDER};">
                    <div style="font-family:Georgia,'Times New Roman',serif; font-size:18px; font-weight:400; letter-spacing:.04em; color:${FOREGROUND};">
                      L&#8209;AGENCE SA
                    </div>
                    <div style="font-size:11px; color:${MUTED}; margin-top:2px;">
                      Agence d'emploi · Monthey, Suisse
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:10px;">
                    <p style="margin:0; font-size:11px; color:${MUTED}; line-height:1.5;">
                      Cet email a été envoyé par TalentFlow Sign pour le compte de
                      <strong>${escapeHtml(p.senderName)}</strong>${p.senderEmail ? ` (<a href="mailto:${escapeHtml(p.senderEmail)}" style="color:${MUTED};">${escapeHtml(p.senderEmail)}</a>)` : ''}.
                    </p>
                    <p style="margin:6px 0 0 0; font-size:11px; color:${MUTED};">
                      <a href="https://talent-flow.ch" style="color:${MUTED}; text-decoration:none;">talent-flow.ch</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`
}

/** Version texte brut fallback (clients sans HTML). */
export function buildSignInviteText(p: SignEmailParams): string {
  const isCC = p.recipientRole === 'Copie' || p.recipientRole === 'cc'
  const action = isCC ? 'consulter' : 'signer'
  const lines = [
    `Bonjour ${firstName(p.recipientName)},`,
    '',
    `${p.senderName} vous invite à ${action} un document : ${p.envelopeTitle}.`,
    '',
    p.message ? `Message :\n${p.message}\n` : '',
    `Lien pour ${action} le document :`,
    p.signUrl,
    '',
    p.expiresAt ? `Ce lien expire le ${formatExpiryDate(p.expiresAt)}.` : '',
    '',
    '— L-AGENCE SA · talent-flow.ch',
  ]
  return lines.filter(Boolean).join('\n')
}

// Helpers internes
function pStyle(): string {
  return `margin:0 0 12px 0; font-size:14px; line-height:1.55; color:${FOREGROUND};`
}

function escapeHtml(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function firstName(full: string): string {
  return (full || '').split(/\s+/)[0] || full || ''
}

function formatExpiryDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' })
  } catch {
    return iso
  }
}

// ─────────────────────────────────────────────────────────────────
// Email 3 — Reminder (relance manuel depuis dashboard)
// v2.2.0 Phase 3
// ─────────────────────────────────────────────────────────────────

/**
 * Build le HTML de l'email de RAPPEL (reminder).
 * Réutilise la structure du buildSignInviteHtml mais ajoute :
 * - Un badge rouge "RAPPEL" dans le header
 * - Un message "Nous vous rappelons que..."
 * - Sujet adapté côté send-email.ts
 */
export function buildSignReminderHtml(p: SignEmailParams): string {
  const isCC = p.recipientRole === 'Copie' || p.recipientRole === 'cc'
  const ctaLabel = isCC ? 'Voir le document' : 'Signer le document'
  const action = isCC ? 'consulter' : 'signer'

  const expiresLine = p.expiresAt
    ? `<p style="${pStyle()}; color:${MUTED}; font-size:12px; margin-top:24px;">
         Ce lien est valable jusqu'au ${formatExpiryDate(p.expiresAt)}.
       </p>`
    : ''

  const messageBlock = p.message?.trim()
    ? `<div style="background:${SOFT_BG}; border:1px solid ${BORDER}; border-radius:8px; padding:16px; margin:20px 0;">
         <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:${MUTED}; margin-bottom:6px;">
           Message de ${escapeHtml(p.senderName)}
         </div>
         <div style="font-size:14px; color:${FOREGROUND}; line-height:1.5; white-space:pre-wrap;">
           ${escapeHtml(p.message)}
         </div>
       </div>`
    : ''

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rappel : ${escapeHtml(p.envelopeTitle)}</title>
</head>
<body style="margin:0; padding:0; background:${SOFT_BG}; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; color:${FOREGROUND};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${SOFT_BG};">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; width:100%; background:#ffffff; border:1px solid ${BORDER}; border-radius:14px; overflow:hidden;">

          <!-- v2.8.0 — Logo officiel L-Agence (PNG transparent) + badge rouge "RAPPEL" -->
          <tr>
            <td style="padding:28px 32px 18px 32px; background:${HEADER_BG}; text-align:center; position:relative; border-bottom:1px solid ${BORDER};">
              <div style="text-align:right; margin-bottom:10px;">
                <span style="display:inline-block; padding:3px 10px; background:${REMINDER_RED}; color:#ffffff; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; border-radius:4px;">
                  Rappel
                </span>
              </div>
              <img src="https://www.talent-flow.ch/logo-agence-officiel-noir.png" alt="L-Agence — Emplois fixes & temporaires" width="200" style="height:42px;width:auto;display:inline-block;border:0;" />
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 32px 8px 32px;">
              <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:${REMINDER_RED}; margin-bottom:8px;">
                Document en attente
              </div>
              <h1 style="margin:0 0 14px 0; font-family:Georgia,'Times New Roman',serif; font-size:22px; font-weight:400; line-height:1.3; color:${FOREGROUND};">
                Rappel — votre signature est attendue
              </h1>
              <p style="${pStyle()};">
                Bonjour ${escapeHtml(firstName(p.recipientName))},
              </p>
              <p style="${pStyle()};">
                Nous vous rappelons que le document
                <strong style="color:${FOREGROUND};">${escapeHtml(p.envelopeTitle)}</strong>
                est en attente de votre ${isCC ? 'consultation' : 'signature'}.
              </p>
              ${messageBlock}
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td align="center" style="padding:8px 32px 24px 32px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="background:${PRIMARY}; border-radius:8px;">
                    <a href="${p.signUrl}"
                       style="display:inline-block; padding:14px 28px; font-size:15px; font-weight:700; color:${PRIMARY_FG}; text-decoration:none; font-family:inherit; letter-spacing:0.01em;">
                      ${ctaLabel}
                    </a>
                  </td>
                </tr>
              </table>
              ${isCC ? '' : `
              <p style="margin:12px 0 0 0; font-size:11.5px; color:${MUTED}; line-height:1.5;">
                <span style="font-size:13px;">⚠️</span>
                Sur mobile, signez impérativement avec votre doigt
              </p>`}
              <p style="${pStyle()}; font-size:12px; color:${MUTED}; margin-top:14px;">
                Ou copiez ce lien dans votre navigateur :<br>
                <a href="${p.signUrl}" style="color:${PRIMARY}; word-break:break-all;">${p.signUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px 26px 32px; border-top:1px solid ${BORDER}; background:${FOOTER_BG};">
              ${expiresLine}
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding-bottom:10px; border-bottom:1px solid ${BORDER};">
                    <div style="font-family:Georgia,'Times New Roman',serif; font-size:18px; font-weight:400; letter-spacing:.04em; color:${FOREGROUND};">
                      L&#8209;AGENCE SA
                    </div>
                    <div style="font-size:11px; color:${MUTED}; margin-top:2px;">
                      Agence d'emploi · Monthey, Suisse
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:10px;">
                    <p style="margin:0; font-size:11px; color:${MUTED}; line-height:1.5;">
                      Ce lien est <strong>personnel et sécurisé</strong>. Ne pas le partager.
                    </p>
                    <p style="margin:6px 0 0 0; font-size:11px; color:${MUTED};">
                      <a href="https://talent-flow.ch" style="color:${MUTED}; text-decoration:none;">talent-flow.ch</a>
                      · TalentFlow Sign · Conforme ZertES
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`
}

/** Version texte brut fallback du reminder. */
export function buildSignReminderText(p: SignEmailParams): string {
  const isCC = p.recipientRole === 'Copie' || p.recipientRole === 'cc'
  const action = isCC ? 'consulter' : 'signer'
  const lines = [
    `Bonjour ${firstName(p.recipientName)},`,
    '',
    `RAPPEL — Nous vous rappelons que le document "${p.envelopeTitle}" est en attente de votre ${isCC ? 'consultation' : 'signature'}.`,
    '',
    p.message ? `Message :\n${p.message}\n` : '',
    `Lien pour ${action} le document :`,
    p.signUrl,
    '',
    p.expiresAt ? `Ce lien est valable jusqu'au ${formatExpiryDate(p.expiresAt)}.` : '',
    '',
    '— L-Agence SA · talent-flow.ch · TalentFlow Sign',
  ]
  return lines.filter(Boolean).join('\n')
}
