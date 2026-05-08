// TalentFlow Sign — Relance d'une enveloppe expirée/refusée
// v2.2.1
//
// Recrée des tokens (les anciens sont invalides) + bascule status à 'sent' +
// envoie l'email au 1er signer (workflow séquentiel).
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { generateTokensForEnvelope } from '@/lib/sign/tokens'
import { dispatchInvite } from '@/lib/sign/sequential'
import { logAuditEvent, extractIp } from '@/lib/sign/audit'
import type { SignEnvelope, SignRecipient } from '@/lib/sign/types'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth()
  if (authError) return authError
  const { id } = await ctx.params
  const sb = createAdminClient()

  const { data: env, error } = await sb
    .from('sign_envelopes' as any)
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error || !env) return NextResponse.json({ error: 'Enveloppe introuvable' }, { status: 404 })
  const envelope = env as unknown as SignEnvelope

  // Réinitialise les statuts des destinataires non signés
  const resetRecipients = envelope.recipients.map(r => ({
    ...r,
    status: r.status === 'signed' ? r.status : 'pending' as const,
  })) as SignRecipient[]

  await sb
    .from('sign_envelopes' as any)
    .update({
      status: 'sent',
      recipients: resetRecipients,
      sent_at: new Date().toISOString(),
    })
    .eq('id', id)

  // Génère token pour le 1er signer non encore signé (workflow séquentiel)
  const sortedSigners = resetRecipients
    .filter(r => r.role !== 'cc' && r.status !== 'signed')
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const firstPending = sortedSigners[0]
  if (!firstPending) {
    return NextResponse.json({ ok: true, note: 'Tous les signers ont déjà signé' })
  }

  const ttlDays = (envelope as unknown as { expires_in_days?: number | null }).expires_in_days || undefined
  const tokens = await generateTokensForEnvelope(id, [firstPending], ttlDays || undefined)

  // Récup info expéditeur
  const server = await createServerClient()
  const { data: { user } } = await server.auth.getUser()
  const meta = (user?.user_metadata as { entreprise?: string } | null) || null
  const senderName = meta?.entreprise?.trim() || 'L-Agence SA'
  const senderEmail = user?.email || undefined

  let dispatchMeta: unknown = undefined
  if (tokens[0]) {
    const tok = tokens[0]
    const dispatch = await dispatchInvite({
      envelope,
      recipient: firstPending,
      token: tok,
      sender: { name: senderName, email: senderEmail },
    })
    dispatchMeta = dispatch
  }

  await logAuditEvent(id, 'sent', {
    ip: extractIp(req),
    recipientEmail: firstPending.email,
    metadata: {
      triggered_by: 'relaunch',
      channel: envelope.delivery_channel || 'email',
      dispatch: dispatchMeta,
    },
  })

  return NextResponse.json({ ok: true, tokensCreated: tokens.length })
}
