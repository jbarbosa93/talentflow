// app/(dashboard)/api/secretariat/notifications/[id]/lu/route.ts
// PATCH — marquer une notification comme lue

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireSecretariatAccess } from '@/lib/auth-guard'

export const runtime = 'nodejs'

// PATCH /api/secretariat/notifications/[id]/lu — marquer lue = true
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessError = await requireSecretariatAccess()
  if (accessError) return accessError

  try {
    const supabase = await createClient()

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const { data, error } = await (supabase as any)
      .from('secretariat_notifications')
      .update({ lue: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ notification: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
