import { NextRequest, NextResponse } from 'next/server'

const RESEND_API_KEY = process.env.RESEND_API_KEY

interface SendEmailPayload {
  to: string
  collaborateur: string
  entreprise: string
  semaine: number
  pdfBase64: string
}

export async function POST(req: NextRequest) {
  try {
    if (!RESEND_API_KEY) {
      return NextResponse.json({ error: 'RESEND_API_KEY non configuré' }, { status: 500 })
    }

    const body: SendEmailPayload = await req.json()
    const { to, collaborateur, entreprise, semaine, pdfBase64 } = body

    if (!to || !pdfBase64) {
      return NextResponse.json({ error: 'Paramètres manquants (to, pdfBase64)' }, { status: 400 })
    }

    const subject = `Rapport de travail — ${collaborateur || 'Collaborateur'} — Semaine ${semaine}`

    const html = `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; color: #111;">
        <div style="display: flex; align-items: center; margin-bottom: 24px;">
          <span style="font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">L-AGENCE</span>
          <span style="margin-left: 10px; font-size: 13px; color: #888;">Agence de placement</span>
        </div>

        <div style="background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 16px 20px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
          <p style="margin: 0; font-size: 14px; font-weight: 700; color: #92400E;">
            Rapport de travail — Semaine ${semaine}
          </p>
          ${collaborateur ? `<p style="margin: 6px 0 0; font-size: 13px; color: #78350F;">Collaborateur : <strong>${collaborateur}</strong></p>` : ''}
          ${entreprise ? `<p style="margin: 4px 0 0; font-size: 13px; color: #78350F;">Entreprise : <strong>${entreprise}</strong></p>` : ''}
        </div>

        <p style="font-size: 14px; line-height: 1.6; color: #444; margin: 0 0 16px;">
          Bonjour,
        </p>
        <p style="font-size: 14px; line-height: 1.6; color: #444; margin: 0 0 16px;">
          Veuillez trouver ci-joint le rapport de travail hebdomadaire${collaborateur ? ` de <strong>${collaborateur}</strong>` : ''} pour la semaine <strong>${semaine}</strong>.
        </p>
        <p style="font-size: 14px; line-height: 1.6; color: #444; margin: 0 0 32px;">
          Cordialement,<br/>
          <strong>L-AGENCE</strong>
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="font-size: 11px; color: #aaa; margin: 0; text-align: center;">
          Ce message a été généré automatiquement par TalentFlow · L-AGENCE Sàrl
        </p>
      </div>
    `

    const filename = `rapport-heures-semaine-${semaine}${collaborateur ? `-${collaborateur.replace(/\s+/g, '-')}` : ''}.pdf`

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'TalentFlow <noreply@talent-flow.ch>',
        to: [to],
        subject,
        html,
        attachments: [
          {
            filename,
            content: pdfBase64,
          },
        ],
      }),
    })

    if (!resendRes.ok) {
      const errBody = await resendRes.text()
      console.error('[rapport-heures/send-email] Resend error:', resendRes.status, errBody)
      return NextResponse.json({ error: `Erreur Resend: ${resendRes.status}` }, { status: 500 })
    }

    const resendData = await resendRes.json()
    console.log('[rapport-heures/send-email] Email envoyé, id:', resendData.id)

    return NextResponse.json({ success: true, id: resendData.id })
  } catch (e: any) {
    console.error('[rapport-heures/send-email] Error:', e)
    return NextResponse.json({ error: e.message || 'Erreur envoi email' }, { status: 500 })
  }
}
