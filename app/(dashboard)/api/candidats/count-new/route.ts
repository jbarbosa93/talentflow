import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Retourne les candidats créés OU ré-importés dans les 30 derniers jours
// Le filtrage "vu/non vu" per-user se fait côté client via hasBadge (viewedSet + viewedAllAt + last_import_at)
export async function GET() {
  const authError = await requireAuth()
  if (authError) return authError
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const admin = createAdminClient()
    // Récents (badge classique) OU ré-importés récemment (badge mise à jour CV)
    const { data } = await (admin as any)
      .from('candidats')
      .select('id, import_status, created_at, last_import_at')
      .or(`created_at.gte.${thirtyDaysAgo},last_import_at.gte.${thirtyDaysAgo}`)

    return NextResponse.json({
      ids: (data || []).map((c: any) => ({
        id: c.id,
        import_status: c.import_status ?? 'traite',
        created_at: c.created_at,
        last_import_at: c.last_import_at ?? null,
      })),
    })
  } catch {
    return NextResponse.json({ ids: [] })
  }
}
