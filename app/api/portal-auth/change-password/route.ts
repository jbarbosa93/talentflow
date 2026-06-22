// POST /api/portal-auth/change-password
// Body: { accountType: 'client'|'candidat', currentPassword, newPassword }
// - Requiert une session valide (cookie JWT)
// - Vérifie le mot de passe courant
// - Hash + UPDATE password_hash + bump password_set_at
// - Invalide les tokens reset/invitation actifs (sécurité)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifySession, verifyPassword, hashPassword, type AccountType, getPortalJwt } from '@/lib/portal-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const accountType: AccountType = body.accountType === 'candidat' ? 'candidat' : 'client'
    const currentPassword: string = body.currentPassword || ''
    const newPassword: string = body.newPassword || ''

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Mots de passe manquants' }, { status: 400 })
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'Mot de passe trop court (8 caractères minimum)' }, { status: 400 })
    }
    if (newPassword === currentPassword) {
      return NextResponse.json({ error: 'Le nouveau mot de passe doit être différent' }, { status: 400 })
    }

    const jwt = await getPortalJwt(accountType)
    const session = jwt ? await verifySession(jwt) : null
    if (!session) {
      return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: account } = await (admin as any)
      .from('portal_accounts')
      .select('id, password_hash, is_revoked')
      .eq('id', session.accountId)
      .maybeSingle()

    if (!account || account.is_revoked) {
      return NextResponse.json({ error: 'Compte introuvable' }, { status: 403 })
    }

    const ok = await verifyPassword(currentPassword, account.password_hash || '')
    if (!ok) {
      return NextResponse.json({ error: 'Mot de passe actuel incorrect' }, { status: 401 })
    }

    const newHash = await hashPassword(newPassword)
    const now = new Date().toISOString()
    await (admin as any)
      .from('portal_accounts')
      .update({ password_hash: newHash, password_set_at: now })
      .eq('id', account.id)

    // Invalide tous les tokens reset/invitation actifs (sécurité)
    await (admin as any)
      .from('portal_tokens')
      .update({ used_at: now })
      .eq('account_id', account.id)
      .is('used_at', null)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
