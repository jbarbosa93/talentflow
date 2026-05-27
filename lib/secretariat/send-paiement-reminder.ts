// TalentFlow — Email rappel J-2 versement de salaire
// v2.6.6 — Envoyé par /api/cron/paiement-rappel-heures
// Logo officiel L-Agence obligatoire (règle dure CLAUDE.md)

export type PaiementMode = 'calendrier_mensuel' | 'mensuel' | 'hebdomadaire'

export interface SendPaiementReminderArgs {
  to: string
  prenom: string
  nom: string
  mode: PaiementMode
  datePaiement: string  // ISO YYYY-MM-DD
  libellePeriode: string
}

export interface SendPaiementReminderResult {
  ok: boolean
  id?: string
  error?: string
}

const FROM = 'L-Agence SA <noreply@talent-flow.ch>'
const REPLY_TO = 'info@l-agence.ch'

const MODE_LABEL: Record<PaiementMode, string> = {
  calendrier_mensuel: 'Calendrier mensuel (décalé)',
  mensuel: 'Mensuel',
  hebdomadaire: 'Hebdomadaire',
}

const MODE_COLOR: Record<PaiementMode, string> = {
  calendrier_mensuel: '#DC2626',
  mensuel: '#059669',
  hebdomadaire: '#2563EB',
}

function formatDateFr(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('fr-CH', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export async function sendPaiementReminder(args: SendPaiementReminderArgs): Promise<SendPaiementReminderResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY manquant' }
  if (!args.to) return { ok: false, error: 'destinataire vide' }

  const prenomEsc = escapeHtml(args.prenom || '')
  const dateFr = formatDateFr(args.datePaiement)
  const modeLabel = MODE_LABEL[args.mode]
  const modeColor = MODE_COLOR[args.mode]
  const periodeEsc = escapeHtml(args.libellePeriode || '')

  const subject = `💰 Versement prévu le ${dateFr}`

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0; padding:0; background:#F5F5F4; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif; color:#1F2937;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#F5F5F4; padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
          <tr>
            <td style="padding:32px 32px 16px; text-align:center;">
              <img src="https://www.talent-flow.ch/logo-agence-officiel-noir.png" width="200" style="height:42px; display:inline-block;" alt="L-Agence SA">
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 4px;">
              <div style="display:inline-block; padding:6px 14px; border-radius:99px; background:${modeColor}15; color:${modeColor}; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.08em;">
                ${escapeHtml(modeLabel)}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 8px;">
              <h1 style="margin:0; font-size:26px; font-weight:700; color:#111827; line-height:1.2;">
                💰 Versement prévu le ${dateFr}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 8px; font-size:15px; line-height:1.6; color:#374151;">
              <p style="margin:0 0 14px;">Bonjour <strong>${prenomEsc}</strong>,</p>
              <p style="margin:0 0 14px;">
                Nous vous informons que votre salaire sera versé le
                <strong style="color:${modeColor};">${dateFr}</strong>.
              </p>
              <p style="margin:0 0 14px;">
                Si vos <strong>rapports d'heures</strong> ne sont pas encore transmis pour la période concernée
                <em>(${periodeEsc})</em>, merci de nous les envoyer <strong>dans les meilleurs délais</strong>
                afin de garantir le paiement à la date prévue.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 8px;" align="center">
              <a href="https://wa.me/41762979795?text=${encodeURIComponent(`Bonjour L-Agence, voici mes rapports d'heures pour la période : ${args.libellePeriode}`)}"
                style="display:inline-block; padding:14px 28px; border-radius:10px; background:#25D366; color:#ffffff; font-size:15px; font-weight:700; text-decoration:none; box-shadow:0 2px 6px rgba(37,211,102,0.35);">
                <span style="font-size:18px; vertical-align:middle;">📱</span>
                <span style="vertical-align:middle; margin-left:6px;">Envoyer mes heures par WhatsApp</span>
              </a>
              <div style="margin-top:8px; font-size:12px; color:#6B7280;">
                Ou par appel/SMS au <a href="tel:+41762979795" style="color:#6B7280; text-decoration:none; font-weight:600;">+41 76 297 97 95</a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 24px;">
              <div style="padding:14px 16px; border-radius:10px; background:#FEF3C7; border-left:4px solid #F59E0B; font-size:13px; color:#78350F; line-height:1.5;">
                ⚠️ Si vos rapports d'heures sont reçus après la date limite, le paiement sera reporté au cycle suivant.
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 32px; font-size:14px; color:#6B7280; line-height:1.6;">
              <p style="margin:0 0 4px;">Cordialement,</p>
              <p style="margin:0; font-weight:700; color:#111827;">L-Agence SA</p>
              <p style="margin:4px 0 0; font-size:12px; color:#9CA3AF;">
                Avenue de la Gare 24, 1870 Monthey · <a href="mailto:info@l-agence.ch" style="color:#6B7280; text-decoration:none;">info@l-agence.ch</a>
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:16px auto 0; max-width:560px; font-size:11px; color:#9CA3AF; text-align:center; line-height:1.5;">
          Cet email est une notification automatique liée à votre mode de paiement.<br>
          Si vous pensez l'avoir reçu par erreur, merci de contacter L-Agence.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: FROM,
        to: [args.to],
        reply_to: REPLY_TO,
        subject,
        html,
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      return { ok: false, error: `Resend ${res.status}: ${text.slice(0, 200)}` }
    }
    const data = await res.json()
    return { ok: true, id: data?.id }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}
