// /api/emails/history — Historique des envois (email + iMessage + WhatsApp + SMS), groupé par campagne_id.
// v1.9.68 : RLS SELECT global team → tous les users voient tous les envois, avec « envoyé par X ».
// (INSERT/UPDATE/DELETE restent per-user → on ne peut supprimer que ses propres envois.)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'

interface CampagneResume {
  campagne_id: string
  created_at: string
  sujet: string
  destinataires: string[]
  nb_destinataires: number
  candidat_ids: string[]
  nb_candidats: number
  candidats: { id: string; prenom: string | null; nom: string | null }[]
  client_nom: string | null
  cv_personnalise: boolean
  cv_urls_utilises: string[]
  corps_extract: string
  statut: string
  canal: 'email' | 'imessage' | 'whatsapp' | 'sms'
  user_id: string | null          // v1.9.68 — expéditeur (pour historique global team)
  user_name: string | null        // v1.9.68 — prénom ou nom affiché
  is_own: boolean                 // v1.9.68 — true si l'envoi appartient au user courant (pour UI bouton supprimer)
}

export async function GET(req: Request) {
  const authError = await requireAuth()
  if (authError) return authError

  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200)
  const search = (url.searchParams.get('search') || '').trim().toLowerCase()
  const canal = (url.searchParams.get('canal') || '').trim() // '' ou email/imessage/whatsapp/sms

  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  const currentUserId = userData?.user?.id ?? null

  // Fetch bruts (RLS SELECT = USING true depuis v1.9.68 → historique global team)
  let query = supabase
    .from('emails_envoyes')
    .select('id, user_id, user_name, campagne_id, candidat_id, candidat_ids, client_id, client_nom, sujet, corps, destinataire, statut, cv_personnalise, cv_urls_utilises, created_at, canal')
    .order('created_at', { ascending: false })
    .limit(limit * 15)
  if (canal && ['email','imessage','whatsapp','sms'].includes(canal)) {
    query = query.eq('canal', canal)
  }
  const { data: rows, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const allRows = (rows ?? []) as any[]

  // Agrégation : campagne_id si présent, sinon fallback = id de la ligne (1 ligne = 1 campagne virtuelle)
  const campagnesMap = new Map<string, any[]>()
  for (const r of allRows) {
    const key = r.campagne_id || `legacy-${r.id}`
    if (!campagnesMap.has(key)) campagnesMap.set(key, [])
    campagnesMap.get(key)!.push(r)
  }

  // Construction des résumés
  const campagnes: CampagneResume[] = []
  for (const [campagne_id, items] of campagnesMap) {
    const first = items[0]
    const destinataires = [...new Set(items.map((r: any) => r.destinataire).filter(Boolean))]
    const candidatIdsSet = new Set<string>()
    for (const r of items) {
      if (Array.isArray(r.candidat_ids)) r.candidat_ids.forEach((id: string) => candidatIdsSet.add(id))
      else if (r.candidat_id) candidatIdsSet.add(r.candidat_id)
    }
    const candidatIds = [...candidatIdsSet]
    campagnes.push({
      campagne_id,
      created_at: first.created_at,
      sujet: first.sujet ?? '(sans sujet)',
      destinataires,
      nb_destinataires: destinataires.length,
      candidat_ids: candidatIds,
      nb_candidats: candidatIds.length,
      candidats: [],
      client_nom: first.client_nom ?? null,
      cv_personnalise: !!first.cv_personnalise,
      cv_urls_utilises: first.cv_urls_utilises ?? [],
      corps_extract: (first.corps ?? '').slice(0, 220),
      statut: first.statut ?? 'envoye',
      canal: (first.canal ?? 'email') as CampagneResume['canal'],
      user_id: first.user_id ?? null,
      user_name: first.user_name ?? null,
      is_own: !!currentUserId && first.user_id === currentUserId,
    })
  }

  // Hydrater les noms candidats en 1 seul fetch
  const allCandidatIds = [...new Set(campagnes.flatMap(c => c.candidat_ids))].filter(Boolean)
  if (allCandidatIds.length > 0) {
    const { data: cands } = await supabase
      .from('candidats')
      .select('id, prenom, nom')
      .in('id', allCandidatIds)
    const byId = new Map((cands ?? []).map((c: any) => [c.id, c]))
    for (const c of campagnes) {
      c.candidats = c.candidat_ids.map(id => byId.get(id)).filter(Boolean) as any[]
    }
  }

  // Tri + filtre search (sujet / destinataires / candidat nom)
  campagnes.sort((a, b) => b.created_at.localeCompare(a.created_at))
  const filtered = search
    ? campagnes.filter(c => {
        const haystack = [
          c.sujet,
          c.destinataires.join(' '),
          c.client_nom ?? '',
          c.candidats.map(k => `${k.prenom ?? ''} ${k.nom ?? ''}`).join(' '),
        ].join(' ').toLowerCase()
        return haystack.includes(search)
      })
    : campagnes

  return NextResponse.json({ campagnes: filtered.slice(0, limit) })
}

/**
 * DELETE /api/emails/history
 *   - Sans body      → purge TOUT l'historique du user courant (RLS per-user).
 *   - Body { campagne_id } → supprime tous les envois d'une campagne (par user).
 *   - Body { legacy_id }   → supprime une ligne legacy sans campagne_id.
 * Retourne { deleted: N }.
 */
export async function DELETE(req: Request) {
  const authError = await requireAuth()
  if (authError) return authError

  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData?.user?.id
  if (!userId) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  let body: any = null
  try { body = await req.json() } catch { /* no body = delete all */ }

  const campagneId = typeof body?.campagne_id === 'string' ? body.campagne_id.trim() : null
  const legacyId = typeof body?.legacy_id === 'string' ? body.legacy_id.trim() : null

  // v1.9.65 patch 3 — Utilise service role pour bypass la RLS DELETE policy qui exige
  // user_id = auth.uid() STRICT (ne matche pas les legacy NULL). On filtre explicitement
  // côté requête pour ne jamais toucher les rows d'autres users.
  const admin = createAdminClient()

  // Purge all — rows du user courant + legacy NULL
  if (!campagneId && !legacyId) {
    const { error, count } = await admin
      .from('emails_envoyes')
      .delete({ count: 'exact' })
      .or(`user_id.eq.${userId},user_id.is.null`)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ deleted: count ?? 0 })
  }

  // Delete 1 campagne — user courant ou legacy NULL
  if (campagneId) {
    const { error, count } = await admin
      .from('emails_envoyes')
      .delete({ count: 'exact' })
      .eq('campagne_id', campagneId)
      .or(`user_id.eq.${userId},user_id.is.null`)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ deleted: count ?? 0 })
  }

  // Delete 1 legacy row (id de la row)
  if (legacyId) {
    const id = legacyId.replace(/^legacy-/, '')
    const { error, count } = await admin
      .from('emails_envoyes')
      .delete({ count: 'exact' })
      .eq('id', id)
      .or(`user_id.eq.${userId},user_id.is.null`)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ deleted: count ?? 0 })
  }

  return NextResponse.json({ deleted: 0 })
}
