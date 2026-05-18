// POST /api/portal-auth/set-password
// Body: { token, password }
// - Vérifie le token (invitation OU reset)
// - Valide la force du mot de passe (8 chars min)
// - Hash + UPDATE portal_accounts (password_hash, password_set_at)
// - Marque le token used_at
// - Auto-connecte l'utilisateur (cookie JWT)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  hashPassword,
  signSession,
  cookieName,
  sessionCookieOptions,
} from '@/lib/portal-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const token: string = body.token || ''
    const password: string = body.password || ''

    if (!token) return NextResponse.json({ error: 'Token manquant' }, { status: 400 })
    if (password.length < 8) {
      return NextResponse.json({ error: 'Mot de passe trop court (8 caractères minimum)' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Lookup token
    const { data: tk } = await (admin as any)
      .from('portal_tokens')
      .select('id, account_id, purpose, expires_at, used_at')
      .eq('token', token)
      .maybeSingle()

    if (!tk) {
      return NextResponse.json({ error: 'Lien invalide ou déjà utilisé' }, { status: 410 })
    }
    if (tk.used_at) {
      return NextResponse.json({ error: 'Ce lien a déjà été utilisé' }, { status: 410 })
    }
    if (new Date(tk.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Ce lien a expiré' }, { status: 410 })
    }

    // Lookup compte
    const { data: account } = await (admin as any)
      .from('portal_accounts')
      .select('id, email, account_type, portal_id, report_link_id, is_revoked')
      .eq('id', tk.account_id)
      .maybeSingle()

    if (!account || account.is_revoked) {
      return NextResponse.json({ error: 'Compte introuvable ou révoqué' }, { status: 403 })
    }

    // Récupère le slug du portail ou rapport pour la redirection
    let targetSlug: string | null = null
    if (account.account_type === 'client' && account.portal_id) {
      const { data: portal } = await (admin as any)
        .from('client_portals').select('slug').eq('id', account.portal_id).maybeSingle()
      targetSlug = portal?.slug || null
    } else if (account.account_type === 'candidat' && account.report_link_id) {
      const { data: link } = await (admin as any)
        .from('report_links').select('slug').eq('id', account.report_link_id).maybeSingle()
      targetSlug = link?.slug || null
    }

    // Hash + update
    const hash = await hashPassword(password)
    const now = new Date().toISOString()
    const { error: updErr } = await (admin as any)
      .from('portal_accounts')
      .update({ password_hash: hash, password_set_at: now })
      .eq('id', account.id)
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 })
    }

    // Marque token used
    await (admin as any).from('portal_tokens').update({ used_at: now }).eq('id', tk.id)

    // Invalide les autres tokens encore valides pour ce compte (sécurité)
    await (admin as any)
      .from('portal_tokens')
      .update({ used_at: now })
      .eq('account_id', account.id)
      .is('used_at', null)

    // Auto-login
    const jwt = await signSession({
      accountId: account.id,
      accountType: account.account_type,
      email: account.email,
      portalId: account.portal_id,
      reportLinkId: account.report_link_id,
    })

    const res = NextResponse.json({
      ok: true,
      account: {
        id: account.id,
        email: account.email,
        accountType: account.account_type,
        portalId: account.portal_id,
        reportLinkId: account.report_link_id,
      },
      targetSlug,
    })
    res.cookies.set(cookieName(account.account_type), jwt, sessionCookieOptions())
    return res
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
