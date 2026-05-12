// app/(dashboard)/api/secretariat/notifications/fin-alfa-actives/route.ts
// GET — alertes "fin ALFA caisse" non encore traitées (popup persistant)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireSecretariatAccess } from '@/lib/auth-guard'

export const runtime = 'nodejs'

export async function GET(_request: NextRequest) {
  const accessError = await requireSecretariatAccess()
  if (accessError) return accessError

  try {
    const supabase = await createClient()

    const { data, error } = await (supabase as any)
      .from('secretariat_notifications')
      .select('*')
      .eq('type', 'fin_alfa_caisse')
      .eq('traitee', false)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ alertes: data ?? [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
