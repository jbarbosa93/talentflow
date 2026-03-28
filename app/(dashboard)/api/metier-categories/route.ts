import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'metier_categories')
    .single()

  const noCache = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

  if (error || !data) {
    return NextResponse.json({ categories: [] }, { headers: noCache })
  }

  let categories: any[]
  if (Array.isArray(data.value)) {
    categories = data.value
  } else if (typeof data.value === 'string') {
    try { categories = JSON.parse(data.value) } catch { categories = [] }
  } else {
    categories = []
  }

  return NextResponse.json({ categories }, { headers: noCache })
}

export async function PUT(request: NextRequest) {
  const supabase = createAdminClient()
  const { categories } = await request.json()

  if (!Array.isArray(categories)) {
    return NextResponse.json({ error: 'categories must be an array' }, { status: 400 })
  }

  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'metier_categories', value: categories })

  if (error) {
    console.error('[metier-categories] PUT error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ categories, saved: true })
}
