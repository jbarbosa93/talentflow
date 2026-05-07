// TalentFlow Sign — Proxy admin pour visualiser un PDF de template
// v2.2.0 — Phase 4a-bis-5
//
// Sert un PDF stocké dans Storage talentflow-sign/ pour les utilisateurs admin
// (utilisé par le preview wizard pour afficher les attachments). Force
// Content-Disposition: inline.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  const path = req.nextUrl.searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'path manquant' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: blob, error } = await supabase.storage
    .from('talentflow-sign')
    .download(path)
  if (error || !blob) {
    return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })
  }

  const buf = await blob.arrayBuffer()
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, max-age=300',
    },
  })
}
