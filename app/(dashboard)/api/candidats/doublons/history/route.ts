// GET /api/candidats/doublons/history — charge l'historique depuis DB
// POST /api/candidats/doublons/history — ajoute une entrée (dismissed ou merged)
// DELETE /api/candidats/doublons/history — supprime une entrée dismissed (pour réanalyser)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRouteUser } from '@/lib/logActivity'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const admin = createAdminClient()
    const { data, error } = await (admin as any)
      .from('doublons_historique')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) throw error
    return NextResponse.json({ history: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = createAdminClient()
    const body = await request.json()
    const { candidat_a_id, candidat_b_id, candidat_a_nom, candidat_b_nom, action, score, raisons, merged_keep_id } = body

    if (!candidat_a_id || !candidat_b_id || !action) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
    }

    // Normaliser l'ordre des IDs pour éviter les doublons
    const [sortedA, sortedB] = [candidat_a_id, candidat_b_id].sort()

    let userId: string | null = null
    try {
      const routeUser = await getRouteUser()
      userId = routeUser.user_id || null
    } catch {}

    const { data, error } = await (admin as any)
      .from('doublons_historique')
      .insert({
        candidat_a_id: sortedA,
        candidat_b_id: sortedB,
        candidat_a_nom: candidat_a_nom || '',
        candidat_b_nom: candidat_b_nom || '',
        action,
        score: score || null,
        raisons: raisons || null,
        merged_keep_id: merged_keep_id || null,
        user_id: userId,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, entry: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = createAdminClient()
    const { candidat_a_id, candidat_b_id } = await request.json()

    if (!candidat_a_id || !candidat_b_id) {
      return NextResponse.json({ error: 'IDs requis' }, { status: 400 })
    }

    const [sortedA, sortedB] = [candidat_a_id, candidat_b_id].sort()

    const { error } = await (admin as any)
      .from('doublons_historique')
      .delete()
      .eq('candidat_a_id', sortedA)
      .eq('candidat_b_id', sortedB)
      .eq('action', 'dismissed')

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
