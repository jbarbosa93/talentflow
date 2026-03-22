// app/(dashboard)/api/candidats/route.ts
// Lecture / suppression en masse des candidats via admin client (bypasse RLS)
// GET  /api/candidats?search=xxx&statut=nouveau&import_status=a_traiter&page=1&per_page=20&sort=date_desc
// DELETE /api/candidats  body: { ids: string[] }

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 60

// Tous les champs utiles pour la liste (excl. cv_texte_brut qui peut peser plusieurs MB)
const LIST_COLUMNS = [
  'id', 'nom', 'prenom', 'email', 'telephone', 'localisation',
  'titre_poste', 'annees_exp', 'competences', 'formation',
  'cv_url', 'cv_nom_fichier', 'photo_url', 'resume_ia',
  'statut_pipeline', 'tags', 'notes', 'source',
  'langues', 'linkedin', 'permis_conduire', 'date_naissance',
  'experiences', 'formations_details', 'import_status', 'rating',
  'created_at', 'updated_at',
].join(', ')

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const statut = searchParams.get('statut') || ''
    const importStatus = searchParams.get('import_status') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const perPage = Math.min(parseInt(searchParams.get('per_page') || '20'), 500)
    const sort = searchParams.get('sort') || 'date_desc'

    // Construire la requête de base
    let query = supabase
      .from('candidats')
      .select(LIST_COLUMNS, { count: 'exact' })

    // Filtres
    if (statut) query = query.eq('statut_pipeline', statut as any)
    if (importStatus) query = query.eq('import_status', importStatus as any)

    // Recherche serveur — utilise ilike sur les champs principaux
    if (search) {
      const words = search.trim().split(/\s+/).filter(Boolean)
      // Pour chaque mot, on filtre avec OR sur nom, prenom, titre_poste, email, localisation
      for (const word of words) {
        const pattern = `%${word}%`
        query = query.or(
          `nom.ilike.${pattern},prenom.ilike.${pattern},titre_poste.ilike.${pattern},email.ilike.${pattern},localisation.ilike.${pattern},formation.ilike.${pattern}`
        )
      }
    }

    // Tri
    switch (sort) {
      case 'date_asc':
        query = query.order('created_at', { ascending: true })
        break
      case 'nom_az':
        query = query.order('prenom', { ascending: true }).order('nom', { ascending: true })
        break
      case 'titre_az':
        query = query.order('titre_poste', { ascending: true })
        break
      default: // date_desc
        query = query.order('created_at', { ascending: false })
    }

    // Pagination
    const from = (page - 1) * perPage
    const to = from + perPage - 1
    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      candidats: data || [],
      total: count || 0,
      page,
      per_page: perPage,
      total_pages: Math.ceil((count || 0) / perPage),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { ids } = await request.json()
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids requis' }, { status: 400 })
    }
    const supabase = createAdminClient()
    const { error } = await supabase.from('candidats').delete().in('id', ids)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, deleted: ids.length })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
