// POST /api/push/register — Enregistre le token push d'un appareil.
// v2.10.21
// Body: { token: string, platform?: 'ios'|'android'|'web' }
// Lie le token au compte portail connecté (cookie candidat OU client) si présent.
// Upsert sur le token (un appareil = un token unique).

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifySession, cookieName } from '@/lib/portal-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    const platform = ['ios', 'android', 'web'].includes(body.platform) ? body.platform : 'android'
    if (!token || token.length < 20) {
      return NextResponse.json({ error: 'token invalide' }, { status: 400 })
    }

    // Résout le compte portail connecté (candidat OU client) via le cookie.
    const jar = await cookies()
    let accountId: string | null = null
    let accountType: string | null = null
    for (const type of ['candidat', 'client'] as const) {
      const jwt = jar.get(cookieName(type))?.value
      if (!jwt) continue
      const session = await verifySession(jwt)
      if (session) { accountId = session.accountId; accountType = session.accountType; break }
    }

    const admin = createAdminClient()
    // Upsert : si le token existe déjà, on rafraîchit le lien + last_seen_at.
    const { error } = await (admin as any)
      .from('push_tokens')
      .upsert({
        token,
        platform,
        account_type: accountType,
        portal_account_id: accountId,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: 'token' })

    if (error) {
      console.error('[push/register] upsert', error)
      return NextResponse.json({ error: 'Erreur enregistrement' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, linked: !!accountId })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
