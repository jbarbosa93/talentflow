import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculerScoreMatching } from '@/lib/claude'
import type { Candidat, Offre } from '@/types/database'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: NextRequest) {
  try {
    const { candidat_id, offre_id } = await request.json()
    if (!candidat_id || !offre_id) {
      return NextResponse.json({ error: 'candidat_id et offre_id sont requis' }, { status: 400 })
    }

    const admin = createAdminClient()
    const [{ data: candidatRaw }, { data: offreRaw }] = await Promise.all([
      admin.from('candidats').select('*').eq('id', candidat_id).single(),
      admin.from('offres').select('*').eq('id', offre_id).single(),
    ])

    const candidat = candidatRaw as Candidat | null
    const offre = offreRaw as Offre | null

    if (!candidat) return NextResponse.json({ error: 'Candidat introuvable' }, { status: 404 })
    if (!offre) return NextResponse.json({ error: 'Offre introuvable' }, { status: 404 })

    const result = await calculerScoreMatching(
      { competences: candidat.competences, annees_exp: candidat.annees_exp, titre_poste: candidat.titre_poste, resume_ia: candidat.resume_ia },
      { titre: offre.titre, competences: offre.competences, exp_requise: offre.exp_requise, description: offre.description }
    )

    const { data: pipeline, error } = await admin
      .from('pipeline')
      .upsert({ candidat_id, offre_id, score_ia: result.score, score_detail: { score_competences: result.score_competences, score_experience: result.score_experience } as Record<string, number>, etape: 'nouveau' }, { onConflict: 'candidat_id,offre_id', ignoreDuplicates: false })
      .select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, score: result, pipeline })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur serveur' }, { status: 500 })
  }
}
