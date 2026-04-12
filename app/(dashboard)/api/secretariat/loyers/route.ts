// app/(dashboard)/api/secretariat/loyers/route.ts
// GET + POST pour la table secretariat_loyers

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// GET /api/secretariat/loyers — liste avec filtre optionnel ?annee=2026
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { searchParams } = new URL(request.url)
    const annee = searchParams.get('annee')

    let query = (supabase as any)
      .from('secretariat_loyers')
      .select('*, candidats!candidat_id(photo_url, tel, email)')
      .order('created_at', { ascending: false })

    if (annee) {
      query = query.eq('annee', parseInt(annee, 10))
    }

    const { data, error } = await query
    if (error) throw error

    const rows = (data ?? []).map((row: any) => ({
      ...row,
      photo_url: row.candidats?.photo_url ?? null,
      tel: row.candidats?.tel ?? null,
      email: row.candidats?.email ?? null,
      candidats: undefined,
    }))

    return NextResponse.json({ loyers: rows })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/secretariat/loyers — créer une entrée
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const body = await request.json()

    const { data, error } = await (supabase as any)
      .from('secretariat_loyers')
      .insert(body)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ loyer: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
