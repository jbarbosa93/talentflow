// app/(dashboard)/api/pipeline/rappels/route.ts
// CRUD pour les rappels pipeline

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// GET /api/pipeline/rappels — rappels du user connecté uniquement (ou ?candidat_id=xxx)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const candidatId = searchParams.get('candidat_id')
    // v1.9.84 — `?notif=1` filtre pour la cloche TopBar : uniquement actifs (done=false)
    // ET non-fermés aujourd'hui (last_dismissed_at < today). Daily reminder.
    const notifMode = searchParams.get('notif') === '1'

    let query = (supabase as any)
      .from('pipeline_rappels')
      .select('*, candidats(id, nom, prenom, photo_url)')
      .eq('user_id', user.id)  // isolation par consultant (ceinture + bretelles avec RLS)
      .order('rappel_at', { ascending: true })

    if (candidatId) {
      query = query.eq('candidat_id', candidatId)
    }

    if (notifMode) {
      const today = new Date().toISOString().split('T')[0]
      const startOfToday = `${today}T00:00:00.000Z`
      query = query
        .eq('done', false)
        .lte('rappel_at', new Date().toISOString())
        .or(`last_dismissed_at.is.null,last_dismissed_at.lt.${startOfToday}`)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ rappels: data ?? [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/pipeline/rappels — créer un rappel
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const body = await request.json()
    const { candidat_id, rappel_at, note } = body

    if (!candidat_id || !rappel_at) {
      return NextResponse.json({ error: 'candidat_id et rappel_at requis' }, { status: 400 })
    }

    const { data, error } = await (supabase as any)
      .from('pipeline_rappels')
      .insert({ candidat_id, rappel_at, note: note || null, user_id: user.id })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ rappel: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH /api/pipeline/rappels — marquer done ou modifier
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    // v1.9.84 — `last_dismissed_at` ajoutée aux colonnes modifiables (action "Fermer" du toast cloche).
    const allowed = ['done', 'rappel_at', 'note', 'last_dismissed_at']
    const filtered: Record<string, any> = {}
    for (const k of allowed) {
      if (k in updates) filtered[k] = updates[k]
    }

    const { data, error } = await (supabase as any)
      .from('pipeline_rappels')
      .update(filtered)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ rappel: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/pipeline/rappels — supprimer un rappel
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { id } = body

    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const { error } = await (supabase as any)
      .from('pipeline_rappels')
      .delete()
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
