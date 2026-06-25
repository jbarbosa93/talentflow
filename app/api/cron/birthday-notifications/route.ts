// Cron quotidien — Anniversaires des candidats. v2.13.32
// Chaque matin, pour chaque candidat dont c'est l'anniversaire aujourd'hui :
//   1) Insère un MESSAGE IN-APP festif (modal + confettis) → s'affiche à l'ouverture
//      de l'app/du portail (pour TOUS les candidats, même sans l'app).
//   2) Envoie une NOTIFICATION PUSH à ses appareils (ceux qui ont activé les notifs).
// Auth : CRON_SECRET (Bearer) obligatoire.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToTokens } from '@/lib/push/fcm'

export const runtime = 'nodejs'
export const maxDuration = 60

const TITLE = (prenom: string) => (prenom ? `Joyeux anniversaire ${prenom} ! 🎂` : 'Joyeux anniversaire ! 🎂')
const BODY = 'Toute l’équipe L-Agence te souhaite une magnifique journée 🎉🥳'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const admin = createAdminClient()
  const today = new Date()
  const mmdd = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  // 1. Tous les candidats dont c'est l'anniversaire aujourd'hui (date_naissance AAAA-MM-JJ)
  const { data: cands } = await (admin as any)
    .from('candidats')
    .select('id, prenom, date_naissance')
    .not('date_naissance', 'is', null)
    .limit(10000)
  const birthdayCandidates = (cands || []).filter((c: any) => String(c.date_naissance || '').slice(5, 10) === mmdd)
  if (birthdayCandidates.length === 0) {
    return NextResponse.json({ ok: true, birthdays: 0, modals: 0, sent: 0 })
  }
  const bdayIds = birthdayCandidates.map((c: any) => c.id)

  // 2. Modal in-app festif — garde-fou anti-doublon : pas déjà créé aujourd'hui
  let modals = 0
  try {
    const todayStart = new Date(today); todayStart.setHours(0, 0, 0, 0)
    const { data: existing } = await (admin as any)
      .from('inapp_messages')
      .select('candidate_id')
      .in('candidate_id', bdayIds)
      .eq('animation', 'confetti')
      .gte('created_at', todayStart.toISOString())
    const already = new Set((existing || []).map((m: any) => m.candidate_id))
    const rows = birthdayCandidates
      .filter((c: any) => !already.has(c.id))
      .map((c: any) => ({
        candidate_id: c.id,
        title: TITLE((c.prenom || '').trim()),
        body: BODY,
        animation: 'confetti',
      }))
    if (rows.length > 0) {
      const { error } = await (admin as any).from('inapp_messages').insert(rows)
      if (!error) modals = rows.length
    }
  } catch { /* best-effort */ }

  // 3. Push aux appareils des candidats fêtés
  const { data: tokens } = await (admin as any)
    .from('push_tokens')
    .select('token, candidate_id')
    .in('candidate_id', bdayIds)
  let sent = 0
  const invalidTokens: string[] = []
  for (const c of birthdayCandidates) {
    const cTokens = (tokens || []).filter((t: any) => t.candidate_id === c.id).map((t: any) => t.token)
    if (cTokens.length === 0) continue
    const r = await sendPushToTokens(cTokens, TITLE((c.prenom || '').trim()), BODY, { type: 'birthday' })
    sent += r.sent
    invalidTokens.push(...r.invalidTokens)
  }
  if (invalidTokens.length > 0) {
    await (admin as any).from('push_tokens').delete().in('token', invalidTokens)
  }

  const result = { ok: true, birthdays: birthdayCandidates.length, modals, sent, purged: invalidTokens.length }
  console.log('[Cron Birthday]', JSON.stringify(result))
  return NextResponse.json(result)
}
