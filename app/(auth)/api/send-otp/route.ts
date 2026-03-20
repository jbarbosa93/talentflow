import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()
    if (!email) return NextResponse.json({ error: 'Email requis' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    // Store in DB
    await supabase.from('email_otps').upsert({ email, code, user_id: email, expires_at: expiresAt }, { onConflict: 'email' })

    // Send email via Resend if configured, otherwise log to console
    const RESEND_KEY = process.env.RESEND_API_KEY
    if (RESEND_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'TalentFlow <noreply@talent-flow.ch>',
          to: email,
          subject: 'Votre code de connexion TalentFlow',
          html: `<h2>Code de vérification</h2><p>Votre code : <strong style="font-size:24px;letter-spacing:4px">${code}</strong></p><p>Valide 10 minutes.</p>`,
        }),
      })
    } else {
      // Fallback: log to console (configure RESEND_API_KEY in production)
      console.log(`[2FA] Code OTP for ${email}: ${code}`)
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[2FA] Error:', e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { email, code } = await request.json()
    if (!email || !code) return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error } = await supabase
      .from('email_otps')
      .select('*')
      .eq('email', email)
      .eq('code', code)
      .maybeSingle()

    if (error || !data) return NextResponse.json({ valid: false, error: 'Code invalide ou expiré' }, { status: 400 })
    if (new Date(data.expires_at) < new Date()) {
      await supabase.from('email_otps').delete().eq('email', email)
      return NextResponse.json({ valid: false, error: 'Code expiré — demandez un nouveau code' }, { status: 400 })
    }

    await supabase.from('email_otps').delete().eq('email', email)
    return NextResponse.json({ valid: true })
  } catch (e) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
