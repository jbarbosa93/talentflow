import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivityServer, getRouteUser } from '@/lib/logActivity'

export async function GET() {
  const supabase = createAdminClient()
  const { user_id } = await getRouteUser()

  const { data, error } = await supabase
    .from('entretiens')
    .select('*, candidats(nom, prenom, email, titre_poste), clients(nom_entreprise)')
    .eq('user_id', user_id)
    .order('date_heure', { ascending: false })
  if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  return NextResponse.json({ entretiens: data || [] })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const supabase = createAdminClient()
    const { user_id } = await getRouteUser()

    // Auto-générer le titre si absent
    if (!body.titre) {
      const candidatNom = body.candidat_nom_manuel || 'Sans nom'
      const poste = body.poste || ''
      body.titre = poste ? `${candidatNom} — ${poste}` : candidatNom
    }

    const { data, error } = await supabase
      .from('entretiens')
      .insert({ ...body, user_id })
      .select('*, candidats(nom, prenom, email), clients(nom_entreprise)')
      .single()
    if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })

    try {
      const routeUser = await getRouteUser()
      const d = data as any
      const candidatNom = d?.candidats
        ? `${d.candidats.prenom || ''} ${d.candidats.nom}`.trim()
        : (body.candidat_nom_manuel || undefined)
      await logActivityServer({
        ...routeUser,
        type: 'entretien_planifie',
        titre: `Entretien planifié — ${body.titre}`,
        description: candidatNom ? `Candidat: ${candidatNom}` : undefined,
        candidat_id: body.candidat_id || undefined,
        candidat_nom: candidatNom,
      })
    } catch (err) { console.warn('[entretiens] logActivity failed:', (err as Error).message) }

    return NextResponse.json({ entretien: data })
  } catch (err) {
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, ...updates } = await request.json()
    const supabase = createAdminClient()
    const { user_id } = await getRouteUser()
    const { data, error } = await supabase
      .from('entretiens')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user_id)
      .select('*, candidats(nom, prenom, email), clients(nom_entreprise)')
      .single()
    if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
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
  const { user_id } = await getRouteUser()
  const { error } = await supabase.from('entretiens').delete().eq('id', id).eq('user_id', user_id)
  if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  return NextResponse.json({ success: true })
}
