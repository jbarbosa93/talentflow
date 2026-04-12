// GET /api/candidats/doublons/similar
// Appelle la RPC find_similar_candidates (pg_trgm) et retourne les paires candidates
// + filtre les paires déjà traitées (doublons_historique)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const admin = createAdminClient()
    const threshold = parseInt(request.nextUrl.searchParams.get('threshold') || '20')

    // 1. Appeler la RPC
    const { data: pairs, error } = await (admin as any).rpc('find_similar_candidates', {
      threshold: Math.max(10, Math.min(threshold, 80)),
    })

    if (error) {
      console.error('[Doublons/similar] RPC error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!pairs || pairs.length === 0) {
      return NextResponse.json({ pairs: [], filtered: 0 })
    }

    // 2. Charger l'historique des paires déjà traitées
    const { data: historique } = await (admin as any)
      .from('doublons_historique')
      .select('candidat_a_id, candidat_b_id')

    const treatedKeys = new Set<string>()
    for (const h of historique || []) {
      const k = [h.candidat_a_id, h.candidat_b_id].sort().join('|')
      treatedKeys.add(k)
    }

    // 3. Filtrer les paires déjà traitées
    const filtered = (pairs as any[]).filter((p: any) => {
      const k = [p.id_a, p.id_b].sort().join('|')
      return !treatedKeys.has(k)
    })

    // 4. Charger les données complètes des candidats pour les paires restantes
    const candidatIds = new Set<string>()
    for (const p of filtered) {
      candidatIds.add(p.id_a)
      candidatIds.add(p.id_b)
    }

    if (candidatIds.size === 0) {
      return NextResponse.json({ pairs: [], filtered: pairs.length })
    }

    const { data: candidats } = await admin
      .from('candidats')
      .select('id, nom, prenom, email, telephone, titre_poste, localisation, annees_exp, competences, cv_url, cv_nom_fichier, cv_texte_brut, created_at, photo_url, source, experiences, formations_details, langues, resume_ia, permis_conduire, date_naissance, tags, notes, documents')
      .in('id', Array.from(candidatIds))

    const candidatMap = new Map<string, any>()
    for (const c of candidats || []) {
      candidatMap.set(c.id, c)
    }

    // 5. Construire les paires enrichies
    const enrichedPairs = filtered
      .map((p: any) => {
        const a = candidatMap.get(p.id_a)
        const b = candidatMap.get(p.id_b)
        if (!a || !b) return null
        return {
          candidat_a: a,
          candidat_b: b,
          match_type: p.match_type,
          sim_score: p.sim_score,
        }
      })
      .filter(Boolean)

    return NextResponse.json({
      pairs: enrichedPairs,
      filtered: pairs.length - filtered.length,
      total_raw: pairs.length,
    })
  } catch (e: any) {
    console.error('[Doublons/similar] Error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
