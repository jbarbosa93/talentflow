// app/(dashboard)/api/clients/route.ts
// GET  /api/clients?search=xxx&statut=actif&page=1&per_page=20
// POST /api/clients  body: { nom_entreprise, ... }

import { NextRequest, NextResponse, after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivityServer, getRouteUser } from '@/lib/logActivity'
import { requireAuth } from '@/lib/auth-guard'
import { extractSecteursFromClient, sanitizeSecteurs } from '@/lib/secteurs-extractor'
import { getSecteursConfigList } from '@/lib/secteurs-config-server'
import { getVilleFromCp } from '@/lib/cp-to-ville'
import { geocodeLocalisation, geocodeAddress } from '@/lib/geocode-localisation'

export const runtime = 'nodejs'
export const maxDuration = 300

const LIST_COLUMNS = [
  'id', 'nom_entreprise', 'adresse', 'npa', 'ville', 'canton',
  'telephone', 'email', 'secteur', 'notes', 'site_web', 'statut',
  'contacts', 'secteurs_activite', 'created_at',
  // v1.9.117 — Zefix (registre du commerce)
  'zefix_uid', 'zefix_status', 'zefix_name', 'zefix_verified_at',
  // v1.9.118 — Géolocalisation pour vue carte
  'latitude', 'longitude',
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
    // v1.9.114 — Filtre secteurs : ?secteurs=Sanitaire,Chauffage (CSV) → overlaps OR logique
    const secteursParam = searchParams.get('secteurs') || ''
    const secteurs = secteursParam.split(',').map(s => s.trim()).filter(Boolean)
    // v1.9.114 — Filtres précis (vs search libre)
    const ville = searchParams.get('ville') || ''
    const npa = searchParams.get('npa') || ''
    const contactsFilter = searchParams.get('contacts') || ''  // 'avec' | 'sans' | ''
    const createdAfter = searchParams.get('created_after') || ''   // ISO date
    const createdBefore = searchParams.get('created_before') || ''
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

    // v1.9.114 — Filtre secteurs : OR logique (overlaps) — un client matche s'il
    // a au moins un des secteurs demandés. Index GIN idx_clients_secteurs exploité.
    if (secteurs.length > 0) {
      query = query.overlaps('secteurs_activite', secteurs)
    }

    // v1.9.114 — Filtres précis ville / NPA (ILIKE strict, pas via search libre)
    if (ville && ville.trim()) {
      query = query.ilike('ville', `%${ville.trim()}%`)
    }
    // v1.9.114 — NPA → on lookup la ville pour matcher TOUS les CPs de cette
    // ville (ex: "1000" Lausanne couvre 1000-1018, y compris "Lausanne 25").
    // Match préfixe (`Lausanne%`) pour exclure "Romanel-sur-Lausanne",
    // "Bussigny-près-Lausanne" qui sont d'autres communes. Fallback ILIKE
    // NPA brut si le CP n'est pas dans les datasets CH/FR.
    if (npa && npa.trim()) {
      const cpVille = getVilleFromCp(npa.trim())
      if (cpVille) {
        query = query.ilike('ville', `${cpVille}%`)
      } else {
        query = query.ilike('npa', `%${npa.trim()}%`)
      }
    }

    // v1.9.114 — Filtre contacts (avec / sans). 'avec' = non-null + non-vide.
    if (contactsFilter === 'avec') {
      query = query.not('contacts', 'is', null).neq('contacts', '[]')
    } else if (contactsFilter === 'sans') {
      query = query.or('contacts.is.null,contacts.eq.[]')
    }

    // v1.9.114 — Filtre date d'ajout (range optionnel)
    if (createdAfter) query = query.gte('created_at', createdAfter)
    if (createdBefore) query = query.lte('created_at', createdBefore)

    // Tri : si recherche → laisser ORDER BY relevance du RPC. Sinon → nom_entreprise ASC.
    if (!search || !search.trim()) {
      query = query.order('nom_entreprise', { ascending: true })
    }

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
      'secteurs_activite', 'contacts',
      // v1.9.117 — import depuis Zefix (les 4 colonnes du registre du commerce)
      'zefix_uid', 'zefix_status', 'zefix_name', 'zefix_verified_at',
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

    // v1.9.114 — Secteurs d'activité : sanitize si fourni explicitement,
    // sinon auto-extrait depuis notes/secteur.
    // v1.9.122 — la taxonomie vient désormais de la table DB (cache 60s côté serveur),
    // avec fallback sur la constante hardcodée si table indispo / vide.
    const validSecteurs = await getSecteursConfigList()
    if (filtered.secteurs_activite !== undefined) {
      filtered.secteurs_activite = sanitizeSecteurs(filtered.secteurs_activite, validSecteurs)
    } else if (filtered.notes || filtered.secteur) {
      const result = extractSecteursFromClient(filtered.notes, filtered.secteur, validSecteurs)
      filtered.secteurs_activite = result.secteurs
    } else {
      filtered.secteurs_activite = []
    }

    // v1.9.118 — Géocodage instantané NPA centroïde (lookup local ~1ms, sync, non-bloquant en pratique)
    // pour avoir des coords IMMÉDIATEMENT en DB. Le géocodage adresse précise Nominatim
    // est différé en after() (cf. ci-dessous) pour ne pas bloquer la response.
    const latLngForced = filtered.latitude != null && filtered.longitude != null
    if (!latLngForced && (filtered.npa || filtered.ville)) {
      try {
        const loc = `${filtered.npa ? filtered.npa + ' ' : ''}${filtered.ville || ''}, Suisse`.trim()
        const geo = await geocodeLocalisation(loc)
        if (geo) {
          filtered.latitude = geo.latitude
          filtered.longitude = geo.longitude
        }
      } catch (err) { console.warn('[clients POST] geocode centroïde failed:', (err as Error).message) }
    }

    const { data, error } = await supabase
      .from('clients')
      .insert(filtered)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    // v1.9.119 — Géocodage adresse précise en BACKGROUND (fire-and-forget).
    // Nominatim peut prendre 1-3s, ne pas bloquer la response. UPDATE asynchrone
    // remplace le centroïde NPA par les vraies coords rue+numéro quand prêt.
    if (!latLngForced && filtered.adresse && (filtered.npa || filtered.ville) && data?.id) {
      const clientId = data.id
      after(async () => {
        try {
          const geo = await geocodeAddress(filtered.adresse, filtered.npa, filtered.ville, 'Suisse')
          if (geo && geo.source === 'address') {
            await supabase
              .from('clients')
              .update({ latitude: geo.latitude, longitude: geo.longitude })
              .eq('id', clientId)
          }
        } catch (err) { console.warn('[clients POST after] geocode address failed:', (err as Error).message) }
      })
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
