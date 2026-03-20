// app/(dashboard)/api/candidats/route.ts
// Lecture / suppression en masse des candidats via admin client (bypasse RLS)
// GET  /api/candidats?search=xxx&statut=nouveau&sort=date_desc
// DELETE /api/candidats  body: { ids: string[] }

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
      .select('*', { count: 'exact' })
      .range(0, 9999)
      .order('created_at', { ascending: false })

    if (statut) {
      query = query.eq('statut_pipeline', statut as any)
    }

    const { data, error, count } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    let candidats = data || []

    if (search) {
      const q = search.toLowerCase()
      candidats = candidats.filter((c: any) =>
        (c.nom || '').toLowerCase().includes(q) ||
        (c.prenom || '').toLowerCase().includes(q) ||
        (c.titre_poste || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.formation || '').toLowerCase().includes(q) ||
        (c.localisation || '').toLowerCase().includes(q) ||
        (c.resume_ia || '').toLowerCase().includes(q) ||
        (c.cv_texte_brut || '').toLowerCase().includes(q) ||
        (c.competences || []).some((s: string) => s.toLowerCase().includes(q)) ||
        (c.langues || []).some((s: string) => s.toLowerCase().includes(q))
      )
    }

    return NextResponse.json({ candidats, total: count })
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
