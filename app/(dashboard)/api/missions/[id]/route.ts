// app/(dashboard)/api/missions/[id]/route.ts
// PATCH + DELETE pour une mission

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// PATCH /api/missions/[id] — modifier une mission
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const body = await request.json()

    const allowed = [
      'candidat_id', 'client_id',
      'candidat_nom', 'client_nom',
      'metier', 'date_debut', 'date_fin',
      'marge_brute', 'marge_avec_lpp', 'coefficient', 'statut', 'notes', 'absences', 'vacances', 'arrets',
    ]
    const filtered: Record<string, any> = { updated_at: new Date().toISOString() }
    for (const k of allowed) {
      if (k in body) filtered[k] = body[k]
    }

    const { data, error } = await (supabase as any)
      .from('missions')
      .update(filtered)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ mission: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/missions/[id] — supprimer une mission
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const { error } = await (supabase as any)
      .from('missions')
      .delete()
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
