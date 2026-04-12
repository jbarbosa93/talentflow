// app/(dashboard)/api/secretariat/logs/route.ts
// GET — récupère les 50 dernières modifications du secrétariat
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data, error } = await (supabase as any)
      .from('logs_secretariat')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error
    return NextResponse.json({ logs: data ?? [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
