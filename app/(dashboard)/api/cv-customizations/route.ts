// app/(dashboard)/api/cv-customizations/route.ts
// GET/PUT/DELETE des customisations CV par consultant (isolation RLS + filtre explicite)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'

// GET /api/cv-customizations?candidat_id=X
export async function GET(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const candidatId = searchParams.get('candidat_id')
    if (!candidatId) return NextResponse.json({ error: 'candidat_id requis' }, { status: 400 })

    const { data, error } = await (supabase as any)
      .from('cv_customizations')
      .select('id, data, updated_at')
      .eq('candidat_id', candidatId)
      .eq('consultant_id', user.id)
      .maybeSingle()

    if (error) throw error

    return NextResponse.json({ customization: data ?? null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PUT /api/cv-customizations — upsert par (candidat_id, consultant_id)
export async function PUT(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const body = await request.json()
    const { candidat_id, data } = body
    if (!candidat_id || !data) {
      return NextResponse.json({ error: 'candidat_id et data requis' }, { status: 400 })
    }

    const { data: upserted, error } = await (supabase as any)
      .from('cv_customizations')
      .upsert(
        { candidat_id, consultant_id: user.id, data, updated_at: new Date().toISOString() },
        { onConflict: 'candidat_id,consultant_id' }
      )
      .select('id, data, updated_at')
      .single()

    if (error) throw error
    return NextResponse.json({ customization: upserted })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/cv-customizations?candidat_id=X — reset au candidat
export async function DELETE(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const candidatId = searchParams.get('candidat_id')
    if (!candidatId) return NextResponse.json({ error: 'candidat_id requis' }, { status: 400 })

    const { error } = await (supabase as any)
      .from('cv_customizations')
      .delete()
      .eq('candidat_id', candidatId)
      .eq('consultant_id', user.id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
