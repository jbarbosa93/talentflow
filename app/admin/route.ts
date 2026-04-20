// Accès direct sans mot de passe — DÉVELOPPEMENT LOCAL UNIQUEMENT
// Visite localhost:3001/admin → connecte ADMIN_EMAIL et redirige vers /dashboard
// Bloqué en production (NODE_ENV !== 'development')
//
// Fix HTTP 431 (v1.9.66) : purge de TOUS les cookies sb-* avant login.
//   Cause racine : verifyOtp pose une session JWT chunkée en sb-*-auth-token.0/.1/.2.
//   Chaque visite /admin empilait de nouveaux chunks sans nettoyer les anciens
//   → header Cookie dépasse la limite Next → 431.
//   La purge règle définitivement le problème.

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const adminEmail = (process.env.ADMIN_EMAIL || 'j.barbosa@l-agence.ch').trim()
  const origin = new URL(request.url).origin
  const cookieStore = await cookies()

  // 1. Purger toutes les vieilles sessions Supabase (chunked ou non)
  //    → fin du HTTP 431 hérité des anciennes sessions empilées.
  for (const c of cookieStore.getAll()) {
    if (c.name.startsWith('sb-')) {
      cookieStore.delete(c.name)
    }
  }

  // 2. Générer un magic link (côté admin, service role)
  const admin = createAdminClient()
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: adminEmail,
  })

  if (linkError || !linkData?.properties?.hashed_token) {
    return NextResponse.json(
      { error: linkError?.message || 'Impossible de générer le lien' },
      { status: 500 }
    )
  }

  // 3. Vérifier le token sur le server client → setAll persiste la session
  //    dans les cookies (response). Pas de split admin/supabase : un seul client
  //    pour signer ET persister.
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

  const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  })

  if (verifyError || !verifyData.session) {
    return NextResponse.json(
      { error: verifyError?.message || 'Impossible de créer la session' },
      { status: 500 }
    )
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}
