import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('integrations')
    .select('id, type, email, nom_compte, actif, expires_at, metadata, created_at, updated_at')
    .order('created_at', { ascending: false })
  return NextResponse.json({ integrations: data || [] })
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
  const supabase = createAdminClient()
  await supabase.from('integrations').delete().eq('id', id)
  return NextResponse.json({ success: true })
}
