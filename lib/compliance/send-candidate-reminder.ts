// TalentFlow Compliance — Rappel candidat individuel (J-30 et J-14)
// v2.7.1
//
// Envoyé au candidat lui-même quand son permis / CQC / carte conducteur
// arrive à échéance dans 30 ou 14 jours.
// Pas d'envoi répété (dedup via candidat_documents.metadata.notif_30d_sent_at / notif_14d_sent_at).

import { formatExpiryDate } from './document-status'

const FROM_DEFAULT = 'L-Agence SA <noreply@talent-flow.ch>'

export interface CandidateReminderResult {
  ok: boolean
  id?: string
  error?: string
}

export type ReminderWindow = 30 | 14

export async function sendCandidateReminderEmail(args: {
  to: string
  candidateFirstName: string | null
  candidateFullName: string
  documentLabel: string
  documentSubCategory?: string | null
  expiryDate: string
  daysLeft: ReminderWindow
}): Promise<CandidateReminderResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY manquant' }
  if (!args.to) return { ok: false, error: 'destinataire vide' }

  const docFull = args.documentSubCategory
    ? `${args.documentLabel}${args.documentLabel.toLowerCase().includes(args.documentSubCategory.toLowerCase()) ? '' : ' ' + args.documentSubCategory}`
    : args.documentLabel

  const urgency = args.daysLeft === 14 ? 'urgent' : 'normal'
  const emoji = args.daysLeft === 14 ? '⚠️' : '⏰'
  const subject = `${emoji} Votre ${docFull} arrive à échéance dans ${args.daysLeft} jours — L-Agence SA`

  const greeting = args.candidateFirstName
    ? `Bonjour ${escapeHtml(args.candidateFirstName)},`
    : 'Bonjour,'

  const expiryFormatted = formatExpiryDate(args.expiryDate)

  const pillBg = urgency === 'urgent' ? '#FED7AA' : '#FEF3C7'
  const pillFg = urgency === 'urgent' ? '#9A3412' : '#854D0E'
  const pillLabel = urgency === 'urgent' ? 'À renouveler rapidement' : 'Pensez à le renouveler'

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:24px;">
      <img src="https://www.talent-flow.ch/logo-agence-officiel-noir.png" alt="L-Agence" width="200" style="height:42px;width:auto;display:inline-block;border:0;" />
      <div style="font-size:9px;color:#6B7280;letter-spacing:1px;text-transform:uppercase;margin-top:2px;">Document à renouveler</div>
    </div>
    <div style="background:#fff;border:1px solid #E5E7EB;border-radius:14px;padding:28px 26px;box-shadow:0 4px 16px rgba(0,0,0,0.04);">
      <div style="display:inline-block;background:${pillBg};color:${pillFg};padding:5px 11px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:14px;">
        ${emoji} ${pillLabel}
      </div>
      <h1 style="font-family:Georgia,serif;font-size:22px;font-weight:400;color:#1C1A14;margin:0 0 14px;line-height:1.25;">
        ${greeting}
      </h1>
      <p style="font-size:14.5px;color:#374151;line-height:1.6;margin:0 0 18px;">
        Votre document <strong>${escapeHtml(docFull)}</strong> arrive à échéance dans <strong>${args.daysLeft} jours</strong>.
      </p>

      <div style="background:#FAFAF7;border:1px solid #E5E7EB;border-radius:10px;padding:14px 16px;margin:16px 0;font-size:13.5px;color:#1C1A14;line-height:1.7;">
        <strong>Document :</strong> ${escapeHtml(docFull)}<br>
        <strong>Date d'échéance :</strong> ${escapeHtml(expiryFormatted)}<br>
        <strong>Jours restants :</strong> ${args.daysLeft}
      </div>

      <p style="font-size:14px;color:#374151;line-height:1.6;margin:18px 0 8px;">
        Pensez à le <strong>renouveler dès que possible</strong>, puis à envoyer une copie de votre nouveau document à L-Agence SA pour mise à jour de votre dossier.
      </p>

      <div style="text-align:center;margin:24px 0 8px;">
        <a href="https://wa.me/41762979795"
           style="display:inline-block;background:#25D366;color:#fff;padding:12px 22px;border-radius:8px;font-size:13.5px;font-weight:700;text-decoration:none;margin-right:8px;">
          💬 Envoyer par WhatsApp
        </a>
        <a href="mailto:info@l-agence.ch?subject=${encodeURIComponent('Renouvellement ' + docFull + ' - ' + args.candidateFullName)}"
           style="display:inline-block;background:#EAB308;color:#1C1A14;padding:12px 22px;border-radius:8px;font-size:13.5px;font-weight:700;text-decoration:none;border:1px solid #1C1A14;">
          ✉️ Envoyer par email
        </a>
      </div>

      <p style="font-size:11.5px;color:#9CA3AF;line-height:1.5;margin:18px 0 0;text-align:center;">
        L-Agence SA · +41 24 552 18 70 · WhatsApp +41 76 297 97 95
      </p>
    </div>
    <p style="text-align:center;font-size:11px;color:#9CA3AF;margin-top:18px;">
      Email automatique — vous recevez ce message car votre document arrive bientôt à échéance.
    </p>
  </div>
</body></html>`

  const text = [
    greeting,
    '',
    `Votre document ${docFull} arrive à échéance dans ${args.daysLeft} jours.`,
    '',
    `Date d'échéance : ${expiryFormatted}`,
    '',
    'Pensez à le renouveler dès que possible, puis envoyez une copie à L-Agence SA :',
    '- WhatsApp : +41 76 297 97 95',
    '- Email : info@l-agence.ch',
    '- Téléphone : +41 24 552 18 70',
    '',
    '— L-Agence SA',
  ].join('\n')

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_DEFAULT, to: args.to, subject, html, text }),
    })
    if (!r.ok) {
      const err = await r.text().catch(() => `HTTP ${r.status}`)
      return { ok: false, error: err.slice(0, 200) }
    }
    const data = await r.json() as { id?: string }
    return { ok: true, id: data.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur réseau' }
  }
}

function escapeHtml(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
