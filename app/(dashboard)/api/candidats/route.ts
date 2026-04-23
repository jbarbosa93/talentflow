// app/(dashboard)/api/candidats/route.ts
// Lecture / suppression en masse des candidats via admin client (bypasse RLS)
// GET  /api/candidats?search=xxx&statut=nouveau&import_status=a_traiter&page=1&per_page=20&sort=date_desc
// DELETE /api/candidats  body: { ids: string[] }

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'
export const maxDuration = 300

// Tous les champs utiles pour la liste (excl. cv_texte_brut qui peut peser plusieurs MB)
const LIST_COLUMNS = [
  'id', 'nom', 'prenom', 'email', 'telephone', 'localisation',
  'titre_poste', 'competences', 'formation',
  'cv_url', 'cv_nom_fichier', 'photo_url', 'resume_ia',
  'statut_pipeline', 'tags', 'notes', 'source',
  'langues', 'permis_conduire', 'date_naissance',
  'import_status', 'rating', 'genre',
  'cfc', 'deja_engage', 'last_import_at',
  'onedrive_change_type', 'onedrive_change_at',
  'pipeline_consultant', 'pipeline_metier',
  'created_at', 'updated_at',
  'notes_candidat(id, contenu, created_at, auteur)',
].join(', ')

export async function GET(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

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
    // v1.9.65 — metier peut être multi (comma-separated) : "sanitaire,aide sanitaire"
    //           → OR via .overlaps() sur tags. Single value garde .contains() (plus précis).
    const metierList = metier ? metier.split(',').map(m => m.trim()).filter(Boolean) : []
    const cfc = searchParams.get('cfc') || ''
    const engage = searchParams.get('engage') || ''
    const pipelineOnly = searchParams.get('statut_pipeline') === 'true'

    // Construire la requête de base
    let query = supabase
      .from('candidats')
      .select(LIST_COLUMNS, { count: 'exact' })

    // Filtres — 'all' = pas de filtre
    const effectiveImportStatus = importStatus && importStatus !== 'all' ? importStatus : ''
    const effectiveStatut = statut && statut !== 'all' ? statut : ''
    if (pipelineOnly) query = query.not('statut_pipeline', 'is', null)
    else if (effectiveStatut) query = query.eq('statut_pipeline', effectiveStatut as any)
    if (effectiveImportStatus) query = query.eq('import_status', effectiveImportStatus as any)
    if (genre) query = query.eq('genre', genre as any)
    if (permis === 'true') query = query.eq('permis_conduire', true)
    if (permis === 'false') query = query.eq('permis_conduire', false)
    if (lieu) query = query.ilike('localisation', `%${lieu}%` as any)
    if (metierList.length === 1) query = query.contains('tags', [metierList[0]] as any)
    else if (metierList.length > 1) query = query.overlaps('tags', metierList as any)
    if (langue) query = query.contains('langues', [langue] as any)
    if (cfc === 'true') query = query.eq('cfc', true as any)
    if (engage === 'true') query = query.eq('deja_engage', true as any)
    // Note : le filtre âge reste côté client (date_naissance a des formats mixtes : "54", "15/03/1990", etc.)

    // Recherche serveur — cherche dans tous les champs via RPC avec filtres intégrés
    if (search) {
      const words = search.trim().split(/\s+/).filter(Boolean)
      const hasColumnFilters = !!(lieu || genre || langue || permis || metier || cfc || engage)

      if (!hasColumnFilters) {
        // Pagination directe via RPC — ne charge que la page courante (scalable 10k+)
        // Fix 1+2 : search passé brut (la RPC v3 split en mots et fait AND entre eux)
        // Fix 1   : result_offset maintenant effectif côté DB
        const rpcResult = await (supabase.rpc as any)('search_candidats_filtered', {
          search_query: search,
          filter_import_status: effectiveImportStatus || null,
          filter_statut: effectiveStatut || null,
          result_limit: perPage,
          result_offset: (page - 1) * perPage,
        })
        const searchRows = rpcResult.data as { id: string; total_count: number }[] | null

        if (!rpcResult.error && searchRows !== null) {
          const totalFound = Number(searchRows[0]?.total_count ?? 0)
          const pageIds = searchRows.map(r => r.id)
          const totalPages = Math.ceil(totalFound / perPage)
          if (pageIds.length === 0) {
            return NextResponse.json({ candidats: [], total: totalFound, page, per_page: perPage, total_pages: totalPages })
          }
          let searchQuery = supabase.from('candidats').select(LIST_COLUMNS).in('id', pageIds)
          switch (sort) {
            // v1.9.90 — tri par last_import_at (dernier import) au lieu de created_at (1er import)
            // Les NULLs sont backfillés = created_at pour les anciens candidats. NULLS LAST défensif.
            case 'date_asc':  searchQuery = searchQuery.order('last_import_at', { ascending: true, nullsFirst: false }).order('id', { ascending: true }); break
            case 'nom_az':    searchQuery = searchQuery.order('prenom', { ascending: true }).order('nom', { ascending: true }).order('id', { ascending: true }); break
            case 'titre_az':  searchQuery = searchQuery.order('titre_poste', { ascending: true }).order('id', { ascending: true }); break
            default:          searchQuery = searchQuery.order('last_import_at', { ascending: false, nullsFirst: false }).order('id', { ascending: true })
          }
          const { data, error: searchFetchError } = await searchQuery
          if (searchFetchError) throw searchFetchError
          return NextResponse.json({ candidats: data || [], total: totalFound, page, per_page: perPage, total_pages: totalPages })
        }
        // Fallback si RPC indisponible → recherche basique ci-dessous
      } else {
        // Avec filtres colonne : fetch tous les IDs via RPC puis filtre JS par batch
        const rpcResult = await (supabase.rpc as any)('search_candidats_filtered', {
          search_query: search,
          filter_import_status: effectiveImportStatus || null,
          filter_statut: effectiveStatut || null,
          result_limit: 10000,
          result_offset: 0,
        })
        const searchRows = rpcResult.data as { id: string; total_count: number }[] | null
        const searchError = rpcResult.error

        if (!searchError && searchRows && searchRows.length > 0) {
          let ids = searchRows.map(r => r.id)

          // Affiner par filtres colonne en batches de 200
          const BATCH = 200
          const filtered: string[] = []
          for (let i = 0; i < ids.length; i += BATCH) {
            const batch = ids.slice(i, i + BATCH)
            let bq = supabase.from('candidats').select('id').in('id', batch)
            if (lieu)              bq = (bq as any).ilike('localisation', `%${lieu}%`)
            if (genre)             bq = (bq as any).eq('genre', genre)
            if (langue)            bq = (bq as any).contains('langues', [langue])
            if (permis === 'true') bq = (bq as any).eq('permis_conduire', true)
            if (permis === 'false') bq = (bq as any).eq('permis_conduire', false)
            if (metierList.length === 1) bq = (bq as any).contains('tags', [metierList[0]])
            else if (metierList.length > 1) bq = (bq as any).overlaps('tags', metierList)
            if (cfc === 'true')    bq = (bq as any).or('cfc.eq.true,formation.ilike.%CFC%,formation.ilike.%Certificat fédéral de capacité%,formation.ilike.%Certificat federal de capacite%')
            if (engage === 'true') bq = (bq as any).eq('deja_engage', true)
            const { data: batchData } = await bq
            if (batchData) filtered.push(...(batchData as { id: string }[]).map(r => r.id))
          }
          ids = filtered

          const totalFound = ids.length
          const totalPages = Math.ceil(totalFound / perPage)
          const from = (page - 1) * perPage
          const pageIds = ids.slice(from, from + perPage)

          if (pageIds.length === 0) {
            return NextResponse.json({ candidats: [], total: totalFound, page, per_page: perPage, total_pages: totalPages })
          }

          let searchQuery = supabase.from('candidats').select(LIST_COLUMNS).in('id', pageIds)
          switch (sort) {
            // v1.9.90 — tri par last_import_at (dernier import) au lieu de created_at (1er import)
            // Les NULLs sont backfillés = created_at pour les anciens candidats. NULLS LAST défensif.
            case 'date_asc':  searchQuery = searchQuery.order('last_import_at', { ascending: true, nullsFirst: false }).order('id', { ascending: true }); break
            case 'nom_az':    searchQuery = searchQuery.order('prenom', { ascending: true }).order('nom', { ascending: true }).order('id', { ascending: true }); break
            case 'titre_az':  searchQuery = searchQuery.order('titre_poste', { ascending: true }).order('id', { ascending: true }); break
            default:          searchQuery = searchQuery.order('last_import_at', { ascending: false, nullsFirst: false }).order('id', { ascending: true })
          }
          const { data, error: searchFetchError } = await searchQuery
          if (searchFetchError) throw searchFetchError
          return NextResponse.json({ candidats: data || [], total: totalFound, page, per_page: perPage, total_pages: totalPages })
        } else if (!searchError && searchRows && searchRows.length === 0) {
          return NextResponse.json({ candidats: [], total: 0, page, per_page: perPage, total_pages: 0 })
        }
      }

      // Fallback si la RPC est indisponible — ILIKE par mot (AND entre mots, OR entre champs)
      // Fix 6 : ajout resume_ia dans les champs couverts
      for (const word of words) {
        const pattern = `%${word}%`
        query = query.or(
          `nom.ilike.${pattern},prenom.ilike.${pattern},titre_poste.ilike.${pattern},email.ilike.${pattern},localisation.ilike.${pattern},formation.ilike.${pattern},notes.ilike.${pattern},resume_ia.ilike.${pattern}`
        )
      }
    }

    // v1.9.90 — tri par last_import_at (dernier import) + id en secondaire pour ordre stable
    switch (sort) {
      case 'date_asc':
        query = query.order('last_import_at', { ascending: true, nullsFirst: false }).order('id', { ascending: true })
        break
      case 'nom_az':
        query = query.order('prenom', { ascending: true }).order('nom', { ascending: true }).order('id', { ascending: true })
        break
      case 'titre_az':
        query = query.order('titre_poste', { ascending: true }).order('id', { ascending: true })
        break
      default: // date_desc
        query = query.order('last_import_at', { ascending: false, nullsFirst: false }).order('id', { ascending: true })
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
          .order('last_import_at', { ascending: sort === 'date_asc', nullsFirst: false })
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
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const { ids } = await request.json()
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids requis' }, { status: 400 })
    }
    const supabase = createAdminClient()

    // v1.9.96 — Snapshot AVANT delete pour traçabilité forensique
    const { data: snapshots } = await supabase
      .from('candidats')
      .select('id, nom, prenom, email, telephone, cv_sha256, cv_url, cv_nom_fichier')
      .in('id', ids)

    const { error } = await supabase.from('candidats').delete().in('id', ids)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // v1.9.96 — Log activité APRÈS delete pour chaque candidat supprimé
    if (snapshots && snapshots.length > 0) {
      try {
        const { logActivityServer, getRouteUser } = await import('@/lib/logActivity')
        const routeUser = await getRouteUser()
        const nowIso = new Date().toISOString()
        for (const snap of snapshots as any[]) {
          const nomComplet = `${snap.prenom || ''} ${snap.nom || ''}`.trim()
          await logActivityServer({
            ...routeUser,
            type: 'candidat_supprime',
            titre: `Candidat supprimé — ${nomComplet || 'sans nom'}`,
            description: `Suppression bulk (${snapshots.length} candidat${snapshots.length > 1 ? 's' : ''}). CV: ${snap.cv_nom_fichier || 'aucun'}`,
            candidat_id: snap.id,
            candidat_nom: nomComplet,
            metadata: {
              source: 'bulk',
              bulk_size: snapshots.length,
              email: snap.email,
              telephone: snap.telephone,
              cv_sha256: snap.cv_sha256,
              cv_url: snap.cv_url,
              cv_nom_fichier: snap.cv_nom_fichier,
              deleted_at: nowIso,
            },
          })
        }
      } catch (err) { console.warn('[DELETE bulk] logActivity failed:', (err as Error).message) }
    }

    return NextResponse.json({ success: true, deleted: ids.length })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
