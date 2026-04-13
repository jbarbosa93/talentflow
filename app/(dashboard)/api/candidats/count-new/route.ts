import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Retourne les candidats créés dans les 30 derniers jours OU avec has_update=true
// Le filtrage "vu/non vu" se fait côté client via hasBadge (viewedSet + viewedAllAt + has_update)
export async function GET() {
  const authError = await requireAuth()
  if (authError) return authError
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const admin = createAdminClient()
    // Récupérer : récents (badge classique) OU has_update=true (badge mise à jour CV)
    const { data } = await (admin as any)
      .from('candidats')
      .select('id, import_status, created_at, has_update')
      .or(`created_at.gte.${thirtyDaysAgo},has_update.eq.true`)

    return NextResponse.json({
      ids: (data || []).map((c: any) => ({
        id: c.id,
        import_status: c.import_status ?? 'traite',
        created_at: c.created_at,
        has_update: c.has_update ?? false,
      })),
    })
  } catch {
    return NextResponse.json({ ids: [] })
  }
}
