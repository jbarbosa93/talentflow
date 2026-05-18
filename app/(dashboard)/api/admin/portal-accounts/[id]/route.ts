// PATCH /api/admin/portal-accounts/[id]
//   Body: { is_revoked: boolean }  → révoque / ré-active l'accès
// DELETE /api/admin/portal-accounts/[id]
//   → supprime le compte (CASCADE tokens)

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const admin = createAdminClient()
    const update: any = {}

    if (typeof body.is_revoked === 'boolean') {
      update.is_revoked = body.is_revoked
      if (body.is_revoked) {
        update.revoked_at = new Date().toISOString()
        update.revoked_by = user?.id || null
      } else {
        update.revoked_at = null
        update.revoked_by = null
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 })
    }

    const { data, error } = await (admin as any)
      .from('portal_accounts')
      .update(update)
      .eq('id', id)
      .select('id, email, is_revoked, revoked_at')
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })

    return NextResponse.json({ ok: true, account: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const { id } = await params
    const admin = createAdminClient()
    const { error } = await (admin as any).from('portal_accounts').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
