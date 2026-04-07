// app/(dashboard)/api/candidats/route.ts
// Lecture / suppression en masse des candidats via admin client (bypasse RLS)
// GET  /api/candidats?search=xxx&statut=nouveau&import_status=a_traiter&page=1&per_page=20&sort=date_desc
// DELETE /api/candidats  body: { ids: string[] }

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 300

// Tous les champs utiles pour la liste (excl. cv_texte_brut qui peut peser plusieurs MB)
const LIST_COLUMNS = [
  'id', 'nom', 'prenom', 'email', 'telephone', 'localisation',
  'titre_poste', 'annees_exp', 'competences', 'formation',
  'cv_url', 'cv_nom_fichier', 'photo_url', 'resume_ia',
  'statut_pipeline', 'tags', 'notes', 'source',
  'langues', 'linkedin', 'permis_conduire', 'date_naissance',
  'experiences', 'formations_details', 'import_status', 'rating', 'genre',
  'cfc', 'deja_engage',
  'created_at', 'updated_at',
  'notes_candidat(id, contenu, created_at, auteur)',
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
    const genre = searchParams.get('genre') || ''
    const ageMin = searchParams.get('age_min') || ''
    const ageMax = searchParams.get('age_max') || ''
    const langue = searchParams.get('langue') || ''
    const permis = searchParams.get('permis') || ''
    const lieu = searchParams.get('lieu') || ''
    const metier = searchParams.get('metier') || ''
    const cfc = searchParams.get('cfc') || ''
    const engage = searchParams.get('engage') || ''

    // Construire la requête de base
    let query = supabase
      .from('candidats')
      .select(LIST_COLUMNS, { count: 'exact' })

    // Filtres — 'all' = pas de filtre
    const effectiveImportStatus = importStatus && importStatus !== 'all' ? importStatus : ''
    const effectiveStatut = statut && statut !== 'all' ? statut : ''
    if (effectiveStatut) query = query.eq('statut_pipeline', effectiveStatut as any)
    if (effectiveImportStatus) query = query.eq('import_status', effectiveImportStatus as any)
    if (genre) query = query.eq('genre', genre as any)
    if (permis === 'true') query = query.eq('permis_conduire', true)
    if (permis === 'false') query = query.eq('permis_conduire', false)
    if (lieu) query = query.ilike('localisation', `%${lieu}%` as any)
    if (metier) query = query.contains('tags', [metier] as any)
    if (langue) query = query.contains('langues', [langue] as any)
    if (cfc === 'true') query = query.eq('cfc', true as any)
    if (engage === 'true') query = query.eq('deja_engage', true as any)
    // Note : le filtre âge reste côté client (date_naissance a des formats mixtes : "54", "15/03/1990", etc.)

    // Recherche serveur — cherche dans tous les champs via RPC avec filtres intégrés
    if (search) {
      const words = search.trim().split(/\s+/).filter(Boolean)
      const rpcResult = await (supabase.rpc as any)('search_candidats_filtered', {
        search_query: words.join(' '),
        filter_import_status: effectiveImportStatus || null,
        filter_statut: effectiveStatut || null,
        result_limit: 10000,
      }).limit(10000) // override le plafond PostgREST par défaut (1000 lignes)
      const searchIds = rpcResult.data as { id: string }[] | null
      const searchError = rpcResult.error

      if (!searchError && searchIds && searchIds.length > 0) {
        let ids = searchIds.map((r: { id: string }) => r.id)

        // Si des filtres colonne sont actifs (lieu, genre, langue, permis, metier),
        // la RPC ne les connaît pas — il faut affiner les IDs par batches pour éviter l'overflow URL.
        const hasColumnFilters = !!(lieu || genre || langue || permis || metier || cfc || engage)
        if (hasColumnFilters) {
          const BATCH = 200
          const filtered: string[] = []
          for (let i = 0; i < ids.length; i += BATCH) {
            const batch = ids.slice(i, i + BATCH)
            let bq = supabase.from('candidats').select('id').in('id', batch)
            if (lieu)             bq = (bq as any).ilike('localisation', `%${lieu}%`)
            if (genre)            bq = (bq as any).eq('genre', genre)
            if (langue)           bq = (bq as any).contains('langues', [langue])
            if (permis === 'true') bq = (bq as any).eq('permis_conduire', true)
            if (permis === 'false') bq = (bq as any).eq('permis_conduire', false)
            if (metier)           bq = (bq as any).contains('tags', [metier])
            if (cfc === 'true')   bq = (bq as any).or('cfc.eq.true,formation.ilike.%CFC%,formation.ilike.%Certificat fédéral de capacité%,formation.ilike.%Certificat federal de capacite%')
            if (engage === 'true') bq = (bq as any).eq('deja_engage', true)
            const { data: batchData } = await bq
            if (batchData) filtered.push(...(batchData as { id: string }[]).map(r => r.id))
          }
          ids = filtered
        }

        const totalFound = ids.length
        const totalPages = Math.ceil(totalFound / perPage)

        // Paginer les IDs filtrés — évite l'overflow d'URL (>16KB)
        const from = (page - 1) * perPage
        const pageIds = ids.slice(from, from + perPage)

        if (pageIds.length === 0) {
          return NextResponse.json({ candidats: [], total: totalFound, page, per_page: perPage, total_pages: totalPages })
        }

        let searchQuery = supabase
          .from('candidats')
          .select(LIST_COLUMNS)
          .in('id', pageIds)

        // Tri dans la page — id en secondaire pour ordre stable quand created_at identiques
        switch (sort) {
          case 'date_asc':  searchQuery = searchQuery.order('created_at', { ascending: true }).order('id', { ascending: true }); break
          case 'nom_az':    searchQuery = searchQuery.order('prenom', { ascending: true }).order('nom', { ascending: true }).order('id', { ascending: true }); break
          case 'titre_az':  searchQuery = searchQuery.order('titre_poste', { ascending: true }).order('id', { ascending: true }); break
          default:          searchQuery = searchQuery.order('created_at', { ascending: false }).order('id', { ascending: true })
        }

        const { data, error: searchFetchError } = await searchQuery
        if (searchFetchError) throw searchFetchError
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

    // Tri — id en secondaire pour ordre stable quand created_at identiques
    switch (sort) {
      case 'date_asc':
        query = query.order('created_at', { ascending: true }).order('id', { ascending: true })
        break
      case 'nom_az':
        query = query.order('prenom', { ascending: true }).order('nom', { ascending: true }).order('id', { ascending: true })
        break
      case 'titre_az':
        query = query.order('titre_poste', { ascending: true }).order('id', { ascending: true })
        break
      default: // date_desc
        query = query.order('created_at', { ascending: false }).order('id', { ascending: true })
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
    const msg = error instanceof Error ? error.message : JSON.stringify(error)
    console.error('[candidats GET]', msg, error)
    return NextResponse.json({ error: msg }, { status: 500 })
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
