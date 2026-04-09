import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'j.barbosa@l-agence.ch'

async function requireAdmin(): Promise<NextResponse | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    if (user.email !== ADMIN_EMAIL) return NextResponse.json({ error: 'Accès réservé à l\'administrateur' }, { status: 403 })
    return null
  } catch {
    return NextResponse.json({ error: 'Erreur d\'authentification' }, { status: 500 })
  }
}

export async function GET() {
  const authError = await requireAdmin()
  if (authError) return authError
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('integrations')
    .select('id, type, email, nom_compte, actif, expires_at, metadata, created_at, updated_at')
    .order('created_at', { ascending: false })
  return NextResponse.json({ integrations: data || [] })
}

export async function PATCH(request: Request) {
  const authError = await requireAdmin()
  if (authError) return authError
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
  const authError = await requireAdmin()
  if (authError) return authError
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
  const supabase = createAdminClient()
  await supabase.from('integrations').delete().eq('id', id)
  return NextResponse.json({ success: true })
}
