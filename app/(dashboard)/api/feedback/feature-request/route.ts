// TalentFlow — Endpoint feature requests (v2.8.0)
// Reçoit les demandes de features bloquées (cas 'unsupported' de l'assistant template).
// Persistées dans public.feature_requests pour consultation admin.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  const body = await req.json().catch(() => null) as null | {
    feature?: string
    context?: string
    userMessage?: string
  }
  if (!body?.feature || typeof body.feature !== 'string' || body.feature.length === 0) {
    return NextResponse.json({ error: 'feature manquante' }, { status: 400 })
  }
  if (body.feature.length > 2000) {
    return NextResponse.json({ error: 'feature trop longue (max 2000 caractères)' }, { status: 400 })
  }

  // Récupère user id pour audit
  const supabase = createAdminClient()
  const authHeader = req.headers.get('cookie') || ''
  // On utilise service role direct car requireAuth a déjà validé la session
  // Pour récupérer user id, on lit depuis le supabase server client
  const { createServerClient } = await import('@supabase/ssr')
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  const userClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => { /* read-only */ },
      },
    },
  )
  const { data: { user } } = await userClient.auth.getUser()

  const { error } = await supabase
    .from('feature_requests' as any)
    .insert({
      feature: body.feature.slice(0, 2000),
      context: body.context ? body.context.slice(0, 200) : null,
      user_message: body.userMessage ? body.userMessage.slice(0, 2000) : null,
      requested_by: user?.id || null,
    })

  if (error) {
    console.error('[feature-request] insert error', error)
    return NextResponse.json({ error: 'Erreur sauvegarde', details: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
