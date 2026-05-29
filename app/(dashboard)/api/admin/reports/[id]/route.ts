// TalentFlow Rapports — Route détail/edit/delete d'un lien (Phase 5)
// v2.2.6
// GET    : détail du lien + template + dernières submissions
// PATCH  : update partiel (title, client_*, status, delivery_channel)
// DELETE : suppression hard (cascade sur submissions)

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhoneE164 } from '@/lib/sign/phone-format'
import { getOrCreateClientPortal } from '@/lib/report/portal-helper'
import { createClient as createServerClient } from '@/lib/supabase/server'
import type { ReportDeliveryChannel, ReportLinkStatus } from '@/lib/report/types'

export const runtime = 'nodejs'

const VALID_CHANNELS: ReportDeliveryChannel[] = ['email', 'whatsapp', 'both']
const VALID_STATUS: ReportLinkStatus[] = ['active', 'paused', 'revoked']

interface Ctx {
  // v2.2.6 — Routes dashboard sous /api/admin/reports/[id] (namespace distinct
  // de /api/reports/[slug] côté public, plus de conflit Next.js).
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const authError = await requireAuth()
  if (authError) return authError

  const { id } = await ctx.params
  const supabase = createAdminClient()

  const { data: link } = await supabase
    .from('report_links' as any)
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (!link) return NextResponse.json({ error: 'Lien introuvable' }, { status: 404 })

  return NextResponse.json({ link })
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const authError = await requireAuth()
  if (authError) return authError

  const { id } = await ctx.params
  const supabase = createAdminClient()

  try {
    const body = await req.json()
    const update: Record<string, unknown> = {}

    if (typeof body.title === 'string' && body.title.trim()) {
      update.title = body.title.trim()
    }
    if (body.candidat_name !== undefined) {
      // v2.3.x — Permet update du nom candidat saisi (correction typo, ajout de nom à un lien existant)
      update.candidat_name = body.candidat_name?.trim() || null
    }
    if (body.client_name !== undefined) {
      update.client_name = body.client_name?.trim() || null
    }
    if (body.client_contact_name !== undefined) {
      // v2.3.x — Update du nom contact client (peut être ajouté rétroactivement)
      update.client_contact_name = body.client_contact_name?.trim() || null
    }
    if (body.client_email !== undefined) {
      update.client_email = body.client_email?.toLowerCase().trim() || null
    }
    if (body.client_phone !== undefined) {
      const norm = body.client_phone ? normalizePhoneE164(body.client_phone) : null
      update.client_phone = norm
    }
    if (body.candidat_phone !== undefined) {
      // v2.3.x — Phone candidat (E.164 normalisé)
      const norm = body.candidat_phone ? normalizePhoneE164(body.candidat_phone) : null
      update.candidat_phone = norm
    }
    if (body.candidat_email !== undefined) {
      // v2.3.7 — Email candidat (optionnel)
      update.candidat_email = body.candidat_email?.toLowerCase().trim() || null
    }
    if (typeof body.status === 'string' && (VALID_STATUS as string[]).includes(body.status)) {
      update.status = body.status
    }
    if (typeof body.delivery_channel === 'string' && (VALID_CHANNELS as string[]).includes(body.delivery_channel)) {
      update.delivery_channel = body.delivery_channel
    }

    // v2.7.3 — Toggle "Utiliser portail rapports"
    // Si activation → vérifie qu'un client_id est lié via report_link_clients
    // et auto-create le portail si besoin (Q4=B).
    if (typeof body.use_client_portal === 'boolean') {
      if (body.use_client_portal) {
        const { data: rlc } = await (supabase as any)
          .from('report_link_clients')
          .select('client_id')
          .eq('link_id', id)
          .not('client_id', 'is', null)
          .limit(1)
          .maybeSingle()
        const clientId = rlc?.client_id as string | null | undefined
        if (!clientId) {
          return NextResponse.json({
            error: 'Pour activer le portail rapports, l\'entreprise doit être liée en DB clients (via l\'autocomplete dans "Entreprises autorisées").',
          }, { status: 400 })
        }
        const server = await createServerClient()
        const { data: { user } } = await server.auth.getUser()
        const portal = await getOrCreateClientPortal(clientId, user?.id || null)
        if (!portal) {
          return NextResponse.json({ error: 'Impossible de créer le portail.' }, { status: 500 })
        }
      }
      update.use_client_portal = body.use_client_portal
    }
    // v2.9.0 — toggle auth_required (accès protégé par email + mot de passe)
    if (typeof body.auth_required === 'boolean') {
      update.auth_required = body.auth_required
    }
    // v2.9.9 — Lier/délier une mission a posteriori (avant : uniquement à la création)
    if (body.mission_id !== undefined) {
      update.mission_id = body.mission_id || null
    }

    // v2.9.79 — Changer le template du lien rapport (les nouveaux rapports utiliseront ce
    // template ; les soumissions déjà signées conservent leur ancien template, c'est voulu).
    if (typeof body.template_id === 'string' && body.template_id.trim()) {
      const { data: tpl } = await supabase
        .from('sign_templates' as any)
        .select('id, kind')
        .eq('id', body.template_id.trim())
        .maybeSingle()
      if (!tpl) {
        return NextResponse.json({ error: 'Template introuvable' }, { status: 400 })
      }
      if ((tpl as any).kind !== 'report') {
        return NextResponse.json({ error: 'Ce template n\'est pas un template de rapport' }, { status: 400 })
      }
      update.template_id = body.template_id.trim()
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Aucune donnée à mettre à jour' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('report_links' as any)
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[reports/PATCH]', error)
      return NextResponse.json({ error: 'Erreur mise à jour' }, { status: 500 })
    }
    return NextResponse.json({ link: data })
  } catch (e) {
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const authError = await requireAuth()
  if (authError) return authError

  const { id } = await ctx.params
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('report_links' as any)
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[reports/DELETE]', error)
    return NextResponse.json({ error: 'Erreur suppression' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
