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

export async function PATCH(request: Request) {
  const body = await request.json()
  const { id, metadata, type, metadata_update } = body
  const supabase = createAdminClient()

  // Support partial metadata update by integration type
  if (type && metadata_update) {
    const { data: integration } = await supabase.from('integrations').select('id, metadata').eq('type', type).maybeSingle()
    if (!integration) return NextResponse.json({ error: 'Intégration introuvable' }, { status: 404 })
    const currentMeta = (integration.metadata as any) || {}
    const { error } = await supabase.from('integrations').update({
      metadata: { ...currentMeta, ...metadata_update },
      updated_at: new Date().toISOString(),
    }).eq('id', integration.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // Original: update by id with full metadata
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
  const { error } = await supabase.from('integrations').update({ metadata, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
  const supabase = createAdminClient()
  await supabase.from('integrations').delete().eq('id', id)
  return NextResponse.json({ success: true })
}
