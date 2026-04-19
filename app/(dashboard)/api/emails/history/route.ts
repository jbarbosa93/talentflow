// /api/emails/history — Historique des envois email, groupé par campagne_id.
// Per-user strict : RLS filtre user_id = auth.uid() (voir migration v1.9.60).
// Les rows sans user_id (anciens envois pré-v1.9.60) sont visibles à tous en backward compat.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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
}

export async function GET(req: Request) {
  const authError = await requireAuth()
  if (authError) return authError

  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200)
  const search = (url.searchParams.get('search') || '').trim().toLowerCase()

  const supabase = await createClient()

  // Fetch bruts (RLS gère le filtre per-user)
  const { data: rows, error } = await supabase
    .from('emails_envoyes')
    .select('id, user_id, campagne_id, candidat_id, candidat_ids, client_id, client_nom, sujet, corps, destinataire, statut, cv_personnalise, cv_urls_utilises, created_at')
    .order('created_at', { ascending: false })
    .limit(limit * 15) // large pour agréger ensuite

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
