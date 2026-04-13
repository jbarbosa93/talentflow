// app/(dashboard)/api/activites/[id]/route.ts
// PATCH /api/activites/:id  — update notes
// DELETE /api/activites/:id — delete activity

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth()
  if (authError) return authError
  try {
    const { id } = await params
    const body = await request.json()
    const supabase = createAdminClient() as any

    // Only allow updating notes
    const { notes } = body
    if (typeof notes !== 'string') {
      return NextResponse.json({ error: 'notes (string) est requis' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('activites')
      .update({ notes: notes || null })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ activite: data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth()
  if (authError) return authError
  try {
    const { id } = await params
    const supabase = createAdminClient() as any

    const { error } = await supabase
      .from('activites')
      .delete()
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
