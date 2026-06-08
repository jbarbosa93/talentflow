// POST /api/admin/portal-accounts/[id]/invitation-link
// v2.9.80 — Retourne le LIEN d'invitation (set-password) d'un compte portail, SANS envoyer d'email.
// But : permettre de copier le lien pour l'envoyer autrement (WhatsApp, etc.).
// Réutilise un token invitation valide existant (ne casse pas le lien déjà envoyé par email) ;
// en génère un nouveau seulement si aucun n'est encore valable.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateOpaqueToken, INVITATION_TTL_DAYS } from '@/lib/portal-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// v2.10.47 — .trim() : la variable d'env contenait un retour à la ligne en trop
// → le lien devenait « talent-flow.ch\n/report/... » (cassé sur WhatsApp).
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.talent-flow.ch').trim()

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const { id } = await params
    const admin = createAdminClient()

    const { data: account } = await (admin as any)
      .from('portal_accounts')
      .select('id, email, account_type, is_revoked')
      .eq('id', id)
      .maybeSingle()

    if (!account) return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })
    if (account.is_revoked) return NextResponse.json({ error: 'Compte révoqué' }, { status: 403 })

    const nowIso = new Date().toISOString()

    // Cherche un token invitation encore valable (non utilisé + non expiré)
    const { data: existing } = await (admin as any)
      .from('portal_tokens')
      .select('token, expires_at')
      .eq('account_id', account.id)
      .eq('purpose', 'invitation')
      .is('used_at', null)
      .gt('expires_at', nowIso)
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let token: string = existing?.token
    if (!token) {
      // Aucun token valable → on en crée un nouveau (TTL 7j)
      token = generateOpaqueToken()
      const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 3600 * 1000).toISOString()
      await (admin as any).from('portal_tokens').insert({
        account_id: account.id,
        token,
        purpose: 'invitation',
        expires_at: expiresAt,
      })
    }

    const path = account.account_type === 'client' ? '/client-portal/set-password' : '/report/set-password'
    const link = `${APP_URL}${path}?token=${encodeURIComponent(token)}`

    return NextResponse.json({ ok: true, link })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
