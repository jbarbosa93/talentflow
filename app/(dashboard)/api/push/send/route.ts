// POST /api/push/send — Envoie une notif push à des candidats ciblés.
// v2.10.22 — Réservé aux consultants connectés (requireAuth).
// Body: { candidateIds: string[], title: string, body: string }
//   - cherche les tokens des candidats → envoie → purge les tokens morts.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToTokens } from '@/lib/push/fcm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const unauth = await requireAuth()
  if (unauth) return unauth

  const body = await req.json().catch(() => ({}))
  const candidateIds: string[] = Array.isArray(body.candidateIds) ? body.candidateIds.filter((x: any) => typeof x === 'string') : []
  const title = (typeof body.title === 'string' && body.title.trim()) || ''
  const text = (typeof body.body === 'string' && body.body.trim()) || ''

  if (!title || !text) {
    return NextResponse.json({ error: 'Titre et texte requis' }, { status: 400 })
  }
  if (candidateIds.length === 0) {
    return NextResponse.json({ error: 'Aucun candidat sélectionné' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data } = await (admin as any)
    .from('push_tokens')
    .select('token')
    .in('candidate_id', candidateIds)
  const tokens = Array.from(new Set((data || []).map((r: any) => r.token).filter(Boolean))) as string[]

  if (tokens.length === 0) {
    return NextResponse.json({ ok: false, error: 'Aucun appareil enregistré pour ces candidats', sent: 0 }, { status: 200 })
  }

  const res = await sendPushToTokens(tokens, title, text)
  if (res.invalidTokens.length > 0) {
    await (admin as any).from('push_tokens').delete().in('token', res.invalidTokens)
  }
  return NextResponse.json({ ok: true, candidats: candidateIds.length, appareils: tokens.length, ...res })
}
