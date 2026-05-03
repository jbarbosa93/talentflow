// app/(dashboard)/api/candidats/mark-all-vu/route.ts
// POST — marque tous les candidats comme vus :
//   1. Supprime toutes les lignes individuelles de l'utilisateur dans candidats_vus
//   2. Pose le timestamp candidats_viewed_all_at dans user_metadata (cross-device)
//   3. v2.0.1 (16-B) — clear AUSSI les badges colorés OneDrive (onedrive_change_type=null)
//      pour que "Tout marquer vu" reset visuellement TOUT (badge rouge + badges colorés).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const authError = await requireAuth()
  if (authError) return authError
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 })

    const admin = createAdminClient()

    // Supprimer toutes les lignes individuelles (le timestamp suffit désormais)
    await (admin as any).from('candidats_vus').delete().eq('user_id', user.id)

    // v2.0.1 — Clear badges colorés OneDrive (Nouveau/Actualisé/Réactivé) sur TOUS les candidats.
    // Side-effect cross-user (la DB n'a pas de notion per-user pour ces colonnes) :
    // assumé acceptable car "Tout marquer vu" est une action volontaire qui reset l'état visuel global.
    await (admin as any)
      .from('candidats')
      .update({ onedrive_change_type: null, onedrive_change_at: null })
      .not('onedrive_change_type', 'is', null)

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
