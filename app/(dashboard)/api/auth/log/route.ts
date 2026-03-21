// app/(dashboard)/api/auth/log/route.ts
// Enregistre les événements d'accès (connexion, déconnexion, échecs)
// POST /api/auth/log  { action, email, details? }

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

type LogAction =
  | 'login_success'
  | 'login_failed'
  | 'login_otp_sent'
  | 'login_otp_verified'
  | 'login_otp_failed'
  | 'logout'
  | 'session_timeout'

export async function POST(request: NextRequest) {
  try {
    const { action, email, details } = await request.json() as {
      action: LogAction
      email?: string
      details?: Record<string, unknown>
    }

    if (!action) return NextResponse.json({ error: 'action requise' }, { status: 400 })

    // Récupérer l'IP réelle (Vercel + Cloudflare)
    const ip =
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-real-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      'unknown'

    const userAgent = request.headers.get('user-agent') || 'unknown'

    const admin = createAdminClient()

    // Chercher l'user_id si email fourni
    let userId: string | null = null
    if (email) {
      const { data } = await admin.auth.admin.listUsers()
      const found = data?.users?.find(u => u.email === email)
      userId = found?.id || null
    }

    const { error } = await (admin as any).from('logs_acces').insert({
      user_id: userId,
      user_email: email || null,
      action,
      ip,
      user_agent: userAgent,
      details: details ?? undefined,
    })

    if (error) {
      console.error('[log/route] Supabase error:', error.message)
      // Ne pas faire échouer la requête si le log rate
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[log/route] Error:', e)
    return NextResponse.json({ ok: false })
  }
}
