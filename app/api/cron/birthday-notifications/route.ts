// Cron quotidien — Notifications d'anniversaire aux candidats. v2.13.31
// Chaque matin : pour chaque candidat dont c'est l'anniversaire aujourd'hui ET qui a
// un appareil avec notifications activées (push_tokens), envoie un « Joyeux anniversaire ».
// Auth : CRON_SECRET (Bearer) obligatoire.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToTokens } from '@/lib/push/fcm'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Tokens push rattachés à un candidat (ceux qui ont l'app + notifs activées)
  const { data: tokens } = await (admin as any)
    .from('push_tokens')
    .select('token, candidate_id')
    .not('candidate_id', 'is', null)
  if (!tokens || tokens.length === 0) {
    return NextResponse.json({ ok: true, birthdays: 0, sent: 0, note: 'aucun appareil enregistré' })
  }

  const candidateIds = Array.from(new Set(tokens.map((t: any) => t.candidate_id)))
  const { data: cands } = await (admin as any)
    .from('candidats')
    .select('id, prenom, date_naissance')
    .in('id', candidateIds)
    .not('date_naissance', 'is', null)

  // Anniversaire = même mois-jour qu'aujourd'hui (date_naissance au format AAAA-MM-JJ)
  const today = new Date()
  const mmdd = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const birthdayCandidates = (cands || []).filter((c: any) => String(c.date_naissance || '').slice(5, 10) === mmdd)

  let sent = 0
  const invalidTokens: string[] = []
  for (const c of birthdayCandidates) {
    const cTokens = tokens.filter((t: any) => t.candidate_id === c.id).map((t: any) => t.token)
    if (cTokens.length === 0) continue
    const prenom = (c.prenom || '').trim()
    const title = prenom ? `Joyeux anniversaire ${prenom} ! 🎂` : 'Joyeux anniversaire ! 🎂'
    const body = 'Toute l’équipe L-Agence te souhaite une magnifique journée 🎉🥳'
    const r = await sendPushToTokens(cTokens, title, body, { type: 'birthday' })
    sent += r.sent
    invalidTokens.push(...r.invalidTokens)
  }

  // Purge des tokens morts/désinscrits
  if (invalidTokens.length > 0) {
    await (admin as any).from('push_tokens').delete().in('token', invalidTokens)
  }

  const result = { ok: true, birthdays: birthdayCandidates.length, sent, purged: invalidTokens.length }
  console.log('[Cron Birthday]', JSON.stringify(result))
  return NextResponse.json(result)
}
