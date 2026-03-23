// app/(dashboard)/api/candidats/[id]/route.ts
// Lecture / mise à jour / suppression d'un candidat via admin client (bypasse RLS)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('candidats')
      .select('*, notes_candidat(*), pipeline(*, offres(*))')
      .eq('id', id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Candidat introuvable' }, { status: 404 })
    }

    return NextResponse.json({ candidat: data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}

// Toutes les colonnes modifiables de la table candidats
const ALLOWED_COLS = new Set([
  'nom','prenom','email','telephone','localisation','titre_poste','annees_exp',
  'competences','formation','resume_ia','cv_texte_brut','statut_pipeline','tags','notes','source',
  'langues','linkedin','permis_conduire','date_naissance','experiences','formations_details','photo_url','documents','import_status','rating','genre',
  'cv_url','cv_nom_fichier',
])

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const rawBody = await request.json()
    const supabase = createAdminClient()

    // Filtrer : ne garder que les colonnes autorisées
    const body: Record<string, any> = {}
    for (const [k, v] of Object.entries(rawBody)) {
      if (ALLOWED_COLS.has(k)) body[k] = v
    }

    if (Object.keys(body).length === 0) {
      return NextResponse.json({ error: 'Aucun champ valide à mettre à jour' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('candidats')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[PATCH candidat] update error:', error.message, error.details)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ candidat: data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createAdminClient()

    const { error } = await supabase.from('candidats').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
