// TalentFlow Rapports — Route détail/edit/delete d'un lien (Phase 5)
// v2.2.6
// GET    : détail du lien + template + dernières submissions
// PATCH  : update partiel (title, client_*, status, delivery_channel)
// DELETE : suppression hard (cascade sur submissions)

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhoneE164 } from '@/lib/sign/phone-format'
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
    if (typeof body.status === 'string' && (VALID_STATUS as string[]).includes(body.status)) {
      update.status = body.status
    }
    if (typeof body.delivery_channel === 'string' && (VALID_CHANNELS as string[]).includes(body.delivery_channel)) {
      update.delivery_channel = body.delivery_channel
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
