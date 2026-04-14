// Accès direct sans mot de passe — DÉVELOPPEMENT LOCAL UNIQUEMENT
// Visite localhost:3002/admin → connecte l'admin et redirige vers /dashboard
// Bloqué en production (NODE_ENV !== 'development')

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const adminEmail = (process.env.ADMIN_EMAIL || 'j.barbosa@l-agence.ch').trim()
  const admin = createAdminClient()
  const origin = new URL(request.url).origin

  // 1. Générer un magic link pour obtenir le hashed_token
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: adminEmail,
  })

  if (linkError || !linkData?.properties?.hashed_token) {
    return NextResponse.json({ error: linkError?.message || 'Impossible de générer le lien' }, { status: 500 })
  }

  // 2. Vérifier le token côté serveur pour obtenir la session
  const { data: verifyData, error: verifyError } = await admin.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  })

  if (verifyError || !verifyData.session) {
    return NextResponse.json({ error: verifyError?.message || 'Impossible de créer la session' }, { status: 500 })
  }

  // 3. Setter les cookies de session via createServerClient
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  await supabase.auth.setSession({
    access_token: verifyData.session.access_token,
    refresh_token: verifyData.session.refresh_token,
  })

  return NextResponse.redirect(`${origin}/parametres/admin`)
}
