// POST /api/push/test — Envoi d'une notif push de test depuis le serveur.
// v2.10.21 — Réservé aux consultants connectés (requireAuth).
// Body: { token: string, title?: string, body?: string }
//   - si token fourni → envoie à ce token
//   - sinon → envoie à TOUS les tokens enregistrés (test large)

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToToken, sendPushToTokens } from '@/lib/push/fcm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const unauth = await requireAuth()
  if (unauth) return unauth

  const body = await req.json().catch(() => ({}))
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  const title = (typeof body.title === 'string' && body.title.trim()) || 'TalentFlow'
  const text = (typeof body.body === 'string' && body.body.trim()) || 'Notification de test 🔔'

  if (token) {
    const r = await sendPushToToken(token, title, text)
    return NextResponse.json(r, { status: r.ok ? 200 : 500 })
  }

  // Pas de token → envoie à tous les tokens enregistrés
  const admin = createAdminClient()
  const { data } = await (admin as any).from('push_tokens').select('token').limit(500)
  const tokens = (data || []).map((r: any) => r.token).filter(Boolean)
  if (tokens.length === 0) {
    return NextResponse.json({ ok: false, error: 'Aucun token enregistré' }, { status: 404 })
  }
  const res = await sendPushToTokens(tokens, title, text)
  // Purge des tokens morts
  if (res.invalidTokens.length > 0) {
    await (admin as any).from('push_tokens').delete().in('token', res.invalidTokens)
  }
  return NextResponse.json({ ok: true, ...res })
}
