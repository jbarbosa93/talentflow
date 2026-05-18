// GET /api/portal-auth/me?type=client|candidat
// Retourne la session courante si le cookie est valide, sinon 401.
// Utilisé par les pages publiques pour vérifier l'auth côté client.

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifySession, cookieName, type AccountType } from '@/lib/portal-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type')
  const accountType: AccountType = type === 'candidat' ? 'candidat' : 'client'

  const jar = await cookies()
  const jwt = jar.get(cookieName(accountType))?.value
  if (!jwt) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  }

  const session = await verifySession(jwt)
  if (!session) {
    return NextResponse.json({ error: 'Session invalide' }, { status: 401 })
  }

  // Re-check révocation côté DB (fresh check)
  const admin = createAdminClient()
  const { data: account } = await (admin as any)
    .from('portal_accounts')
    .select('id, email, account_type, portal_id, report_link_id, is_revoked, password_set_at, invited_at, last_login_at')
    .eq('id', session.accountId)
    .maybeSingle()

  if (!account || account.is_revoked || !account.password_set_at) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  // ?full=1 → renvoie aussi le slug cible (pour bouton retour de la page Compte)
  const full = req.nextUrl.searchParams.get('full') === '1'
  let targetSlug: string | null = null
  if (full) {
    if (account.account_type === 'client' && account.portal_id) {
      const { data: portal } = await (admin as any)
        .from('client_portals').select('slug').eq('id', account.portal_id).maybeSingle()
      targetSlug = portal?.slug || null
    } else if (account.account_type === 'candidat' && account.report_link_id) {
      const { data: link } = await (admin as any)
        .from('report_links').select('slug').eq('id', account.report_link_id).maybeSingle()
      targetSlug = link?.slug || null
    }
  }

  return NextResponse.json({
    ok: true,
    account: {
      id: account.id,
      email: account.email,
      accountType: account.account_type,
      portalId: account.portal_id,
      reportLinkId: account.report_link_id,
      ...(full && {
        invitedAt: account.invited_at,
        lastLoginAt: account.last_login_at,
        targetSlug,
      }),
    },
  })
}
