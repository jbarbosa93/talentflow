import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculerScoreMatching } from '@/lib/claude'
import { requireAuth } from '@/lib/auth-guard'
import type { Candidat, Offre } from '@/types/database'

export const runtime = 'nodejs'
export const maxDuration = 30
export const preferredRegion = 'dub1'  // Dublin — aligné avec Supabase eu-west-1 (Ireland)

export async function POST(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const body = await request.json()
    const { candidat_id, offre_id, offre_externe_id } = body

    if (!candidat_id || (!offre_id && !offre_externe_id)) {
      return NextResponse.json({ error: 'candidat_id et (offre_id ou offre_externe_id) sont requis' }, { status: 400 })
    }

    const admin = createAdminClient()
    const isExterne = !!offre_externe_id

    // Charger candidat + offre en parallèle
    const candidatPromise = admin.from('candidats').select('*').eq('id', candidat_id).single()
    const offrePromise = isExterne
      ? (admin as any).from('offres_externes').select('*').eq('id', offre_externe_id).single()
      : admin.from('offres').select('*').eq('id', offre_id).single()

    const [{ data: candidatRaw }, { data: offreRaw }] = await Promise.all([candidatPromise, offrePromise])

    const candidat = candidatRaw as Candidat | null
    if (!candidat) return NextResponse.json({ error: 'Candidat introuvable' }, { status: 404 })
    if (!offreRaw) return NextResponse.json({ error: 'Offre introuvable' }, { status: 404 })

    // Construire l'objet offre pour calculerScoreMatching (même shape)
    const offreForMatching = isExterne
      ? {
          titre: offreRaw.titre,
          competences: offreRaw.competences || [],
          exp_requise: 0,
          description: offreRaw.description,
          localisation: offreRaw.lieu,
          notes: null,
        }
      : {
          titre: (offreRaw as Offre).titre,
          competences: (offreRaw as Offre).competences,
          exp_requise: (offreRaw as Offre).exp_requise,
          description: (offreRaw as Offre).description,
          localisation: (offreRaw as Offre).localisation,
          notes: (offreRaw as Offre).notes,
        }

    const result = await calculerScoreMatching(
      {
        competences: candidat.competences,
        annees_exp: candidat.annees_exp,
        titre_poste: candidat.titre_poste,
        resume_ia: candidat.resume_ia,
        formation: candidat.formation,
        langues: candidat.langues,
        cv_texte_brut: candidat.cv_texte_brut,
        experiences: candidat.experiences,
      },
      offreForMatching
    )

    // Upsert pipeline uniquement pour les offres internes
    if (!isExterne) {
      const { error } = await admin
        .from('pipeline')
        .upsert({ candidat_id, offre_id, score_ia: result.score, score_detail: { score_competences: result.score_competences, score_experience: result.score_experience } as Record<string, number>, etape: 'nouveau' }, { onConflict: 'candidat_id,offre_id', ignoreDuplicates: false })
        .select().single()

      if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    return NextResponse.json({ success: true, score: result })
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
