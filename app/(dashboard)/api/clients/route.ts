// app/(dashboard)/api/clients/route.ts
// GET  /api/clients?search=xxx&statut=actif&page=1&per_page=20
// POST /api/clients  body: { nom_entreprise, ... }

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivityServer, getRouteUser } from '@/lib/logActivity'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'
export const maxDuration = 300

const LIST_COLUMNS = [
  'id', 'nom_entreprise', 'adresse', 'npa', 'ville', 'canton',
  'telephone', 'email', 'secteur', 'notes', 'site_web', 'statut',
  'contacts', 'created_at',
].join(', ')

export async function GET(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const supabase = createAdminClient() as any
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const statut = searchParams.get('statut') || ''
    const canton = searchParams.get('canton') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const rawPerPage = parseInt(searchParams.get('per_page') || '20')
    const perPage = rawPerPage === 0 ? 10000 : Math.min(rawPerPage, 10000)

    // Si recherche → RPC unaccent sur tous les champs (y compris contacts jsonb, notes, site_web, npa)
    // Sinon → select standard
    let query: any
    if (search && search.trim()) {
      // Phrase complète passée à unaccent ILIKE '%phrase%' — couvre aussi les requêtes multi-mots contiguës
      query = supabase
        .rpc('search_clients_filtered', { search_query: search.trim() }, { count: 'exact' })
    } else {
      query = supabase
        .from('clients')
        .select(LIST_COLUMNS, { count: 'exact' })
    }

    // Filtre statut (chaînable sur RPC SETOF clients)
    if (statut && statut !== 'all') {
      query = query.eq('statut', statut)
    }

    // Filtre canton
    if (canton) {
      query = query.ilike('canton', canton)
    }

    // Tri par nom d'entreprise
    query = query.order('nom_entreprise', { ascending: true })

    // Pagination
    const from = (page - 1) * perPage
    const to = from + perPage - 1
    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) {
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    return NextResponse.json({
      clients: data || [],
      total: count || 0,
      page,
      per_page: perPage,
      total_pages: Math.ceil((count || 0) / perPage),
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const body = await request.json()
    const supabase = createAdminClient() as any

    // Champs autorisés
    const allowed = new Set([
      'nom_entreprise', 'adresse', 'npa', 'ville', 'canton',
      'telephone', 'email', 'secteur', 'notes', 'site_web', 'statut',
    ])
    const filtered: Record<string, any> = {}
    for (const [k, v] of Object.entries(body)) {
      if (allowed.has(k)) filtered[k] = v
    }

    if (!filtered.nom_entreprise) {
      return NextResponse.json({ error: 'nom_entreprise est requis' }, { status: 400 })
    }

    // Statut par defaut
    if (!filtered.statut) filtered.statut = 'actif'

    const { data, error } = await supabase
      .from('clients')
      .insert(filtered)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    // Log activité équipe
    try {
      const routeUser = await getRouteUser()
      await logActivityServer({
        ...routeUser,
        type: 'client_contacte',
        titre: `Nouveau client ajouté — ${filtered.nom_entreprise}`,
        client_id: data.id,
        client_nom: filtered.nom_entreprise,
      })
    } catch (err) { console.warn('[clients] logActivity failed:', (err as Error).message) }

    return NextResponse.json({ client: data }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
