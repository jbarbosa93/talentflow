// GET /api/admin/portal-accounts?portal_id=xxx OR ?report_link_id=xxx
//   → Liste les comptes liés à un portail client OU un lien rapport
// POST /api/admin/portal-accounts
//   Body: { email, accountType, portal_id?, report_link_id?, contextLabel? }
//   → Crée le compte (password_hash=NULL) + token invitation 7j + envoie email

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  generateOpaqueToken,
  normalizeEmail,
  isValidEmail,
  INVITATION_TTL_DAYS,
  type AccountType,
} from '@/lib/portal-auth'
import { sendInvitationEmail } from '@/lib/emails/portal-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  const portalId = req.nextUrl.searchParams.get('portal_id')
  const reportLinkId = req.nextUrl.searchParams.get('report_link_id')

  if (!portalId && !reportLinkId) {
    return NextResponse.json({ error: 'portal_id ou report_link_id requis' }, { status: 400 })
  }

  const admin = createAdminClient()
  let query = (admin as any)
    .from('portal_accounts')
    .select('id, email, account_type, portal_id, report_link_id, invited_at, password_set_at, last_login_at, is_revoked, revoked_at')
    .order('invited_at', { ascending: false })

  if (portalId) query = query.eq('portal_id', portalId)
  if (reportLinkId) query = query.eq('report_link_id', reportLinkId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Derive status pour chaque compte : invited / active / revoked
  const accounts = (data || []).map((a: any) => ({
    ...a,
    status: a.is_revoked ? 'revoked' : (a.password_set_at ? 'active' : 'invited'),
  }))

  return NextResponse.json({ accounts })
}

export async function POST(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const body = await req.json().catch(() => ({}))
    const email = normalizeEmail(body.email)
    const accountType: AccountType = body.accountType === 'candidat' ? 'candidat' : 'client'
    const portalId: string | null = body.portal_id || null
    const reportLinkId: string | null = body.report_link_id || null
    const contextLabel: string | undefined = body.contextLabel

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
    }
    if (accountType === 'client' && !portalId) {
      return NextResponse.json({ error: 'portal_id requis pour un compte client' }, { status: 400 })
    }
    if (accountType === 'candidat' && !reportLinkId) {
      return NextResponse.json({ error: 'report_link_id requis pour un compte candidat' }, { status: 400 })
    }

    const admin = createAdminClient()

    // INSERT (l'unique index partiel bloquera les doublons (email, portal_id) ou (email, report_link_id))
    const { data: account, error: insErr } = await (admin as any)
      .from('portal_accounts')
      .insert({
        email,
        account_type: accountType,
        portal_id: accountType === 'client' ? portalId : null,
        report_link_id: accountType === 'candidat' ? reportLinkId : null,
        invited_by: user?.id || null,
      })
      .select('id, email, account_type')
      .single()

    if (insErr) {
      if ((insErr as any).code === '23505') {
        return NextResponse.json({ error: 'Un compte existe déjà pour cet email sur ce portail' }, { status: 409 })
      }
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }

    // Token invitation (7j)
    const token = generateOpaqueToken()
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 3600 * 1000).toISOString()
    await (admin as any).from('portal_tokens').insert({
      account_id: account.id,
      token,
      purpose: 'invitation',
      expires_at: expiresAt,
    })

    // Email invitation (best-effort)
    const emailResult = await sendInvitationEmail({
      to: account.email,
      accountType: account.account_type,
      token,
      contextLabel,
    })

    return NextResponse.json({
      ok: true,
      account,
      email_sent: emailResult.ok,
      email_error: emailResult.ok ? null : (emailResult as any).error,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
