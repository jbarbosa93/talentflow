// app/api/auth/password-changed/route.ts
// Envoie un email de confirmation après changement de mot de passe via Resend
import { NextRequest, NextResponse } from 'next/server'
import { emailPasswordChangedHtml } from '@/lib/email-template'

export const runtime = 'nodejs'

const RESEND_API_KEY = process.env.RESEND_API_KEY!

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()
    if (!email) {
      return NextResponse.json({ error: 'Email requis' }, { status: 400 })
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'TalentFlow <noreply@talent-flow.ch>',
        to: [email],
        subject: 'Votre mot de passe a été modifié — TalentFlow',
        html: emailPasswordChangedHtml(),
      }),
    })

    if (!resendRes.ok) {
      const errBody = await resendRes.text()
      console.error('[PasswordChanged] Resend error:', resendRes.status, errBody)
      return NextResponse.json({ error: 'Erreur envoi email' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('[PasswordChanged] Error:', e.message)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
