// Accès direct sans mot de passe — DÉVELOPPEMENT LOCAL UNIQUEMENT
// Visite localhost:3001/admin → génère un magic link pour l'admin et redirige
// Bloqué en production (NODE_ENV !== 'development')

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const adminEmail = (process.env.ADMIN_EMAIL || 'j.barbosa@l-agence.ch').trim()
  const supabase = createAdminClient()
  const host = new URL(request.url).host // localhost:3001 ou localhost:3002 selon le serveur

  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: adminEmail,
    options: {
      redirectTo: `http://${host}/api/auth/callback?next=/dashboard`,
    },
  })

  if (error || !data?.properties?.action_link) {
    return NextResponse.json({ error: error?.message || 'Impossible de générer le lien' }, { status: 500 })
  }

  return NextResponse.redirect(data.properties.action_link)
}
