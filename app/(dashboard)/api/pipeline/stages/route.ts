import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  try {
    const { stages } = await request.json()
    if (!Array.isArray(stages)) {
      return NextResponse.json({ error: 'stages doit être un tableau' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const value = JSON.stringify(stages)

    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'pipeline_stages', value: value as unknown as never })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erreur serveur' }, { status: 500 })
  }
}
