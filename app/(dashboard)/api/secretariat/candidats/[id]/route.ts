// app/(dashboard)/api/secretariat/candidats/[id]/route.ts
// PATCH + DELETE pour un secretariat_candidats

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logSecretariat, diffChanges } from '@/lib/log-secretariat'

export const runtime = 'nodejs'

// PATCH /api/secretariat/candidats/[id] — modifier
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    // Récupérer l'état avant modification
    const { data: before } = await (supabase as any)
      .from('secretariat_candidats')
      .select('*')
      .eq('id', id)
      .single()

    const body = await request.json()

    const { data, error } = await (supabase as any)
      .from('secretariat_candidats')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // Logger la modification
    if (before) {
      const diff = diffChanges(before, body)
      if (diff) {
        await logSecretariat({
          supabase: supabase as any,
          action: 'update',
          table: 'secretariat_candidats',
          referenceId: id,
          nomCandidat: [before.nom, before.prenom].filter(Boolean).join(' '),
          champsModifies: diff,
        })
      }
    }

    return NextResponse.json({ candidat: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/secretariat/candidats/[id] — supprimer
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    // Récupérer le nom avant suppression
    const { data: before } = await (supabase as any)
      .from('secretariat_candidats')
      .select('nom, prenom')
      .eq('id', id)
      .single()

    const { error } = await (supabase as any)
      .from('secretariat_candidats')
      .delete()
      .eq('id', id)

    if (error) throw error

    await logSecretariat({
      supabase: supabase as any,
      action: 'delete',
      table: 'secretariat_candidats',
      referenceId: id,
      nomCandidat: before ? [before.nom, before.prenom].filter(Boolean).join(' ') : null,
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
