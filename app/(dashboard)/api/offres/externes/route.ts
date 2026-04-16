// GET /api/offres/externes — Liste offres externes (server-side, admin client)
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const url = new URL(request.url)
    const statut = url.searchParams.get('statut')
    const source = url.searchParams.get('source')
    const canton = url.searchParams.get('canton')
    const search = url.searchParams.get('search')
    const hideAgences = url.searchParams.get('hideAgences') === 'true'

    const supabase = createAdminClient()
    let query = (supabase as any)
      .from('offres_externes')
      .select('*')
      .eq('actif', true)
      .order('date_publication', { ascending: false, nullsFirst: false })
      .limit(200)

    if (statut) query = query.eq('statut', statut)
    if (source) query = query.eq('source', source)
    if (canton) query = query.eq('canton', canton)
    if (hideAgences) query = query.eq('est_agence', false)
    if (search) query = query.ilike('titre', `%${search}%`)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(data || [])
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
