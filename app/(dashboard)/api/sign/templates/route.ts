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
  // v2.8.0 — On RENVOIE tous les templates (ad-hoc inclus) pour que le lookup
  // côté front (templates.find(...)) trouve aussi les ad-hoc liés à un brouillon
  // en cours d'édition. Le FILTRAGE pour masquer les ad-hoc se fait côté front
  // (dropdown /sign/new + liste /sign/templates) via `parent_template_id`.
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

    // v2.2.6 Phase 5 — kind=envelope (défaut) ou 'report' (rapport hebdo).
    // Si kind='report' et recipients_schema vide, on pré-remplit avec 2 rôles fixes
    // (Candidat order=1, Client order=2) — c'est la structure obligatoire d'un rapport.
    const kind: 'envelope' | 'report' = body.kind === 'report' ? 'report' : 'envelope'
    const providedSchema = Array.isArray(body.recipients_schema) ? body.recipients_schema : []
    const recipientsSchema = providedSchema.length > 0
      ? providedSchema
      : (kind === 'report'
          ? [
              { role: 'signer', order: 1, roleName: 'Candidat',
                preferredViewMode: 'wizard' },
              { role: 'signer', order: 2, roleName: 'Client',
                preferredViewMode: 'document' },
            ]
          : [])

    // v2.8.0 — Catégorie fonctionnelle (mappe / contrat / report). Détermine
    // les comportements UX spécifiques (ex: contrat → header L-Agence auto à
    // l'upload des PDFs source, géré côté CreateTemplateModal qui passe le flag
    // letterhead='lagence' à /api/sign/upload).
    const VALID_CATEGORIES = ['mappe', 'contrat', 'report'] as const
    const templateCategory = typeof body.template_category === 'string'
      && (VALID_CATEGORIES as readonly string[]).includes(body.template_category)
        ? body.template_category
        : null

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('sign_templates' as any)
      .insert({
        name: body.name.trim(),
        description: body.description?.trim() || null,
        documents: body.documents ?? [],
        recipients_schema: recipientsSchema,
        created_by: user?.id || null,
        kind,
        template_category: templateCategory,
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
