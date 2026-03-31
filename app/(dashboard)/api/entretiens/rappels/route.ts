import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/entretiens/rappels
// Retourne les rappels actifs (rappel_date <= aujourd'hui, rappel_vu = false)
export async function GET() {
  const supabase = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('entretiens')
    .select('id, titre, candidat_id, candidat_nom_manuel, entreprise_nom, poste, date_heure, rappel_date, candidats(nom, prenom)')
    .not('rappel_date', 'is', null)
    .eq('rappel_vu', false)
    .lte('rappel_date', today)
    .order('rappel_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rappels: data || [] })
}

// PATCH /api/entretiens/rappels
// body: { id: string } ou { ids: string[] } — marque comme vu
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const supabase = createAdminClient()

    const ids: string[] = body.ids || (body.id ? [body.id] : [])
    if (!ids.length) return NextResponse.json({ error: 'id(s) requis' }, { status: 400 })

    const { error } = await supabase
      .from('entretiens')
      .update({ rappel_vu: true, updated_at: new Date().toISOString() })
      .in('id', ids)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 })
  }
}
