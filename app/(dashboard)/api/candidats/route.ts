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
  'experiences', 'formations_details', 'import_status', 'rating', 'genre',
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
    const rawPerPage = parseInt(searchParams.get('per_page') || '20')
    const perPage = rawPerPage === 0 ? 10000 : Math.min(rawPerPage, 10000)
    const sort = searchParams.get('sort') || 'date_desc'

    // Construire la requête de base
    let query = supabase
      .from('candidats')
      .select(LIST_COLUMNS, { count: 'exact' })

    // Filtres — 'all' = pas de filtre
    const effectiveImportStatus = importStatus && importStatus !== 'all' ? importStatus : ''
    const effectiveStatut = statut && statut !== 'all' ? statut : ''
    if (effectiveStatut) query = query.eq('statut_pipeline', effectiveStatut as any)
    if (effectiveImportStatus) query = query.eq('import_status', effectiveImportStatus as any)

    // Recherche serveur — cherche dans tous les champs via RPC avec filtres intégrés
    if (search) {
      const words = search.trim().split(/\s+/).filter(Boolean)
      const rpcResult = await (supabase.rpc as any)('search_candidats_filtered', {
        search_query: words.join(' '),
        filter_import_status: effectiveImportStatus || null,
        filter_statut: effectiveStatut || null,
        result_limit: 10000,
      })
      const searchIds = rpcResult.data as { id: string }[] | null
      const searchError = rpcResult.error

      if (!searchError && searchIds && searchIds.length > 0) {
        const ids = searchIds.map((r: { id: string }) => r.id)
        // Envoyer les IDs par batch de 50 max pour éviter la limite URL de PostgREST
        const batchSize = 50
        const batches: string[][] = []
        for (let i = 0; i < ids.length; i += batchSize) {
          batches.push(ids.slice(i, i + batchSize))
        }
        // Construire un OR de .in() n'est pas possible, utiliser la première batch pour la requête paginée
        // et retourner le total réel
        const totalFound = ids.length
        const totalPages = Math.ceil(totalFound / perPage)
        const startIdx = (page - 1) * perPage
        const pageIds = ids.slice(startIdx, startIdx + perPage)
        if (pageIds.length === 0) {
          return NextResponse.json({ candidats: [], total: totalFound, page, per_page: perPage, total_pages: totalPages })
        }
        query = query.in('id', pageIds)
        // Désactiver le filtre import_status/statut car déjà filtré par la RPC
        // et désactiver la pagination Supabase car on pagine manuellement
        const { data, error } = await query
        if (error) throw error
        return NextResponse.json({ candidats: data || [], total: totalFound, page, per_page: perPage, total_pages: totalPages })
      } else if (!searchError && searchIds && searchIds.length === 0) {
        return NextResponse.json({ candidats: [], total: 0, page, per_page: perPage, total_pages: 0 })
      } else {
        // Fallback si la RPC n'existe pas — recherche basique
        for (const word of words) {
          const pattern = `%${word}%`
          query = query.or(
            `nom.ilike.${pattern},prenom.ilike.${pattern},titre_poste.ilike.${pattern},email.ilike.${pattern},localisation.ilike.${pattern},formation.ilike.${pattern},notes.ilike.${pattern}`
          )
        }
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

    // Pagination — pour les gros volumes (>1000), paginer côté serveur
    if (perPage <= 1000) {
      const from = (page - 1) * perPage
      const to = from + perPage - 1
      query = query.range(from, to)
    } else {
      // Supabase limite à 1000 par requête, charger par batches
      query = query.range(0, 999)
    }

    const { data: firstBatch, error, count } = await query

    let data = firstBatch
    if (!error && perPage > 1000 && (count || 0) > 1000) {
      // Charger les batches suivants
      const allData = [...(firstBatch || [])]
      let offset = 1000
      while (offset < (count || 0) && offset < perPage) {
        const batchQuery = supabase
          .from('candidats')
          .select(LIST_COLUMNS)
        // Ré-appliquer les mêmes filtres
        if (effectiveImportStatus) (batchQuery as any).eq('import_status', effectiveImportStatus)
        if (effectiveStatut) (batchQuery as any).eq('statut_pipeline', effectiveStatut)
        const { data: batch } = await (batchQuery as any)
          .order('created_at', { ascending: sort === 'date_asc' })
          .range(offset, Math.min(offset + 999, perPage - 1))
        if (batch) allData.push(...batch)
        else break
        offset += 1000
      }
      data = allData
    }

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
