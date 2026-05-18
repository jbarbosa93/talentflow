// POST /api/admin/portal-accounts/[id]/resend-invitation
// Génère un nouveau token invitation (TTL 7j), invalide les anciens, renvoie email
// Utilisé quand le compte n'est pas encore activé (password_set_at IS NULL)

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  generateOpaqueToken,
  INVITATION_TTL_DAYS,
} from '@/lib/portal-auth'
import { sendInvitationEmail } from '@/lib/emails/portal-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const { id } = await params
    const admin = createAdminClient()

    const { data: account } = await (admin as any)
      .from('portal_accounts')
      .select('id, email, account_type, is_revoked, password_set_at')
      .eq('id', id)
      .maybeSingle()

    if (!account) return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })
    if (account.is_revoked) return NextResponse.json({ error: 'Compte révoqué' }, { status: 403 })

    // Invalide les anciens tokens invitation non utilisés
    await (admin as any)
      .from('portal_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('account_id', account.id)
      .eq('purpose', 'invitation')
      .is('used_at', null)

    // Nouveau token invitation
    const token = generateOpaqueToken()
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 3600 * 1000).toISOString()
    await (admin as any).from('portal_tokens').insert({
      account_id: account.id,
      token,
      purpose: 'invitation',
      expires_at: expiresAt,
    })

    const emailResult = await sendInvitationEmail({
      to: account.email,
      accountType: account.account_type,
      token,
    })

    return NextResponse.json({
      ok: true,
      email_sent: emailResult.ok,
      email_error: emailResult.ok ? null : (emailResult as any).error,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
