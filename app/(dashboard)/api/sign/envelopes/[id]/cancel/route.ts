// TalentFlow Sign — Annulation d'une enveloppe (statut → 'cancelled')
// v2.2.1
//
// Marque l'enveloppe comme annulée + invalide tous ses tokens non utilisés.
// Ne supprime pas — la trace audit reste.
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent, extractIp } from '@/lib/sign/audit'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth()
  if (authError) return authError
  const { id } = await ctx.params
  const sb = createAdminClient()

  // Bascule le statut
  const { error: upErr } = await sb
    .from('sign_envelopes' as any)
    .update({ status: 'cancelled' })
    .eq('id', id)
    .in('status', ['draft', 'sent', 'in_progress'])
  if (upErr) return NextResponse.json({ error: 'Erreur annulation' }, { status: 500 })

  // Invalide les tokens (expire immédiate)
  const nowIso = new Date().toISOString()
  await sb
    .from('sign_tokens' as any)
    .update({ expires_at: nowIso })
    .eq('envelope_id', id)
    .is('signed_at', null)

  await logAuditEvent(id, 'cancelled' as any, {
    ip: extractIp(req),
  })

  return NextResponse.json({ ok: true })
}
