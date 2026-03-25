// app/(dashboard)/api/candidats/audit/fix-candidat/route.ts
// POST /api/candidats/audit/fix-candidat
// Re-parses one candidate with nom='Candidat' by calling /api/cv/parse with update_id
// Body: { candidatId: string }

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { candidatId } = body as { candidatId: string }

    if (!candidatId) {
      return NextResponse.json({ error: 'candidatId requis' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // 1. Fetch the candidate to get cv_url and cv_nom_fichier
    const { data: candidat, error: fetchError } = await supabase
      .from('candidats')
      .select('id, nom, prenom, cv_url, cv_nom_fichier')
      .eq('id', candidatId)
      .single()

    if (fetchError || !candidat) {
      return NextResponse.json({ error: 'Candidat introuvable' }, { status: 404 })
    }

    // 2. Check cv_url exists
    if (!candidat.cv_url) {
      return NextResponse.json({ error: 'Aucun CV associé à ce candidat' }, { status: 400 })
    }

    // 3. Download the CV file from the signed URL
    const cvResponse = await fetch(candidat.cv_url)
    if (!cvResponse.ok) {
      return NextResponse.json(
        { error: `Impossible de télécharger le CV (HTTP ${cvResponse.status})` },
        { status: 500 }
      )
    }

    const cvBuffer = await cvResponse.arrayBuffer()
    const contentType = cvResponse.headers.get('content-type') || 'application/pdf'

    // Determine filename
    const fileName = candidat.cv_nom_fichier || 'cv.pdf'

    // Create a File object from the downloaded buffer
    const cvFile = new File([cvBuffer], fileName, { type: contentType })

    // 4. Build FormData with the CV file + update_id
    const formData = new FormData()
    formData.append('cv', cvFile)
    formData.append('update_id', candidatId)
    formData.append('force_insert', 'false')

    // 5. Call /api/cv/parse internally (same origin)
    const origin = request.nextUrl.origin
    const parseResponse = await fetch(`${origin}/api/cv/parse`, {
      method: 'POST',
      body: formData,
    })

    const parseResult = await parseResponse.json()

    if (!parseResponse.ok) {
      return NextResponse.json(
        { error: parseResult.error || 'Erreur lors du re-parsing' },
        { status: 500 }
      )
    }

    // 6. Return success with updated candidate info
    return NextResponse.json({
      success: true,
      candidatId,
      ancien_nom: candidat.nom,
      nouveau_nom: parseResult.nom || parseResult.candidat?.nom || null,
      nouveau_prenom: parseResult.prenom || parseResult.candidat?.prenom || null,
      message: parseResult.message || 'Candidat re-parsé avec succès',
    })
  } catch (error) {
    console.error('[fix-candidat] Erreur:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
