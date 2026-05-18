// GET /api/portal-auth/token-info?token=xxx
// Retourne les infos publiques du compte lié au token (sans consommer le token) :
//   - email
//   - accountType
//   - context : { name } pour client = nom entreprise + site_web (pour logo), pour candidat = nom candidat

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Token manquant' }, { status: 400 })

  const admin = createAdminClient()

  const { data: tk } = await (admin as any)
    .from('portal_tokens')
    .select('id, account_id, expires_at, used_at')
    .eq('token', token)
    .maybeSingle()

  if (!tk) return NextResponse.json({ error: 'Lien invalide' }, { status: 410 })
  if (tk.used_at) return NextResponse.json({ error: 'Lien déjà utilisé' }, { status: 410 })
  if (new Date(tk.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Lien expiré' }, { status: 410 })
  }

  const { data: account } = await (admin as any)
    .from('portal_accounts')
    .select('id, email, account_type, portal_id, report_link_id, is_revoked')
    .eq('id', tk.account_id)
    .maybeSingle()

  if (!account || account.is_revoked) {
    return NextResponse.json({ error: 'Compte introuvable' }, { status: 403 })
  }

  // Récup contexte (nom entreprise ou nom candidat)
  let context: { name: string | null; site_web: string | null } = { name: null, site_web: null }

  if (account.account_type === 'client' && account.portal_id) {
    const { data: portal } = await (admin as any)
      .from('client_portals')
      .select('client_id, clients!client_id(nom_entreprise, site_web)')
      .eq('id', account.portal_id)
      .maybeSingle()
    if (portal?.clients) {
      context = {
        name: portal.clients.nom_entreprise || null,
        site_web: portal.clients.site_web || null,
      }
    }
  } else if (account.account_type === 'candidat' && account.report_link_id) {
    const { data: link } = await (admin as any)
      .from('report_links')
      .select('candidat_name')
      .eq('id', account.report_link_id)
      .maybeSingle()
    if (link) {
      context = { name: link.candidat_name || null, site_web: null }
    }
  }

  return NextResponse.json({
    ok: true,
    email: account.email,
    accountType: account.account_type,
    context,
  })
}
