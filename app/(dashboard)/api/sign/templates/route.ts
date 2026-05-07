// TalentFlow Sign — Routes templates (liste + création)
// v2.2.0 — Phase 1
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth-guard'

export async function GET() {
  const authError = await requireAuth()
  if (authError) return authError

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('sign_templates' as any)
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[sign/templates] GET error', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
  return NextResponse.json({ templates: data || [] })
}

export async function POST(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const body = await request.json()
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json({ error: 'name requis' }, { status: 400 })
    }

    const server = await createServerClient()
    const { data: { user } } = await server.auth.getUser()

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('sign_templates' as any)
      .insert({
        name: body.name.trim(),
        description: body.description?.trim() || null,
        documents: body.documents ?? [],
        recipients_schema: body.recipients_schema ?? [],
        created_by: user?.id || null,
      })
      .select()
      .single()

    if (error) {
      console.error('[sign/templates] POST error', error)
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
    return NextResponse.json({ template: data })
  } catch (e) {
    console.error('[sign/templates] POST exception', e)
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 })
  }
}
