// POST /api/portal/change-email/request — Demande de changement d'email (candidat).
// v2.10.44 — Envoie un code à 6 chiffres sur le NOUVEL email. Rien n'est changé
// tant que le code n'est pas confirmé. PUBLIC (cookie portail candidat).

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifySession, cookieName } from '@/lib/portal-auth'
import { sendEmailChangeCodeEmail } from '@/lib/emails/portal-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function resolveAccount() {
  const jar = await cookies()
  const jwt = jar.get(cookieName('candidat'))?.value
  if (!jwt) return null
  const session = await verifySession(jwt)
  if (!session || session.accountType !== 'candidat') return null
  return { accountId: session.accountId }
}

export async function POST(req: NextRequest) {
  const acc = await resolveAccount()
  if (!acc) return NextResponse.json({ error: 'non connecté' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const newEmail = (typeof body.email === 'string' ? body.email : '').toLowerCase().trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return NextResponse.json({ error: 'E-mail invalide' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: me } = await (admin as any)
    .from('portal_accounts').select('email, account_type').eq('id', acc.accountId).maybeSingle()
  if (!me) return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })
  if ((me.email || '').toLowerCase().trim() === newEmail) {
    return NextResponse.json({ error: 'C\'est déjà ton email actuel' }, { status: 400 })
  }

  // Unicité : aucun autre compte du même type avec cet email.
  const { data: clash } = await (admin as any)
    .from('portal_accounts').select('id')
    .eq('account_type', me.account_type)
    .ilike('email', newEmail)
    .neq('id', acc.accountId)
    .maybeSingle()
  if (clash) return NextResponse.json({ error: 'Cet e-mail est déjà utilisé par un autre compte' }, { status: 409 })

  const code = String(Math.floor(100000 + Math.random() * 900000))
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  // Invalide les demandes précédentes + crée la nouvelle.
  await (admin as any).from('portal_email_changes').update({ used_at: new Date().toISOString() }).eq('account_id', acc.accountId).is('used_at', null)
  const { error: insErr } = await (admin as any).from('portal_email_changes').insert({
    account_id: acc.accountId, new_email: newEmail, code, expires_at: expiresAt,
  })
  if (insErr) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })

  const sent = await sendEmailChangeCodeEmail({ to: newEmail, code })
  if (!sent.ok) return NextResponse.json({ error: 'Impossible d\'envoyer le code. Réessaie.' }, { status: 502 })

  return NextResponse.json({ ok: true, email: newEmail })
}
