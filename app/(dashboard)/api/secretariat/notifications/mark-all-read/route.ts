// POST /api/secretariat/notifications/mark-all-read
// Marquer toutes les notifications non lues comme lues

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireSecretariatAccess } from '@/lib/auth-guard'

export const runtime = 'nodejs'

export async function POST(_request: NextRequest) {
  const accessError = await requireSecretariatAccess()
  if (accessError) return accessError

  try {
    const supabase = await createClient()

    const { error } = await (supabase as any)
      .from('secretariat_notifications')
      .update({ lue: true })
      .eq('lue', false)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
