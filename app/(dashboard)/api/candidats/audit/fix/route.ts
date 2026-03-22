// app/(dashboard)/api/candidats/audit/fix/route.ts
// POST /api/candidats/audit/fix — fix individual candidate issues
// Actions: move_cv_to_documents, remove_photo

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

type FixAction = 'move_cv_to_documents' | 'remove_photo'

// Guess document type from filename
function guessDocumentType(filename: string): string {
  const f = (filename || '').toLowerCase()
  if (f.includes('certificat')) return 'Certificat'
  if (f.includes('attestation')) return 'Attestation'
  if (f.includes('diplome') || f.includes('diplôme')) return 'Diplome'
  if (f.includes('formation')) return 'Formation'
  if (f.includes('lettre')) return 'Lettre'
  if (f.includes('motivation')) return 'Lettre de motivation'
  if (f.includes('recommandation')) return 'Recommandation'
  if (f.includes('permis')) return 'Permis'
  return 'Document'
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { candidatId, action } = body as { candidatId: string; action: FixAction }

    if (!candidatId || !action) {
      return NextResponse.json({ error: 'candidatId et action requis' }, { status: 400 })
    }

    if (!['move_cv_to_documents', 'remove_photo'].includes(action)) {
      return NextResponse.json({ error: 'Action invalide' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Fetch current candidate data
    const { data: candidat, error: fetchError } = await supabase
      .from('candidats')
      .select('id, cv_url, cv_nom_fichier, photo_url, documents')
      .eq('id', candidatId)
      .single()

    if (fetchError || !candidat) {
      return NextResponse.json({ error: 'Candidat introuvable' }, { status: 404 })
    }

    if (action === 'move_cv_to_documents') {
      if (!candidat.cv_url) {
        return NextResponse.json({ error: 'Aucun CV à déplacer' }, { status: 400 })
      }

      const docType = guessDocumentType(candidat.cv_nom_fichier || '')
      const existingDocs = Array.isArray(candidat.documents) ? candidat.documents : []

      const newDoc = {
        url: candidat.cv_url,
        nom: candidat.cv_nom_fichier || 'Document',
        type: docType,
        date_ajout: new Date().toISOString(),
      }

      const { error: updateError } = await supabase
        .from('candidats')
        .update({
          cv_url: null,
          cv_nom_fichier: null,
          documents: [...existingDocs, newDoc],
        })
        .eq('id', candidatId)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, action, docType })
    }

    if (action === 'remove_photo') {
      const { error: updateError } = await supabase
        .from('candidats')
        .update({ photo_url: null })
        .eq('id', candidatId)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, action })
    }

    return NextResponse.json({ error: 'Action non supportée' }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
