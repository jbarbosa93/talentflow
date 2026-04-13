// app/(dashboard)/api/candidats/vus/route.ts
// GET    — retourne les IDs vus par l'utilisateur courant + timestamp "tout vu"
// POST   — marque des IDs comme vus (body: { ids: string[] })
// PATCH  — migration : met à jour candidats_viewed_all_at dans user_metadata (body: { viewedAllAt: string })
// DELETE — marque des IDs comme non vus (body: { ids: string[] })

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const authError = await requireAuth()
  if (authError) return authError
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ viewedIds: [], viewedAllAt: null })

    const admin = createAdminClient()

    // IDs vus individuellement (cast as any — table créée manuellement, pas dans les types générés)
    const { data: rows } = await (admin as any)
      .from('candidats_vus')
      .select('candidat_id')
      .eq('user_id', user.id)

    // Timestamp "Tout marquer vu" depuis user_metadata
    const viewedAllAt = (user.user_metadata?.candidats_viewed_all_at as string) || null

    return NextResponse.json({
      viewedIds: (rows || []).map((r: { candidat_id: string }) => r.candidat_id),
      viewedAllAt,
    })
  } catch {
    return NextResponse.json({ viewedIds: [], viewedAllAt: null })
  }
}

export async function POST(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError
  try {
    const { ids } = await request.json() as { ids: string[] }
    if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ ok: true })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })

    const admin = createAdminClient()
    await (admin as any).from('candidats_vus').upsert(
      ids.map(id => ({ user_id: user.id, candidat_id: id })),
      { onConflict: 'user_id,candidat_id', ignoreDuplicates: true }
    )

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError
  try {
    const { viewedAllAt } = await request.json() as { viewedAllAt: string }
    if (!viewedAllAt) return NextResponse.json({ ok: false }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })

    const admin = createAdminClient()
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, candidats_viewed_all_at: viewedAllAt },
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError
  try {
    const { ids } = await request.json() as { ids: string[] }
    if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ ok: true })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })

    const admin = createAdminClient()
    await (admin as any)
      .from('candidats_vus')
      .delete()
      .eq('user_id', user.id)
      .in('candidat_id', ids)

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
