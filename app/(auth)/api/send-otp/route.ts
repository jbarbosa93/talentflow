import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// POST: send OTP to email using Supabase's built-in OTP email system
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()
    if (!email) return NextResponse.json({ error: 'Email requis' }, { status: 400 })

    const supabase = supabaseAdmin()

    // Use Supabase's built-in OTP - this sends a 6-digit code via email
    // shouldCreateUser: false ensures it only works for existing users
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
      }
    })

    if (error) {
      console.error('[2FA OTP] Error sending OTP:', error.message)
      return NextResponse.json({ error: `Erreur envoi OTP: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[2FA OTP] Unexpected error:', e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// PUT: verify the OTP code
export async function PUT(request: NextRequest) {
  try {
    const { email, code } = await request.json()
    if (!email || !code) return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })

    const supabase = supabaseAdmin()

    // Verify the OTP using Supabase's built-in verification
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    })

    if (error || !data.user) {
      return NextResponse.json({ valid: false, error: 'Code invalide ou expiré. Demandez un nouveau code.' }, { status: 400 })
    }

    return NextResponse.json({ valid: true })
  } catch (e) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
