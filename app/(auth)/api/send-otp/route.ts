// OTP 2FA via nodemailer + Resend SMTP (fiable, indépendant de Supabase email)
// Code HMAC-SHA256 déterministe — pas de stockage DB nécessaire
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY!
const WINDOW_SECS = 10 * 60 // fenêtre de 10 minutes

function generateOTP(email: string, window: number): string {
  const hmac = crypto
    .createHmac('sha256', SECRET)
    .update(`${email.toLowerCase()}:${window}`)
    .digest('hex')
  return (parseInt(hmac.substring(0, 8), 16) % 900000 + 100000).toString()
}

function currentOTP(email: string): string {
  return generateOTP(email, Math.floor(Date.now() / 1000 / WINDOW_SECS))
}

function verifyOTP(email: string, otp: string): boolean {
  const w = Math.floor(Date.now() / 1000 / WINDOW_SECS)
  // Accepte la fenêtre courante ET la précédente (jusqu'à 20 min de validité)
  return otp === generateOTP(email, w) || otp === generateOTP(email, w - 1)
}

async function getTransporter() {
  const nodemailer = (await import('nodemailer')).default
  return nodemailer.createTransport({
    host: 'smtp.resend.com',
    port: 465,
    secure: true,
    auth: { user: 'resend', pass: process.env.RESEND_API_KEY },
  })
}

// POST — envoie le code OTP par email
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()
    if (!email) return NextResponse.json({ error: 'Email requis' }, { status: 400 })

    const otp = currentOTP(email)
    const transporter = await getTransporter()

    await transporter.sendMail({
      from: 'TalentFlow <noreply@talent-flow.ch>',
      to: email,
      subject: 'Votre code de connexion — TalentFlow',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h2 style="margin:0 0 8px">Code de connexion TalentFlow</h2>
          <p style="color:#666;margin:0 0 24px">Entrez ce code dans l'application pour vous connecter :</p>
          <div style="background:#f5f5f5;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
            <span style="font-size:40px;font-weight:700;letter-spacing:12px;font-family:monospace;color:#111">${otp}</span>
          </div>
          <p style="color:#999;font-size:13px;margin:0">Ce code expire dans 10 minutes. Ne le partagez avec personne.</p>
        </div>
      `,
    })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('[OTP] Erreur envoi:', e.message)
    return NextResponse.json({ error: 'Erreur envoi email OTP' }, { status: 500 })
  }
}

// PUT — vérifie le code OTP saisi par l'utilisateur
export async function PUT(request: NextRequest) {
  try {
    const { email, code } = await request.json()
    if (!email || !code) {
      return NextResponse.json({ valid: false, error: 'Paramètres manquants' }, { status: 400 })
    }

    if (!verifyOTP(email, code)) {
      return NextResponse.json(
        { valid: false, error: 'Code invalide ou expiré. Demandez un nouveau code.' },
        { status: 400 }
      )
    }

    return NextResponse.json({ valid: true })
  } catch (e) {
    return NextResponse.json({ valid: false, error: 'Erreur serveur' }, { status: 500 })
  }
}
