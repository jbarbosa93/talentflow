import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

// POST /api/pipeline/clear
// body: { etape_id?: string } — si fourni, vide uniquement cette colonne
//                              — sinon, remet statut_pipeline=null pour TOUS
export async function POST(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  const admin = createAdminClient()
  const body = await request.json().catch(() => ({}))
  const { etape_id } = body

  if (etape_id) {
    // Vider une colonne spécifique : remettre statut_pipeline à null
    const { count, error } = await admin
      .from('candidats')
      .update({ statut_pipeline: null })
      .eq('statut_pipeline', etape_id)

    if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    return NextResponse.json({ cleared: count || 0, message: `Colonne "${etape_id}" vidée` })
  } else {
    // Vider toute la pipeline (table pipeline offres + statut_pipeline candidats)
    await admin.from('pipeline').delete().gte('created_at', '2000-01-01')
    const { count, error } = await admin
      .from('candidats')
      .update({ statut_pipeline: null })
      .not('statut_pipeline', 'is', null)

    if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    return NextResponse.json({ cleared: count || 0, message: 'Pipeline entière vidée' })
  }
}
