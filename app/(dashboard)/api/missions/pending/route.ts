// app/(dashboard)/api/missions/pending/route.ts
// GET — retourne les propositions en attente + historique ignoré

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const { data, error } = await (supabase as any)
      .from('missions_pending')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    const all = data ?? []
    const pending = all.filter((p: any) => p.validation === 'pending')
    const ignored = all.filter((p: any) => p.validation === 'ignored')

    return NextResponse.json({ pending, ignored, count: pending.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
