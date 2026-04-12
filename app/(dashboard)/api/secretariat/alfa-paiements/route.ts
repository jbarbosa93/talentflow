// app/(dashboard)/api/secretariat/alfa-paiements/route.ts
// GET + POST pour la table secretariat_alfa_paiements

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// GET /api/secretariat/alfa-paiements — liste avec filtre optionnel ?annee=2026
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { searchParams } = new URL(request.url)
    const annee = searchParams.get('annee')

    let query = (supabase as any)
      .from('secretariat_alfa_paiements')
      .select('*, candidats!candidat_id(photo_url, telephone, email)')
      .order('created_at', { ascending: false })

    if (annee) {
      query = query.eq('annee', parseInt(annee, 10))
    }

    const { data, error } = await query
    if (error) throw error

    const rows = (data ?? []).map((row: any) => ({
      ...row,
      photo_url: row.candidats?.photo_url ?? null,
      tel: row.candidats?.telephone ?? null,
      email: row.candidats?.email ?? null,
      candidats: undefined,
    }))

    return NextResponse.json({ paiements: rows })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/secretariat/alfa-paiements — créer une entrée
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const body = await request.json()

    const { data, error } = await (supabase as any)
      .from('secretariat_alfa_paiements')
      .insert(body)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ paiement: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
