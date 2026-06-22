// POST /api/portal-auth/login — Login portail client OU rapports candidat
// Body: { email, password, accountType: 'client'|'candidat', slug?: string }
// - `slug` optionnel : si fourni, résout en portal_id/report_link_id pour disambiguer
//   (cas où un même email a accès à plusieurs portails)
// - Rate-limit : 5 tentatives échouées par IP / 15 min → 429

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  verifyPassword,
  signSession,
  cookieName,
  sessionCookieOptions,
  checkRateLimit,
  logLoginAttempt,
  extractIp,
  normalizeEmail,
  isValidEmail,
  type AccountType,
} from '@/lib/portal-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ip = extractIp(req.headers)

  try {
    const body = await req.json().catch(() => ({}))
    const email = normalizeEmail(body.email)
    const password: string = body.password || ''
    const accountType: AccountType = body.accountType === 'candidat' ? 'candidat' : 'client'
    const slug: string | undefined = body.slug

    if (!isValidEmail(email) || !password) {
      return NextResponse.json({ error: 'Email ou mot de passe invalide' }, { status: 400 })
    }

    // Rate-limit (5 fails / IP / 15 min)
    const rl = await checkRateLimit(ip)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Trop de tentatives, réessayez dans ${rl.remainingMinutes} minutes` },
        { status: 429 },
      )
    }

    const admin = createAdminClient()

    // Résolution slug → portal_id ou report_link_id
    let portalId: string | null = null
    let reportLinkId: string | null = null
    if (slug) {
      if (accountType === 'client') {
        const { data: portal } = await (admin as any)
          .from('client_portals')
          .select('id, is_active')
          .eq('slug', slug)
          .maybeSingle()
        if (!portal || !portal.is_active) {
          await logLoginAttempt(ip, email, false)
          return NextResponse.json({ error: 'Portail introuvable' }, { status: 404 })
        }
        portalId = portal.id
      } else {
        const { data: link } = await (admin as any)
          .from('report_links')
          .select('id, status')
          .eq('slug', slug)
          .maybeSingle()
        if (!link || link.status !== 'active') {
          await logLoginAttempt(ip, email, false)
          return NextResponse.json({ error: 'Lien rapport introuvable' }, { status: 404 })
        }
        reportLinkId = link.id
      }
    }

    // Lookup compte
    let query = (admin as any)
      .from('portal_accounts')
      .select('id, email, password_hash, account_type, portal_id, report_link_id, is_revoked, password_set_at')
      .eq('email', email)
      .eq('account_type', accountType)
    if (portalId) query = query.eq('portal_id', portalId)
    if (reportLinkId) query = query.eq('report_link_id', reportLinkId)

    const { data: accounts } = await query

    if (!accounts || accounts.length === 0) {
      await logLoginAttempt(ip, email, false)
      return NextResponse.json({ error: 'Email ou mot de passe incorrect' }, { status: 401 })
    }

    if (accounts.length > 1 && !slug) {
      // Ambiguïté : plusieurs portails pour cet email → on demande de passer par le slug
      return NextResponse.json(
        { error: 'Plusieurs accès trouvés. Connectez-vous depuis le lien direct reçu par email.' },
        { status: 409 },
      )
    }

    const account = accounts[0]

    if (account.is_revoked) {
      await logLoginAttempt(ip, email, false)
      return NextResponse.json(
        { error: 'Votre accès a été révoqué. Contactez L-Agence SA au +41 24 552 18 70 ou info@l-agence.ch.' },
        { status: 403 },
      )
    }

    if (!account.password_hash || !account.password_set_at) {
      await logLoginAttempt(ip, email, false)
      return NextResponse.json(
        { error: "Compte non activé. Vérifiez vos emails pour l'invitation." },
        { status: 403 },
      )
    }

    const ok = await verifyPassword(password, account.password_hash)
    if (!ok) {
      await logLoginAttempt(ip, email, false)
      return NextResponse.json({ error: 'Email ou mot de passe incorrect' }, { status: 401 })
    }

    // Succès : update last_login + log + cookie JWT
    try {
      await (admin as any)
        .from('portal_accounts')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', account.id)
    } catch {}
    await logLoginAttempt(ip, email, true)

    const jwt = await signSession({
      accountId: account.id,
      accountType: account.account_type,
      email: account.email,
      portalId: account.portal_id,
      reportLinkId: account.report_link_id,
    })

    const res = NextResponse.json({
      ok: true,
      // v2.13.6 — JWT renvoyé dans le body : l'app native (WKWebView) le stocke et
      // l'envoie en `Authorization: Bearer` (le cookie httpOnly n'y est pas fiable).
      token: jwt,
      account: {
        id: account.id,
        email: account.email,
        accountType: account.account_type,
        portalId: account.portal_id,
        reportLinkId: account.report_link_id,
      },
    })
    res.cookies.set(cookieName(account.account_type), jwt, sessionCookieOptions(req.headers.get('user-agent')))
    return res
  } catch (e: any) {
    await logLoginAttempt(ip, null, false)
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
