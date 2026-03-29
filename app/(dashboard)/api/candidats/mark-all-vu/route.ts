import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Persiste le timestamp "Tout marquer vu" dans user_metadata (cross-device)
export async function POST() {
  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.updateUser({
      data: { candidats_viewed_all_at: new Date().toISOString() },
    })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
