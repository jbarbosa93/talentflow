// TalentFlow Sign — Counts par section pour la mini-sidebar
// v2.2.1
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(_req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  const sb = createAdminClient()
  const { data, error } = await sb
    .from('sign_envelopes' as any)
    .select('status')
  if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })

  const rows = (data || []) as unknown as { status: string }[]
  const counts = {
    all: rows.length,
    in_progress: rows.filter(r => r.status === 'sent' || r.status === 'in_progress').length,
    completed: rows.filter(r => r.status === 'completed').length,
    draft: rows.filter(r => r.status === 'draft').length,
    expired_declined: rows.filter(r => r.status === 'expired' || r.status === 'declined' || r.status === 'cancelled').length,
  }
  return NextResponse.json({ counts })
}
