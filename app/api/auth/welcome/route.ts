import { NextRequest, NextResponse } from 'next/server'
import { emailWelcomeHtml } from '@/lib/email-template'

export async function POST(request: NextRequest) {
  try {
    const { email, prenom } = await request.json()
    if (!email) return NextResponse.json({ ok: true })

    const key = process.env.RESEND_API_KEY
    if (!key) return NextResponse.json({ ok: true })

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'TalentFlow <noreply@talent-flow.ch>',
        to: [email],
        subject: 'Votre compte TalentFlow est activé',
        html: emailWelcomeHtml(prenom || ''),
      }),
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true }) // Ne pas bloquer l'UX
  }
}
