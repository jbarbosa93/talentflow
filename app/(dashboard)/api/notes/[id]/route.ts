// app/(dashboard)/api/notes/[id]/route.ts
// PATCH /api/notes/:id — modifier une note
// DELETE /api/notes/:id — supprimer une note

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { contenu } = await request.json()
    if (!contenu?.trim()) {
      return NextResponse.json({ error: 'contenu requis' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('notes_candidat')
      .update({ contenu: contenu.trim() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ note: data })
  } catch (error: any) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = createAdminClient()
    const { error } = await supabase
      .from('notes_candidat')
      .delete()
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
