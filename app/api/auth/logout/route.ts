// app/api/auth/logout/route.ts
// Logout serveur : efface les cookies httpOnly de session (le client JS ne peut pas le faire)
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )

  // Révoque le token sur le serveur Supabase ET efface les cookies côté serveur
  await supabase.auth.signOut({ scope: 'local' })

  const url = new URL('/login', request.url)
  const res = NextResponse.redirect(url, { status: 302 })
  // Supprimer le cookie de grâce OTP (forcer re-vérification au prochain login)
  res.cookies.set('talentflow_otp_grace', '', {
    httpOnly: true, secure: true, sameSite: 'strict', maxAge: 0, path: '/',
  })
  return res
}
