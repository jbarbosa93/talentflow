// GET /api/offres/externes/count — Count offres à traiter (badge sidebar)
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'

export async function GET() {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const supabase = createAdminClient()
    const { count, error } = await (supabase as any)
      .from('offres_externes')
      .select('*', { count: 'exact', head: true })
      .eq('actif', true)
      .eq('statut', 'a_traiter')
      .eq('est_agence', false)

    if (error) return NextResponse.json({ count: 0 })
    return NextResponse.json({ count: count || 0 })
  } catch {
    return NextResponse.json({ count: 0 })
  }
}
