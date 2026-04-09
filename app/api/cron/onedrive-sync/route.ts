// Cron OneDrive — appelé par Vercel toutes les 10 min
// Délègue à /api/onedrive/sync qui contient toute la logique (smart update, SharePoint, etc.)

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(request: Request) {
  // Vérifier auth Vercel Cron
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.talent-flow.ch'
    const res = await fetch(`${baseUrl}/api/onedrive/sync`, {
      method: 'POST',
      headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
    })
    const data = await res.json()

    console.log('[Cron OneDrive]', JSON.stringify(data))
    return NextResponse.json(data)
  } catch (err) {
    console.error('[Cron OneDrive] Erreur:', err)
    return NextResponse.json({ error: 'Erreur cron' }, { status: 500 })
  }
}
