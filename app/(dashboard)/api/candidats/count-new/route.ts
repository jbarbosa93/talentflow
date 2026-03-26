import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const since = request.nextUrl.searchParams.get('since')

    let query = supabase
      .from('candidats')
      .select('id', { count: 'exact', head: true })
      .eq('import_status' as string, 'a_traiter')

    // Si un timestamp "since" est fourni, ne compter que les candidats ajoutés après
    if (since) {
      query = query.gt('created_at', since)
    }

    const { count } = await query
    return NextResponse.json({ count: count || 0 })
  } catch {
    return NextResponse.json({ count: 0 })
  }
}
