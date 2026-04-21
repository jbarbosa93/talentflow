// /api/offres-candidats
// v1.9.71 — Gestion des liens candidat ↔ commande ouverte.
//
// GET  ?offre_id=X         → liste des candidats liés à une commande + statut + date_envoi + candidat info
// POST { offre_id, candidat_ids[] }   → lie plusieurs candidats à une commande (statut par défaut : a_envoyer)
// PATCH { id, statut?, date_envoi? }  → update un lien (changer statut, définir date d'envoi)
// DELETE ?id=X             → supprime un lien

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const authError = await requireAuth()
  if (authError) return authError

  const url = new URL(req.url)
  const offreId = (url.searchParams.get('offre_id') || '').trim()
  if (!offreId) return NextResponse.json({ error: 'offre_id requis' }, { status: 400 })

  const admin = createAdminClient() as any
  // Join candidats pour avoir nom/prénom/email/photo
  const { data, error } = await admin
    .from('offres_candidats')
    .select('id, offre_id, candidat_id, statut, date_envoi, user_id, created_at, updated_at, candidats(id, nom, prenom, titre_poste, email, telephone, photo_url, localisation)')
    .eq('offre_id', offreId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ links: data ?? [] })
}

export async function POST(req: Request) {
  const authError = await requireAuth()
  if (authError) return authError

  const body = await req.json().catch(() => ({}))
  const offreId = typeof body?.offre_id === 'string' ? body.offre_id : ''
  const candidatIds: string[] = Array.isArray(body?.candidat_ids)
    ? body.candidat_ids.filter((x: any) => typeof x === 'string' && x.length > 0)
    : []
  if (!offreId || candidatIds.length === 0) {
    return NextResponse.json({ error: 'offre_id et candidat_ids requis' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData?.user?.id ?? null

  const rows = candidatIds.map(cid => ({
    offre_id: offreId,
    candidat_id: cid,
    statut: 'a_envoyer',
    user_id: userId,
  }))

  const admin = createAdminClient() as any
  // ON CONFLICT DO NOTHING — évite les doublons (UNIQUE sur offre_id+candidat_id)
  const { data, error } = await admin
    .from('offres_candidats')
    .upsert(rows, { onConflict: 'offre_id,candidat_id', ignoreDuplicates: true })
    .select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ linked: data?.length ?? 0, links: data ?? [] })
}

export async function PATCH(req: Request) {
  const authError = await requireAuth()
  if (authError) return authError

  const body = await req.json().catch(() => ({}))
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  const patch: Record<string, any> = { updated_at: new Date().toISOString() }
  if (body?.statut === 'a_envoyer' || body?.statut === 'envoye') patch.statut = body.statut
  if (body?.date_envoi === null) patch.date_envoi = null
  else if (typeof body?.date_envoi === 'string') patch.date_envoi = body.date_envoi

  const admin = createAdminClient() as any
  const { data, error } = await admin
    .from('offres_candidats')
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ link: data })
}

export async function DELETE(req: Request) {
  const authError = await requireAuth()
  if (authError) return authError

  const url = new URL(req.url)
  const id = (url.searchParams.get('id') || '').trim()
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  const admin = createAdminClient() as any
  const { error } = await admin.from('offres_candidats').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
