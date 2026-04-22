import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export async function GET(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError
  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')
  let query = supabase.from('email_templates').select('*').order('nom')
  // v1.9.68 : support du canal 'whatsapp' en plus d'email/sms.
  // Cast : types Supabase auto-générés ne contiennent pas encore 'whatsapp' (CHECK étendu côté DB).
  if (type === 'email' || type === 'sms' || type === 'whatsapp') {
    query = query.eq('type', type as any)
  }
  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  return NextResponse.json({ templates: data || [] })
}

export async function POST(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError
  try {
    const body = await request.json()
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('email_templates')
      .insert(body)
      .select()
      .single()
    if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    return NextResponse.json({ template: data })
  } catch {
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 })
  }
}

// v1.9.83 — PATCH pour édition in-place des templates existants
export async function PATCH(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
  try {
    const body = await request.json()
    // Whitelist des colonnes modifiables
    const allowed: Record<string, any> = {}
    for (const key of ['nom', 'sujet', 'corps', 'type', 'categorie'] as const) {
      if (key in body) allowed[key] = body[key]
    }
    if (Object.keys(allowed).length === 0) {
      return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 })
    }
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('email_templates')
      .update(allowed)
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ template: data })
  } catch {
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
  const supabase = createAdminClient()
  const { error } = await supabase.from('email_templates').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  return NextResponse.json({ success: true })
}
