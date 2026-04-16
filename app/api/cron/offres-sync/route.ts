// Cron offres-sync — appelé par Vercel toutes les 6h
// Délègue à /api/offres/sync (27 queries × 3 sources par défaut)

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(request: Request) {
  // Auth Vercel Cron
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.talent-flow.ch'

    const res = await fetch(`${baseUrl}/api/offres/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {}),
      },
      body: JSON.stringify({}), // pas de query = toutes les 27 par défaut
    })

    const data = await res.json()
    console.log('[Cron OffresSync]', JSON.stringify(data))
    return NextResponse.json({ success: res.ok, ...data })
  } catch (err: any) {
    console.error('[Cron OffresSync] Erreur:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
