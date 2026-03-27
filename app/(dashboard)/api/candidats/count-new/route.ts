import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// Retourne les IDs des candidats créés/mis à jour dans les 30 derniers jours
// La sidebar calcule les non-vus en soustrayant le localStorage viewedSet
export async function GET() {
  try {
    const supabase = createAdminClient()
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const { data } = await supabase
      .from('candidats')
      .select('id')
      .gte('created_at', since)

    return NextResponse.json({ ids: (data || []).map((c: { id: string }) => c.id) })
  } catch {
    return NextResponse.json({ ids: [] })
  }
}
