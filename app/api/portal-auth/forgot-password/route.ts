// POST /api/portal-auth/forgot-password
// Body: { email, accountType: 'client'|'candidat', slug?: string }
// - Lookup compte (par email + type, et slug si fourni pour disambiguer)
// - Génère token reset (TTL 1h)
// - Envoie email avec lien /set-password?token=...
// - Réponse 200 même si email inconnu (anti-énumération)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  generateOpaqueToken,
  normalizeEmail,
  isValidEmail,
  RESET_TTL_HOURS,
  type AccountType,
} from '@/lib/portal-auth'
import { sendResetPasswordEmail } from '@/lib/emails/portal-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const email = normalizeEmail(body.email)
    const accountType: AccountType = body.accountType === 'candidat' ? 'candidat' : 'client'
    const slug: string | undefined = body.slug

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Résolution slug → portal_id ou report_link_id (optionnel pour disambiguer)
    let portalId: string | null = null
    let reportLinkId: string | null = null
    if (slug) {
      if (accountType === 'client') {
        const { data } = await (admin as any)
          .from('client_portals').select('id').eq('slug', slug).maybeSingle()
        if (data) portalId = data.id
      } else {
        const { data } = await (admin as any)
          .from('report_links').select('id').eq('slug', slug).maybeSingle()
        if (data) reportLinkId = data.id
      }
    }

    // Lookup comptes
    let query = (admin as any)
      .from('portal_accounts')
      .select('id, email, account_type, portal_id, report_link_id, is_revoked')
      .eq('email', email)
      .eq('account_type', accountType)
    if (portalId) query = query.eq('portal_id', portalId)
    if (reportLinkId) query = query.eq('report_link_id', reportLinkId)

    const { data: accounts } = await query

    // Toujours répondre OK (anti-énumération), mais envoyer email uniquement si compte trouvé
    if (accounts && accounts.length > 0) {
      const expiresAt = new Date(Date.now() + RESET_TTL_HOURS * 3600 * 1000).toISOString()
      // Si plusieurs comptes (même email sur plusieurs portails), on envoie 1 email par compte
      for (const account of accounts) {
        if (account.is_revoked) continue
        const token = generateOpaqueToken()
        await (admin as any).from('portal_tokens').insert({
          account_id: account.id,
          token,
          purpose: 'reset',
          expires_at: expiresAt,
        })
        // best-effort (n'échoue pas le request si l'email plante)
        try {
          await sendResetPasswordEmail({
            to: account.email,
            accountType: account.account_type,
            token,
          })
        } catch (e) {
          console.warn('[forgot-password] sendResetPasswordEmail failed:', e)
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
