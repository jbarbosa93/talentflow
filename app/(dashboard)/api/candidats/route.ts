// app/(dashboard)/api/candidats/route.ts
// Lecture / suppression en masse des candidats via admin client (bypasse RLS)
// GET  /api/candidats?search=xxx&statut=nouveau&sort=date_desc
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
  'experiences', 'formations_details', 'import_status',
  'created_at', 'updated_at',
].join(', ')

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const statut = searchParams.get('statut') || ''
    const importStatus = searchParams.get('import_status') || ''

    // ── Fetch ALL rows via pagination loop ───────────────────────────────────
    // PostgREST caps at 1000 rows per request regardless of .range() — loop to bypass
    const PAGE_SIZE = 1000
    const allData: any[] = []
    let offset = 0

    while (true) {
      let query = supabase
        .from('candidats')
        .select(LIST_COLUMNS)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)

      if (statut) query = query.eq('statut_pipeline', statut as any)
      if (importStatus) query = query.eq('import_status', importStatus as any)

      const { data, error } = await query

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      if (!data || data.length === 0) break

      allData.push(...data)

      if (data.length < PAGE_SIZE) break  // last page
      offset += PAGE_SIZE
    }

    // ── Filtrage client-side (recherche texte) ───────────────────────────────
    let candidats = allData

    if (search) {
      const q = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

      candidats = candidats.filter((c: any) =>
        norm(c.nom || '').includes(q) ||
        norm(c.prenom || '').includes(q) ||
        norm(c.titre_poste || '').includes(q) ||
        norm(c.email || '').includes(q) ||
        norm(c.formation || '').includes(q) ||
        norm(c.localisation || '').includes(q) ||
        norm(c.resume_ia || '').includes(q) ||
        (c.competences || []).some((s: string) => norm(s).includes(q)) ||
        (c.langues || []).some((s: string) => norm(s).includes(q))
      )
    }

    return NextResponse.json({ candidats, total: allData.length })
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
