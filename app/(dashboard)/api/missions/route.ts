// app/(dashboard)/api/missions/route.ts
// GET + POST pour la table missions

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// GET /api/missions — liste avec filtres optionnels
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { searchParams } = new URL(request.url)
    const statut = searchParams.get('statut') // 'en_cours' | 'terminee' | 'annulee' | null = toutes
    const mois = searchParams.get('mois') // 'YYYY-MM' pour filtrer par mois

    let query = (supabase as any)
      .from('missions')
      .select('*, candidats!candidat_id(photo_url), clients!client_id(canton)')
      .order('date_debut', { ascending: false })

    if (statut) {
      query = query.eq('statut', statut)
    }

    if (mois) {
      // Missions dont la période chevauche le mois donné
      const [year, month] = mois.split('-').map(Number)
      const debut = new Date(year, month - 1, 1).toISOString().slice(0, 10)
      const fin = new Date(year, month, 0).toISOString().slice(0, 10)
      // date_debut <= fin_du_mois AND (date_fin >= debut_du_mois OR date_fin IS NULL)
      query = query.lte('date_debut', fin).or(`date_fin.gte.${debut},date_fin.is.null`)
    }

    const { data, error } = await query
    if (error) throw error

    const missions = (data ?? []).map((m: any) => ({
      ...m,
      photo_url: m.candidats?.photo_url || null,
      client_canton: m.clients?.canton || null,
      candidats: undefined,
      clients: undefined,
    }))

    // Calcul des stats agrégées
    const enMission = missions.filter((m: any) => m.statut === 'en_cours')
    const stats = {
      total_en_cours: enMission.length,
      total_sans_emploi: missions.filter((m: any) => m.statut === 'annulee').length,
      // total_etp = somme des coefficients (1 candidat plein temps = 1, mi-temps = 0.5)
      total_etp: enMission.reduce((sum: number, m: any) => sum + Number(m.coefficient || 1), 0),
      // marge_moyenne = marge moyenne par mission En Mission
      marge_moyenne: (() => {
        if (!enMission.length) return 0
        return enMission.reduce((sum: number, m: any) => sum + Number(m.marge_brute || 0), 0) / enMission.length
      })(),
      marge_en_cours: enMission.reduce((sum: number, m: any) => sum + Number(m.marge_brute || 0), 0),
    }

    return NextResponse.json({ missions, stats })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/missions — créer une mission
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const body = await request.json()
    const {
      candidat_id, client_id,
      candidat_nom, client_nom,
      metier, date_debut, date_fin,
      marge_brute, coefficient, statut, notes,
    } = body

    if (!date_debut) {
      return NextResponse.json({ error: 'date_debut requis' }, { status: 400 })
    }
    if (marge_brute === undefined || marge_brute === null || marge_brute === '') {
      return NextResponse.json({ error: 'marge_brute requise' }, { status: 400 })
    }

    const { data, error } = await (supabase as any)
      .from('missions')
      .insert({
        candidat_id: candidat_id || null,
        client_id: client_id || null,
        candidat_nom: candidat_nom || null,
        client_nom: client_nom || null,
        metier: metier || null,
        date_debut,
        date_fin: date_fin || null,
        marge_brute: Number(marge_brute),
        marge_avec_lpp: body.marge_avec_lpp != null && body.marge_avec_lpp !== '' ? Number(body.marge_avec_lpp) : null,
        coefficient: Number(coefficient ?? 1),
        statut: statut || 'en_cours',
        notes: notes || null,
        absences: body.absences ?? [],
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ mission: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
