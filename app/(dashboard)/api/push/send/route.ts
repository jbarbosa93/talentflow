// POST /api/push/send — Envoie une notif push à des candidats ciblés.
// v2.10.26 — Réservé aux consultants connectés (requireAuth).
// Body: { candidateIds, title, body, imageUrl?, inApp?, animation? }
//   - push : cherche les tokens des candidats → envoie → purge les tokens morts.
//   - inApp : crée aussi un message riche (modal + animation) affiché DANS l'app
//     à la prochaine ouverture du portail candidat (utile même sans push/appareil).

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
  const imageUrl = (typeof body.imageUrl === 'string' && /^https:\/\//.test(body.imageUrl)) ? body.imageUrl : undefined
  const inApp = body.inApp === true
  const ANIMATIONS = ['none', 'confetti', 'hearts', 'fireworks', 'snow', 'stars']
  const animation = ANIMATIONS.includes(body.animation) ? body.animation : 'none'

  if (!title || !text) {
    return NextResponse.json({ error: 'Titre et texte requis' }, { status: 400 })
  }
  if (candidateIds.length === 0) {
    return NextResponse.json({ error: 'Aucun candidat sélectionné' }, { status: 400 })
  }

  const admin = createAdminClient()

  // 1) Message riche in-app (modal + animation) — affiché à la prochaine ouverture
  //    de l'app, même si le candidat n'a pas d'appareil push enregistré.
  let inAppCount = 0
  if (inApp) {
    const rows = candidateIds.map(cid => ({ candidate_id: cid, title, body: text, image_url: imageUrl || null, animation }))
    const { error: insErr } = await (admin as any).from('inapp_messages').insert(rows)
    if (!insErr) inAppCount = rows.length
  }

  // 2) Push système (bannière + centre de notifications)
  const { data } = await (admin as any)
    .from('push_tokens')
    .select('token')
    .in('candidate_id', candidateIds)
  const tokens = Array.from(new Set((data || []).map((r: any) => r.token).filter(Boolean))) as string[]

  if (tokens.length === 0) {
    // Pas d'appareil : si on a au moins créé des modals in-app, c'est un succès.
    if (inAppCount > 0) {
      return NextResponse.json({ ok: true, candidats: candidateIds.length, appareils: 0, sent: 0, failed: 0, inApp: inAppCount })
    }
    return NextResponse.json({ ok: false, error: 'Aucun appareil enregistré pour ces candidats', sent: 0 }, { status: 200 })
  }

  const data2 = { inapp: inApp ? '1' : '0' } as Record<string, string>
  const res = await sendPushToTokens(tokens, title, text, data2, imageUrl)
  if (res.invalidTokens.length > 0) {
    await (admin as any).from('push_tokens').delete().in('token', res.invalidTokens)
  }
  return NextResponse.json({ ok: true, candidats: candidateIds.length, appareils: tokens.length, inApp: inAppCount, ...res })
}
