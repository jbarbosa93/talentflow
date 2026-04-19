// Vérifie si TU as déjà envoyé un candidat à un destinataire (30 derniers jours).
// v1.9.61 : per-user strict (via client Supabase authentifié + RLS emails_envoyes),
// support candidat_ids[] multi + fenêtre temporelle + enrichissement client_nom.
// GET /api/activites/check-doublon?candidat_ids=x,y&destinataires=a@b.ch,c@d.ch&days=30

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'

interface Doublon {
  candidat_id: string | null
  candidat_nom?: string | null
  destinataire: string
  date: string
  sujet: string | null
  client_nom: string | null
  campagne_id: string | null
}

export async function GET(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const { searchParams } = new URL(request.url)
    const candidatIds = (searchParams.get('candidat_ids') || '').split(',').map(s => s.trim()).filter(Boolean)
    const destinataires = (searchParams.get('destinataires') || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    const days = Math.max(1, Math.min(365, Number(searchParams.get('days') || '30')))

    if (candidatIds.length === 0 || destinataires.length === 0) {
      return NextResponse.json({ doublons: [] })
    }

    // Client authentifié → RLS filtre automatiquement par user_id (voir migration v1.9.60).
    // Les rows sans user_id (legacy) restent visibles selon la policy backward compat.
    const supabase = await createClient()
    const sinceIso = new Date(Date.now() - days * 86400_000).toISOString()

    // 2 requêtes parallèles : (a) candidat_id simple, (b) candidat_ids array overlap
    const [q1, q2] = await Promise.all([
      (supabase as any)
        .from('emails_envoyes')
        .select('candidat_id, candidat_ids, destinataire, sujet, client_nom, campagne_id, created_at')
        .in('candidat_id', candidatIds)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(200),
      (supabase as any)
        .from('emails_envoyes')
        .select('candidat_id, candidat_ids, destinataire, sujet, client_nom, campagne_id, created_at')
        .overlaps('candidat_ids', candidatIds)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(200),
    ])

    const rows = [...(q1.data || []), ...(q2.data || [])]

    // Dédup sur (candidat_id effectif, destinataire, campagne_id)
    const seen = new Set<string>()
    const doublons: Doublon[] = []
    for (const r of rows) {
      const destLower = (r.destinataire || '').toLowerCase()
      if (!destLower || !destinataires.includes(destLower)) continue

      // Identifier le candidat concerné — celui qui a matché l'input
      const candIdsRow: string[] = Array.isArray(r.candidat_ids) ? r.candidat_ids : []
      const matchedCandidat = candidatIds.find(id => id === r.candidat_id || candIdsRow.includes(id)) || r.candidat_id

      const dedupKey = `${matchedCandidat}::${destLower}::${r.campagne_id || r.created_at}`
      if (seen.has(dedupKey)) continue
      seen.add(dedupKey)

      doublons.push({
        candidat_id: matchedCandidat,
        destinataire: r.destinataire,
        date: r.created_at,
        sujet: r.sujet ?? null,
        client_nom: r.client_nom ?? null,
        campagne_id: r.campagne_id ?? null,
      })
    }

    // Hydrater candidat_nom pour l'affichage (1 seul fetch)
    const ids = [...new Set(doublons.map(d => d.candidat_id).filter(Boolean) as string[])]
    if (ids.length > 0) {
      const { data: cands } = await supabase
        .from('candidats')
        .select('id, prenom, nom')
        .in('id', ids)
      const byId = new Map((cands || []).map((c: any) => [c.id, `${c.prenom || ''} ${c.nom || ''}`.trim()]))
      for (const d of doublons) {
        if (d.candidat_id) d.candidat_nom = byId.get(d.candidat_id) ?? null
      }
    }

    // Tri date desc
    doublons.sort((a, b) => b.date.localeCompare(a.date))

    return NextResponse.json({ doublons, days })
  } catch (error) {
    console.error('[check-doublon]', error)
    return NextResponse.json({ doublons: [] })
  }
}
