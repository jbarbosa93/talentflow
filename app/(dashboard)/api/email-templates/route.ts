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
