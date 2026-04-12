import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export async function GET(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  const supabase = createAdminClient()
  const url = new URL(request.url)
  const limit = Math.min(Number(url.searchParams.get('limit') || 100), 1000)
  const offset = Number(url.searchParams.get('offset') || 0)
  const action = url.searchParams.get('action') || '' // filter by action type
  const actions = url.searchParams.get('actions') || '' // comma-separated action types

  let query = supabase
    .from('logs_activite')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (action) {
    query = query.eq('action', action)
  } else if (actions) {
    query = query.in('action', actions.split(','))
  }

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  return NextResponse.json({ data, total: count || 0 })
}
