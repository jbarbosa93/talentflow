import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivityServer, getRouteUser } from '@/lib/logActivity'

export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('entretiens')
    .select('*, candidats(nom, prenom, email, titre_poste), offres(titre)')
    .order('date_heure', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entretiens: data || [] })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('entretiens')
      .insert(body)
      .select('*, candidats(nom, prenom, email), offres(titre)')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Log activité équipe
    try {
      const routeUser = await getRouteUser()
      const d = data as any
      const candidatNom = d?.candidats
        ? `${d.candidats.prenom || ''} ${d.candidats.nom}`.trim()
        : undefined
      await logActivityServer({
        ...routeUser,
        type: 'entretien_planifie',
        titre: `Entretien planifié — ${body.titre || 'Sans titre'}`,
        description: candidatNom ? `Candidat: ${candidatNom}` : undefined,
        candidat_id: body.candidat_id || undefined,
        candidat_nom: candidatNom,
        offre_id: body.offre_id || undefined,
      })
    } catch {}

    return NextResponse.json({ entretien: data })
  } catch (err) {
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, ...updates } = await request.json()
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('entretiens')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ entretien: data })
  } catch (err) {
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
  const supabase = createAdminClient()
  const { error } = await supabase.from('entretiens').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
