// TalentFlow Sign — Liste des tokens actifs d'une enveloppe (admin)
// v2.2.0 — Phase 4a-bis (WhatsApp send)
//
// Renvoie les tokens (UUID) avec recipient_email/name pour permettre :
// - Affichage des liens de signature dans l'admin
// - Envoi WhatsApp/copy du lien
// - Tracking signed_at / used_at par destinataire

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth()
  if (authError) return authError

  const { id } = await ctx.params
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('sign_tokens' as any)
    .select('id, token, recipient_email, recipient_name, expires_at, used_at, signed_at, created_at')
    .eq('envelope_id', id)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[sign/envelopes/tokens] error', error)
    return NextResponse.json({ error: 'Erreur récupération tokens' }, { status: 500 })
  }

  return NextResponse.json({ tokens: data || [] })
}
