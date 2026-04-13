// POST /api/bug-report
// Envoie un signalement de bug par email à j.barbosa@l-agence.ch

import { NextRequest, NextResponse } from 'next/server'
import { emailWrapper } from '@/lib/email-template'

export const runtime = 'nodejs'

const DESTINATAIRE = 'j.barbosa@l-agence.ch'

const escHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

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
        html: emailWrapper(`
          <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#991B1B;letter-spacing:-0.3px">
            🐛 Bug signalé
          </h2>
          <p style="margin:0 0 24px;color:#6B7280;font-size:13px">${escHtml(dateHeure)}</p>

          <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:16px;margin-bottom:24px">
            <p style="margin:0;font-size:15px;color:#111827;line-height:1.6;white-space:pre-wrap">${escHtml(text)}</p>
          </div>

          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px 0;border-bottom:1px solid #E5E7EB;font-size:12px;font-weight:700;color:#6B7280;width:100px">Page</td><td style="padding:8px 0;border-bottom:1px solid #E5E7EB;font-size:13px;color:#111827">${escHtml(page || '—')}</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #E5E7EB;font-size:12px;font-weight:700;color:#6B7280">Version</td><td style="padding:8px 0;border-bottom:1px solid #E5E7EB;font-size:13px;color:#111827">${escHtml(version || '—')}</td></tr>
            <tr><td style="padding:8px 0;font-size:12px;font-weight:700;color:#6B7280">Navigateur</td><td style="padding:8px 0;font-size:11px;color:#6B7280">${escHtml(userAgent || '—')}</td></tr>
          </table>
        `),
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
