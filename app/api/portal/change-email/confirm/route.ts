// POST /api/portal/change-email/confirm — Valide le code → applique le nouvel email.
// v2.10.44 — PUBLIC (cookie portail candidat). Max 6 tentatives, code 15 min.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifySession, getPortalJwt } from '@/lib/portal-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function resolveAccount() {
  const jwt = await getPortalJwt('candidat')
  if (!jwt) return null
  const session = await verifySession(jwt)
  if (!session || session.accountType !== 'candidat') return null
  return { accountId: session.accountId }
}

export async function POST(req: NextRequest) {
  const acc = await resolveAccount()
  if (!acc) return NextResponse.json({ error: 'non connecté' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const code = (typeof body.code === 'string' ? body.code : '').trim()
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: 'Code à 6 chiffres requis' }, { status: 400 })

  const admin = createAdminClient()
  const { data: row } = await (admin as any)
    .from('portal_email_changes')
    .select('id, new_email, code, attempts, expires_at')
    .eq('account_id', acc.accountId)
    .is('used_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!row) return NextResponse.json({ error: 'Aucune demande en cours. Recommence.' }, { status: 400 })
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Code expiré. Demande un nouveau code.' }, { status: 400 })
  }
  if ((row.attempts || 0) >= 6) {
    await (admin as any).from('portal_email_changes').update({ used_at: new Date().toISOString() }).eq('id', row.id)
    return NextResponse.json({ error: 'Trop de tentatives. Demande un nouveau code.' }, { status: 429 })
  }
  if (row.code !== code) {
    await (admin as any).from('portal_email_changes').update({ attempts: (row.attempts || 0) + 1 }).eq('id', row.id)
    return NextResponse.json({ error: 'Code incorrect' }, { status: 400 })
  }

  // Re-vérifie l'unicité au dernier moment + applique.
  const { data: me } = await (admin as any).from('portal_accounts').select('account_type').eq('id', acc.accountId).maybeSingle()
  const { data: clash } = await (admin as any)
    .from('portal_accounts').select('id').eq('account_type', me?.account_type).ilike('email', row.new_email).neq('id', acc.accountId).maybeSingle()
  if (clash) {
    await (admin as any).from('portal_email_changes').update({ used_at: new Date().toISOString() }).eq('id', row.id)
    return NextResponse.json({ error: 'Cet e-mail est désormais utilisé ailleurs.' }, { status: 409 })
  }

  await (admin as any).from('portal_accounts').update({ email: row.new_email }).eq('id', acc.accountId)
  await (admin as any).from('portal_email_changes').update({ used_at: new Date().toISOString() }).eq('id', row.id)

  return NextResponse.json({ ok: true, email: row.new_email })
}
