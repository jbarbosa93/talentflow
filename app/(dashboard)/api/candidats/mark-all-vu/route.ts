// app/(dashboard)/api/candidats/mark-all-vu/route.ts
// POST — marque tous les candidats comme vus :
//   1. Supprime toutes les lignes individuelles de l'utilisateur dans candidats_vus
//   2. Pose le timestamp candidats_viewed_all_at dans user_metadata (cross-device)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 })

    const admin = createAdminClient()

    // Supprimer toutes les lignes individuelles (le timestamp suffit désormais)
    await (admin as any).from('candidats_vus').delete().eq('user_id', user.id)

    // Poser le timestamp — tous les candidats créés AVANT sont considérés vus
    const { error } = await supabase.auth.updateUser({
      data: { candidats_viewed_all_at: new Date().toISOString() },
    })

    if (error) return NextResponse.json({ ok: false, error: 'Erreur serveur' }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false, error: 'Erreur serveur' }, { status: 500 })
  }
}
