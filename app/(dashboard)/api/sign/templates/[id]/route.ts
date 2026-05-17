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
    // v2.2.6 Phase 5 — `kind` ajouté pour pouvoir convertir un template existant
    // de 'envelope' à 'report' (ou inverse) depuis le menu actions /sign/templates.
    for (const k of ['name', 'description', 'documents', 'recipients_schema', 'wizard_enabled', 'wizard_steps', 'kind', 'default_message'] as const) {
      if (k in body) {
        // Validation kind : doit être 'envelope' ou 'report'
        if (k === 'kind' && body.kind !== 'envelope' && body.kind !== 'report') {
          return NextResponse.json({ error: 'kind invalide (envelope|report)' }, { status: 400 })
        }
        allowed[k] = body[k]
      }
    }
    if (Object.keys(allowed).length === 0) {
      return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // v2.8.11 — GARDE-FOU SERVEUR ANTI-ÉCRASEMENT (incident 17/05/2026 14:56) :
    // Si le PATCH tente de remplacer documents/wizard_steps/recipients_schema par
    // un tableau vide alors que la DB en contient, on REFUSE (409 Conflict).
    // Force le client à confirmer explicitement via ?confirm_wipe=1.
    const wipeKeys = ['documents', 'wizard_steps', 'recipients_schema'] as const
    const incomingWipes: string[] = []
    for (const k of wipeKeys) {
      if (k in allowed && Array.isArray(allowed[k]) && (allowed[k] as unknown[]).length === 0) {
        incomingWipes.push(k)
      }
    }
    if (incomingWipes.length > 0) {
      const url = new URL(req.url)
      const confirmed = url.searchParams.get('confirm_wipe') === '1'
      if (!confirmed) {
        const { data: existing } = await supabase
          .from('sign_templates' as any)
          .select('documents, wizard_steps, recipients_schema')
          .eq('id', id)
          .single()
        const existingCounts: Record<string, number> = {
          documents: Array.isArray((existing as any)?.documents) ? (existing as any).documents.length : 0,
          wizard_steps: Array.isArray((existing as any)?.wizard_steps) ? (existing as any).wizard_steps.length : 0,
          recipients_schema: Array.isArray((existing as any)?.recipients_schema) ? (existing as any).recipients_schema.length : 0,
        }
        const conflicts = incomingWipes.filter(k => (existingCounts[k] || 0) > 0)
        if (conflicts.length > 0) {
          console.error('[Sign][SAFEGUARD] Blocked wipe PATCH', { id, conflicts, existingCounts })
          return NextResponse.json({
            error: 'Écrasement bloqué',
            details: `Le PATCH tente de vider ${conflicts.join(', ')} alors que la DB contient du contenu. Ajoute ?confirm_wipe=1 si intentionnel.`,
            conflicts,
            existingCounts,
          }, { status: 409 })
        }
      }
    }

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
