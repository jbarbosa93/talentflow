import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const supabase = createAdminClient()
    const { count } = await supabase
      .from('candidats')
      .select('id', { count: 'exact', head: true })
      .eq('import_status' as string, 'a_traiter')
    return NextResponse.json({ count: count || 0 })
  } catch {
    return NextResponse.json({ count: 0 })
  }
}
