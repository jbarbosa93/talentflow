// TalentFlow Sign — CRUD un template
// v2.2.0 — Phase 1
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth()
  if (authError) return authError

  const { id } = await ctx.params
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('sign_templates' as any)
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Template introuvable' }, { status: 404 })
  return NextResponse.json({ template: data })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth()
  if (authError) return authError

  const { id } = await ctx.params
  try {
    const body = await req.json()
    const allowed: Record<string, unknown> = {}
    for (const k of ['name', 'description', 'documents', 'recipients_schema', 'wizard_enabled', 'wizard_steps'] as const) {
      if (k in body) allowed[k] = body[k]
    }
    if (Object.keys(allowed).length === 0) {
      return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('sign_templates' as any)
      .update(allowed)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    return NextResponse.json({ template: data })
  } catch {
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth()
  if (authError) return authError

  const { id } = await ctx.params
  const supabase = createAdminClient()
  const { error } = await supabase.from('sign_templates' as any).delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
