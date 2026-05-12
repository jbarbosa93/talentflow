// PATCH /api/candidats/[id]/driver-override
// Body: { is_driver_override: true | false | null }
// v2.5.0

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth()
  if (authError) return authError
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const v = body.is_driver_override
    const allowed = (v === true || v === false || v === null)
    if (!allowed) return NextResponse.json({ error: 'is_driver_override doit être true, false ou null' }, { status: 400 })

    const supabase = createAdminClient()
    const { error } = await (supabase as any)
      .from('candidats')
      .update({ is_driver_override: v })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, is_driver_override: v })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur serveur' }, { status: 500 })
  }
}
