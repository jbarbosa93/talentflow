// app/(dashboard)/api/secretariat/candidats/route.ts
// GET + POST pour la table secretariat_candidats

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// GET /api/secretariat/candidats — liste avec filtre ?annee=2026
// Auto-rollover : un candidat avec is_mission_terminee=false s'affiche pour
// toute année >= annee de création. Un candidat terminé s'affiche pour son
// annee initiale ET l'année où la mission s'est terminée (date_fin_mission).
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { searchParams } = new URL(request.url)
    const anneeParam = searchParams.get('annee')

    let query = (supabase as any)
      .from('secretariat_candidats')
      .select('*, candidats!candidat_id(photo_url, telephone, email)')
      .order('created_at', { ascending: false })

    const { data, error } = await query
    if (error) throw error

    let rows = (data ?? []).map((row: any) => ({
      ...row,
      photo_url: row.candidats?.photo_url ?? null,
      tel: row.candidats?.telephone ?? null,
      email: row.candidats?.email ?? null,
      candidats: undefined,
    }))

    if (anneeParam) {
      const targetYear = parseInt(anneeParam, 10)
      rows = rows.filter((r: any) => {
        const baseYear = Number(r.annee || 0)
        if (baseYear > targetYear) return false // pas créé encore
        // Archivés : on les renvoie quand même au client (le client filtre selon le pill).
        // Mission active : s'affiche pour toute année >= baseYear
        if (!r.is_mission_terminee) {
          return baseYear <= targetYear
        }
        // Mission terminée : s'affiche entre baseYear et année de fin
        const finYear = r.date_fin_mission
          ? new Date(r.date_fin_mission).getFullYear()
          : baseYear
        return targetYear >= baseYear && targetYear <= finYear
      })
    }

    return NextResponse.json({ candidats: rows })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/secretariat/candidats — créer une entrée
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const body = await request.json()

    const { data, error } = await (supabase as any)
      .from('secretariat_candidats')
      .insert(body)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ candidat: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
