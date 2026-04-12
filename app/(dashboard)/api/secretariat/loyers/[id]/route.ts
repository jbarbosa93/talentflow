// app/(dashboard)/api/secretariat/loyers/[id]/route.ts
// PATCH + DELETE pour un secretariat_loyers

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// PATCH /api/secretariat/loyers/[id] — modifier
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const body = await request.json()

    const { data, error } = await (supabase as any)
      .from('secretariat_loyers')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ loyer: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/secretariat/loyers/[id] — supprimer
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const { error } = await (supabase as any)
      .from('secretariat_loyers')
      .delete()
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
