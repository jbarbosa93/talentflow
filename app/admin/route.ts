// Accès direct sans saisie — DÉVELOPPEMENT LOCAL UNIQUEMENT
// Visite localhost:3001/admin → connecte automatiquement et redirige vers le dashboard
// Nécessite DEV_ADMIN_EMAIL + DEV_ADMIN_PASSWORD dans .env.local
// Bloqué en production (NODE_ENV !== 'development')

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const email = process.env.DEV_ADMIN_EMAIL
  const password = process.env.DEV_ADMIN_PASSWORD

  if (!email || !password) {
    return NextResponse.json(
      { error: 'DEV_ADMIN_EMAIL et DEV_ADMIN_PASSWORD manquants dans .env.local' },
      { status: 500 }
    )
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }

  return NextResponse.redirect(new URL('/dashboard', 'http://localhost:3001'))
}
