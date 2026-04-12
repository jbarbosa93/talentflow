// app/api/auth/forgot-password/route.ts
// Flow custom reset mot de passe : génère le lien via Supabase admin → envoie via Resend

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { emailResetPasswordHtml } from '@/lib/email-template'

export const runtime = 'nodejs'

const RESEND_API_KEY = process.env.RESEND_API_KEY!
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.talent-flow.ch'

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()
    if (!email) {
      return NextResponse.json({ error: 'Email requis' }, { status: 400 })
    }

    // Génère un lien de récupération via l'admin Supabase
    const supabase = createAdminClient()
    const { data, error } = await (supabase.auth.admin as any).generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: `${SITE_URL}/reset-password`,
      },
    })

    if (error) {
      // Ne pas révéler si l'email existe ou non (sécurité)
      console.error('[ForgotPassword] generateLink error:', error.message)
      return NextResponse.json({ success: true }) // réponse neutre
    }

    const resetLink = data?.properties?.action_link
    if (!resetLink) {
      return NextResponse.json({ success: true }) // réponse neutre
    }

    // Envoie l'email via Resend avec le beau template
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'TalentFlow <noreply@talent-flow.ch>',
        to: [email],
        subject: 'Réinitialisez votre mot de passe — TalentFlow',
        html: emailResetPasswordHtml(resetLink),
      }),
    })

    if (!resendRes.ok) {
      const errBody = await resendRes.text()
      console.error('[ForgotPassword] Resend error:', resendRes.status, errBody)
      return NextResponse.json({ error: 'Erreur envoi email' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('[ForgotPassword] Error:', e.message)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
