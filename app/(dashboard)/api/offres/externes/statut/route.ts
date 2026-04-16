// PATCH /api/offres/externes/statut — Changer le statut d'une offre externe
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'

export async function PATCH(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const { id, statut } = await request.json()
    if (!id || !statut) return NextResponse.json({ error: 'id et statut requis' }, { status: 400 })

    const supabase = createAdminClient()
    const { error } = await (supabase as any)
      .from('offres_externes')
      .update({ statut })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
