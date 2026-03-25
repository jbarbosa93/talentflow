// app/(dashboard)/api/activites/route.ts
// GET    /api/activites?search=xxx&type=email_envoye&user_id=xxx&page=1&per_page=20
// POST   /api/activites  body: { type, titre, description?, candidat_id?, ... }
// DELETE /api/activites  body: { ids: string[] } | { types: string[] }

/*
  ──────────────────────────────────────────────────
  SQL a executer dans l'editeur SQL de Supabase :
  ──────────────────────────────────────────────────

  CREATE TABLE IF NOT EXISTS public.activites (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    user_name text NOT NULL,
    type text NOT NULL,
    titre text NOT NULL,
    description text,
    candidat_id uuid,
    candidat_nom text,
    client_id uuid,
    client_nom text,
    offre_id uuid,
    metadata jsonb DEFAULT '{}',
    notes text,
    created_at timestamptz DEFAULT now()
  );

  ALTER TABLE public.activites ENABLE ROW LEVEL SECURITY;

  CREATE POLICY "Allow all for authenticated"
    ON public.activites FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

  CREATE POLICY "Allow service role"
    ON public.activites FOR ALL TO service_role
    USING (true) WITH CHECK (true);

  CREATE INDEX idx_activites_created ON public.activites (created_at DESC);
  CREATE INDEX idx_activites_user    ON public.activites (user_id);

  ──────────────────────────────────────────────────
*/

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient() as any
    const { searchParams } = new URL(request.url)

    const search      = searchParams.get('search') || ''
    const type        = searchParams.get('type') || ''
    const userId      = searchParams.get('user_id') || ''
    const candidatId  = searchParams.get('candidat_id') || ''
    const clientId    = searchParams.get('client_id') || ''
    const dateFrom    = searchParams.get('date_from') || ''
    const dateTo      = searchParams.get('date_to') || ''
    const page        = parseInt(searchParams.get('page') || '1')
    const perPage     = Math.min(parseInt(searchParams.get('per_page') || '20'), 100)

    let query = supabase
      .from('activites')
      .select('*', { count: 'exact' })

    if (type && type !== 'all') {
      // Support comma-separated types for tab filtering
      const types = type.split(',').map((t: string) => t.trim()).filter(Boolean)
      if (types.length === 1) {
        query = query.eq('type', types[0])
      } else {
        query = query.in('type', types)
      }
    }

    if (userId) {
      query = query.eq('user_id', userId)
    }

    if (candidatId) {
      query = query.eq('candidat_id', candidatId)
    }

    if (clientId) {
      query = query.eq('client_id', clientId)
    }

    if (dateFrom) {
      query = query.gte('created_at', dateFrom)
    }
    if (dateTo) {
      query = query.lte('created_at', dateTo)
    }

    query = query.order('created_at', { ascending: false })

    // Si recherche, on fetch plus pour filtrer côté serveur (accent-insensitive)
    const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

    if (search) {
      // Fetch plus de résultats pour filtrer après
      query = query.range(0, 499)
      const { data: rawData, error } = await query
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      const q = normalize(search)
      const filtered = (rawData || []).filter((a: any) => {
        const haystack = normalize(
          `${a.titre || ''} ${a.description || ''} ${a.candidat_nom || ''} ${a.client_nom || ''} ${a.user_name || ''} ${a.notes || ''}`
        )
        return haystack.includes(q)
      })

      const total = filtered.length
      const from = (page - 1) * perPage
      const paged = filtered.slice(from, from + perPage)

      return NextResponse.json({
        activites: paged,
        total,
        page,
        per_page: perPage,
        total_pages: Math.ceil(total / perPage),
      })
    }

    // Sans recherche : pagination normale
    const from = (page - 1) * perPage
    const to = from + perPage - 1
    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      activites: data || [],
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Get authenticated user
    const serverSupabase = await createClient()
    const { data: { user } } = await serverSupabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 })
    }

    const userName = [
      user.user_metadata?.prenom || '',
      user.user_metadata?.nom || '',
    ].filter(Boolean).join(' ') || user.email || 'Utilisateur'

    const supabase = createAdminClient() as any

    const allowed = new Set([
      'type', 'titre', 'description', 'candidat_id', 'candidat_nom',
      'client_id', 'client_nom', 'offre_id', 'metadata',
    ])
    const filtered: Record<string, any> = {}
    for (const [k, v] of Object.entries(body)) {
      if (allowed.has(k)) filtered[k] = v
    }

    if (!filtered.type || !filtered.titre) {
      return NextResponse.json({ error: 'type et titre sont requis' }, { status: 400 })
    }

    filtered.user_id = user.id
    filtered.user_name = userName

    const { data, error } = await supabase
      .from('activites')
      .insert(filtered)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ activite: data }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const serverSupabase = await createClient()
    const { data: { user } } = await serverSupabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 })

    const body = await request.json()
    const supabase = createAdminClient() as any

    if (body.ids && Array.isArray(body.ids) && body.ids.length > 0) {
      // Delete specific IDs
      const { error } = await supabase.from('activites').delete().in('id', body.ids)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ deleted: body.ids.length })
    } else if (body.types && Array.isArray(body.types) && body.types.length > 0) {
      // Delete all of given types
      const { error, count } = await supabase
        .from('activites')
        .delete({ count: 'exact' })
        .in('type', body.types)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ deleted: count })
    } else {
      return NextResponse.json({ error: 'ids ou types requis' }, { status: 400 })
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
