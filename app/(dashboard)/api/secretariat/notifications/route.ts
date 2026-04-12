// app/(dashboard)/api/secretariat/notifications/route.ts
// GET + POST pour la table secretariat_notifications

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// GET /api/secretariat/notifications — non lues par défaut, ?all=true pour toutes
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { searchParams } = new URL(request.url)
    const all = searchParams.get('all') === 'true'

    let query = (supabase as any)
      .from('secretariat_notifications')
      .select('*')
      .order('created_at', { ascending: false })

    if (!all) {
      query = query.eq('lue', false)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ notifications: data ?? [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/secretariat/notifications — créer une notification (avec dédup serveur)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const body = await request.json()

    // Déduplication côté serveur : si reference_id + type déjà existant → skip
    if (body.reference_id && body.type) {
      const { data: existing } = await (supabase as any)
        .from('secretariat_notifications')
        .select('id')
        .eq('reference_id', String(body.reference_id))
        .eq('type', body.type)
        .limit(1)

      if (existing && existing.length > 0) {
        return NextResponse.json({ notification: existing[0], deduplicated: true })
      }
    }

    const { data, error } = await (supabase as any)
      .from('secretariat_notifications')
      .insert({ lue: false, ...body })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ notification: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
