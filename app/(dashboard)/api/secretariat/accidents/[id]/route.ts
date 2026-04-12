// app/(dashboard)/api/secretariat/accidents/[id]/route.ts
// PATCH + DELETE pour un secretariat_accidents

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logSecretariat, diffChanges } from '@/lib/log-secretariat'

export const runtime = 'nodejs'

// PATCH /api/secretariat/accidents/[id] — modifier
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const { data: before } = await (supabase as any)
      .from('secretariat_accidents')
      .select('*')
      .eq('id', id)
      .single()

    const body = await request.json()

    const { data, error } = await (supabase as any)
      .from('secretariat_accidents')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    if (before) {
      const diff = diffChanges(before, body)
      if (diff) {
        await logSecretariat({
          supabase: supabase as any,
          action: 'update',
          table: 'secretariat_accidents',
          referenceId: id,
          nomCandidat: [before.nom, before.prenom].filter(Boolean).join(' '),
          champsModifies: diff,
        })
      }
    }

    return NextResponse.json({ accident: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/secretariat/accidents/[id] — supprimer
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const { data: before } = await (supabase as any)
      .from('secretariat_accidents')
      .select('nom, prenom')
      .eq('id', id)
      .single()

    const { error } = await (supabase as any)
      .from('secretariat_accidents')
      .delete()
      .eq('id', id)

    if (error) throw error

    await logSecretariat({
      supabase: supabase as any,
      action: 'delete',
      table: 'secretariat_accidents',
      referenceId: id,
      nomCandidat: before ? [before.nom, before.prenom].filter(Boolean).join(' ') : null,
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
