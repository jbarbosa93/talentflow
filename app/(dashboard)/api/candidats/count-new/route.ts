import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Retourne les IDs des candidats créés dans les 30 derniers jours
// Filtre automatiquement par candidats_viewed_all_at (persisté dans user metadata cross-device)
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const viewedAllAt: string | undefined = user?.user_metadata?.candidats_viewed_all_at

    // Si l'utilisateur a cliqué "Tout marquer vu" plus récemment que 30j, utiliser cette date
    const effectiveSince = (viewedAllAt && viewedAllAt > thirtyDaysAgo)
      ? viewedAllAt
      : thirtyDaysAgo

    const admin = createAdminClient()
    const { data } = await admin
      .from('candidats')
      .select('id')
      .gte('created_at', effectiveSince)

    return NextResponse.json({ ids: (data || []).map((c: { id: string }) => c.id) })
  } catch {
    return NextResponse.json({ ids: [] })
  }
}
