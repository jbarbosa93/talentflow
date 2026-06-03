// GET /api/push/recipients — Liste les candidats ayant ≥1 appareil enregistré.
// v2.10.22 — Pour la page Notifications (choix des destinataires).

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const unauth = await requireAuth()
  if (unauth) return unauth

  const admin = createAdminClient()
  // Tokens liés à un candidat
  const { data: toks } = await (admin as any)
    .from('push_tokens')
    .select('candidate_id, platform')
    .not('candidate_id', 'is', null)

  const byCand = new Map<string, { count: number; platforms: Set<string> }>()
  for (const t of (toks || [])) {
    const cid = t.candidate_id as string
    if (!byCand.has(cid)) byCand.set(cid, { count: 0, platforms: new Set() })
    const e = byCand.get(cid)!
    e.count++
    if (t.platform) e.platforms.add(t.platform)
  }

  const ids = Array.from(byCand.keys())
  let names = new Map<string, { prenom: string | null; nom: string | null; photo_url: string | null }>()
  if (ids.length > 0) {
    const { data: cands } = await (admin as any)
      .from('candidats')
      .select('id, prenom, nom, photo_url')
      .in('id', ids)
    for (const c of (cands || [])) names.set(c.id, { prenom: c.prenom, nom: c.nom, photo_url: c.photo_url })
  }

  const recipients = ids.map(id => {
    const e = byCand.get(id)!
    const n = names.get(id)
    return {
      candidate_id: id,
      name: [n?.prenom, n?.nom].filter(Boolean).join(' ').trim() || 'Candidat',
      photo_url: n?.photo_url || null,
      devices: e.count,
      platforms: Array.from(e.platforms),
    }
  }).sort((a, b) => a.name.localeCompare(b.name, 'fr'))

  return NextResponse.json({ recipients })
}
