// PATCH + DELETE /api/admin/client-portals/[id]
// v2.7.0

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supa = await createClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const updates: Record<string, any> = {}
    if (typeof body.is_active === 'boolean') updates.is_active = body.is_active
    if (typeof body.name === 'string') updates.name = body.name.trim().slice(0, 200)
    if (typeof body.auth_required === 'boolean') updates.auth_required = body.auth_required
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: true, noop: true })
    }

    const admin = createAdminClient()
    const { error } = await (admin as any)
      .from('client_portals')
      .update(updates)
      .eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supa = await createClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  try {
    const { id } = await params
    const admin = createAdminClient()
    const { error } = await (admin as any)
      .from('client_portals')
      .delete()
      .eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
