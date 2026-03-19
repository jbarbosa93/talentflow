// app/(dashboard)/api/candidats/route.ts
// Lecture des candidats via admin client (bypasse RLS)
// GET /api/candidats?search=xxx&statut=nouveau

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const statut = searchParams.get('statut') || ''

    let query = supabase
      .from('candidats')
      .select('*')
      .order('created_at', { ascending: false })

    if (statut) {
      query = query.eq('statut_pipeline', statut)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    let candidats = data || []

    if (search) {
      const q = search.toLowerCase()
      candidats = candidats.filter((c: any) =>
        c.nom?.toLowerCase().includes(q) ||
        (c.prenom || '').toLowerCase().includes(q) ||
        (c.titre_poste || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q)
      )
    }

    return NextResponse.json({ candidats })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
