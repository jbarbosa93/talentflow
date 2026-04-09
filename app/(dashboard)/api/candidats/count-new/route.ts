import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Retourne les candidats créés dans les 30 derniers jours avec created_at
// Le filtrage "vu/non vu" se fait côté client via hasBadge (viewedSet + viewedAllAt)
export async function GET() {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const admin = createAdminClient()
    const { data } = await admin
      .from('candidats')
      .select('id, import_status, created_at')
      .gte('created_at', thirtyDaysAgo)

    return NextResponse.json({
      ids: (data || []).map((c: { id: string; import_status: string | null; created_at: string }) => ({
        id: c.id,
        import_status: c.import_status ?? 'traite',
        created_at: c.created_at,
      })),
    })
  } catch {
    return NextResponse.json({ ids: [] })
  }
}
