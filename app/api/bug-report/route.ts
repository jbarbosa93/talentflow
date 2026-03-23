// POST /api/bug-report
// Envoie un signalement de bug par email à j.barbosa@l-agence.ch

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const DESTINATAIRE = 'j.barbosa@l-agence.ch'

export async function POST(request: NextRequest) {
  try {
    const { text, date, version, page, userAgent } = await request.json()

    if (!text?.trim()) {
      return NextResponse.json({ error: 'Description manquante.' }, { status: 400 })
    }

    const dateHeure = new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Paris',
    }).format(new Date(date || Date.now()))

    // Envoi email via SMTP
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      const nodemailer = await import('nodemailer')
      const transporter = nodemailer.default.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      })

      await transporter.sendMail({
        from: `"TalentFlow Bug Report" <${process.env.SMTP_USER}>`,
        to: DESTINATAIRE,
        subject: `🐛 Bug signalé — ${page || 'page inconnue'} (${version || '?'})`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #FFFDF5; border: 2px solid #1C1A14; border-radius: 12px; overflow: hidden;">
            <div style="background: #DC2626; padding: 24px 28px; border-bottom: 2px solid #1C1A14;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 900; color: white;">🐛 Bug signalé sur TalentFlow</h1>
              <p style="margin: 4px 0 0; font-size: 13px; color: rgba(255,255,255,0.8);">${dateHeure}</p>
            </div>
            <div style="padding: 28px;">
              <div style="padding: 16px; background: #FEF2F2; border: 1.5px solid #FECACA; border-radius: 8px; margin-bottom: 20px;">
                <p style="margin: 0; font-size: 15px; color: #1C1A14; line-height: 1.6; white-space: pre-wrap;">${text}</p>
              </div>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; border-bottom: 1px solid #E8E4D4; font-size: 12px; font-weight: 700; color: #6B6B5B; width: 100px;">Page</td><td style="padding: 8px 0; border-bottom: 1px solid #E8E4D4; font-size: 13px; color: #1C1A14;">${page || '—'}</td></tr>
                <tr><td style="padding: 8px 0; border-bottom: 1px solid #E8E4D4; font-size: 12px; font-weight: 700; color: #6B6B5B;">Version</td><td style="padding: 8px 0; border-bottom: 1px solid #E8E4D4; font-size: 13px; color: #1C1A14;">${version || '—'}</td></tr>
                <tr><td style="padding: 8px 0; font-size: 12px; font-weight: 700; color: #6B6B5B;">Navigateur</td><td style="padding: 8px 0; font-size: 11px; color: #6B6B5B;">${userAgent || '—'}</td></tr>
              </table>
            </div>
          </div>`,
        text: `Bug signalé\n\n${text}\n\nPage: ${page}\nVersion: ${version}\nDate: ${dateHeure}\nNavigateur: ${userAgent}`,
      })

      console.log(`[Bug Report] Email envoyé à ${DESTINATAIRE}`)
    } else {
      console.warn('[Bug Report] SMTP non configuré — bug non envoyé par email')
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Bug Report] Erreur:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
