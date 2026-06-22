// /api/push/inapp — Messages riches affichés DANS l'app candidat (modal + animation).
// v2.10.26 — PUBLIC (lit le cookie portail candidat). GET : renvoie le dernier message
//            non vu pour le candidat connecté. POST { id } : marque comme vu.
// Aucune donnée si pas de session candidat → silencieux (le web normal n'affiche rien).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifySession, getPortalJwt } from '@/lib/portal-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function resolveCandidateId(): Promise<string | null> {
  const jwt = await getPortalJwt('candidat')
  if (!jwt) return null
  const session = await verifySession(jwt)
  if (!session || session.accountType !== 'candidat' || !session.reportLinkId) return null
  const admin = createAdminClient()
  const { data: link } = await (admin as any)
    .from('report_links')
    .select('candidat_id')
    .eq('id', session.reportLinkId)
    .maybeSingle()
  return (link?.candidat_id as string) || null
}

export async function GET() {
  const candidateId = await resolveCandidateId()
  if (!candidateId) return NextResponse.json({ message: null })

  const admin = createAdminClient()
  const { data } = await (admin as any)
    .from('inapp_messages')
    .select('id, title, body, image_url, animation')
    .eq('candidate_id', candidateId)
    .is('seen_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ message: data || null })
}

export async function POST(req: NextRequest) {
  const candidateId = await resolveCandidateId()
  if (!candidateId) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ ok: false }, { status: 400 })

  const admin = createAdminClient()
  await (admin as any)
    .from('inapp_messages')
    .update({ seen_at: new Date().toISOString() })
    .eq('id', id)
    .eq('candidate_id', candidateId)  // garde-fou : ne marque que SES messages
  return NextResponse.json({ ok: true })
}
