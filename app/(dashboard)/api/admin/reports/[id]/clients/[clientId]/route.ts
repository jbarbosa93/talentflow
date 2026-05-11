// TalentFlow Rapports — Suppression d'une entreprise autorisée (admin)
// v2.4.0 — Phase 1
// DELETE : hard delete. La FK ON DELETE SET NULL sur report_submissions
// préserve les soumissions historiques (report_link_client_id passe à NULL).

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

interface Ctx {
  params: Promise<{ id: string; clientId: string }>
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const authError = await requireAuth()
  if (authError) return authError

  const { id: linkId, clientId } = await ctx.params
  const supabase = createAdminClient()

  // Vérifie l'appartenance au lien (évite delete cross-lien)
  const { data: row } = await supabase
    .from('report_link_clients' as any)
    .select('id, link_id')
    .eq('id', clientId)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: 'Entreprise introuvable' }, { status: 404 })
  if ((row as any).link_id !== linkId) return NextResponse.json({ error: 'Mismatch link_id' }, { status: 400 })

  const { error } = await supabase
    .from('report_link_clients' as any)
    .delete()
    .eq('id', clientId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
