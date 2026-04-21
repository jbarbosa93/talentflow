// GET /api/messages/recent-contacts?candidat_ids=id1,id2,id3
// v1.9.68 — Pour chaque candidat_id donné, retourne le dernier contact (≤ 7 jours)
// tous canaux confondus (email/imessage/whatsapp/sms), TOUS users confondus
// (historique global team — RLS SELECT désormais en USING true).
//
// Utilisé par les 3 modals d'envoi pour afficher un warning informatif
// « ce candidat a été contacté il y a X jours par Y via Z ».
//
// Output :
// {
//   "<candidat_id>": {
//     canal: 'email' | 'imessage' | 'whatsapp' | 'sms',
//     by: string,        // user_name expéditeur
//     at: string,        // ISO timestamp
//     days_ago: number,  // arrondi
//     corps_extract: string,  // 120 premiers chars
//   }
// }

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'

const WINDOW_DAYS = 7

export async function GET(req: Request) {
  const authError = await requireAuth()
  if (authError) return authError

  const url = new URL(req.url)
  const raw = (url.searchParams.get('candidat_ids') || '').trim()
  if (!raw) return NextResponse.json({ contacts: {} })

  const ids = raw.split(',').map(s => s.trim()).filter(Boolean)
  if (ids.length === 0) return NextResponse.json({ contacts: {} })

  const supabase = await createClient()

  const sinceIso = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // Double requête : match sur candidat_id (classique) + match via candidat_ids[] JSONB (bulk).
  // On fusionne et on garde le plus récent par candidat_id.
  const [singleRes, bulkRes] = await Promise.all([
    supabase
      .from('emails_envoyes')
      .select('candidat_id, canal, user_name, created_at, corps')
      .in('candidat_id', ids)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('emails_envoyes')
      .select('candidat_ids, canal, user_name, created_at, corps')
      .overlaps('candidat_ids', ids)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(500),
  ])

  const latestPerCandidat = new Map<string, {
    canal: string
    by: string
    at: string
    days_ago: number
    corps_extract: string
  }>()

  const now = Date.now()

  const add = (candidatId: string | null | undefined, r: any) => {
    if (!candidatId || !ids.includes(candidatId)) return
    const existing = latestPerCandidat.get(candidatId)
    if (existing && new Date(existing.at).getTime() >= new Date(r.created_at).getTime()) return
    const ageMs = now - new Date(r.created_at).getTime()
    const daysAgo = Math.max(0, Math.floor(ageMs / (24 * 60 * 60 * 1000)))
    latestPerCandidat.set(candidatId, {
      canal: r.canal ?? 'email',
      by: r.user_name || 'Inconnu',
      at: r.created_at,
      days_ago: daysAgo,
      corps_extract: (r.corps ?? '').slice(0, 120),
    })
  }

  for (const r of (singleRes.data ?? []) as any[]) {
    add(r.candidat_id, r)
  }
  for (const r of (bulkRes.data ?? []) as any[]) {
    const arr: string[] = Array.isArray(r.candidat_ids) ? r.candidat_ids : []
    for (const cid of arr) {
      if (ids.includes(cid)) add(cid, r)
    }
  }

  const contacts: Record<string, any> = {}
  for (const [k, v] of latestPerCandidat) contacts[k] = v

  return NextResponse.json({ contacts, window_days: WINDOW_DAYS })
}
