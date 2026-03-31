import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Retourne les IDs des candidats créés dans les 30 derniers jours
// Le filtrage "vu/non vu" se fait côté client via localStorage (source unique de vérité)
// "Tout marquer vu" ajoute tous les IDs au localStorage → badge = 0
export async function GET() {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const admin = createAdminClient()
    const { data } = await admin
      .from('candidats')
      .select('id')
      .gte('created_at', thirtyDaysAgo)

    return NextResponse.json({ ids: (data || []).map((c: { id: string }) => c.id) })
  } catch {
    return NextResponse.json({ ids: [] })
  }
}
