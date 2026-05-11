// TalentFlow Rapports — Édition / suppression d'une entreprise autorisée (admin)
// v2.4.0 — Phase 1 / v2.4.3 — Ajout PATCH édition inline
//
// DELETE : hard delete. La FK ON DELETE SET NULL sur report_submissions
//          préserve les soumissions historiques (report_link_client_id → NULL).
// PATCH  : édite client_name + client_contact_name + client_email (+ client_phone optionnel).
//          Effet sur les futures soumissions uniquement (les emails déjà envoyés
//          restent en place, mais les NOUVEAUX submits utiliseront les valeurs courantes).

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhoneE164 } from '@/lib/sign/phone-format'

export const runtime = 'nodejs'

interface Ctx {
  params: Promise<{ id: string; clientId: string }>
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const authError = await requireAuth()
  if (authError) return authError

  const { id: linkId, clientId } = await ctx.params
  const supabase = createAdminClient()

  // Vérifie l'appartenance au lien
  const { data: row } = await supabase
    .from('report_link_clients' as any)
    .select('id, link_id')
    .eq('id', clientId)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: 'Entreprise introuvable' }, { status: 404 })
  if ((row as any).link_id !== linkId) return NextResponse.json({ error: 'Mismatch link_id' }, { status: 400 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 }) }

  const patch: Record<string, unknown> = {}

  if (typeof body.client_name === 'string') {
    const v = body.client_name.trim()
    if (!v) return NextResponse.json({ error: 'Nom entreprise requis' }, { status: 400 })
    patch.client_name = v
  }
  if (body.client_contact_name !== undefined) {
    const v = typeof body.client_contact_name === 'string' ? body.client_contact_name.trim() : ''
    patch.client_contact_name = v || null
  }
  if (body.client_email !== undefined) {
    const v = typeof body.client_email === 'string' ? body.client_email.trim().toLowerCase() : ''
    patch.client_email = v || null
  }
  if (body.client_phone !== undefined) {
    const v = typeof body.client_phone === 'string' ? body.client_phone.trim() : ''
    patch.client_phone = v ? normalizePhoneE164(v) : null
  }

  // v2.6.1 — Mission fields
  if (body.mission_contact_name !== undefined) {
    const v = typeof body.mission_contact_name === 'string' ? body.mission_contact_name.trim() : ''
    patch.mission_contact_name = v || null
  }
  if (body.mission_phone !== undefined) {
    const v = typeof body.mission_phone === 'string' ? body.mission_phone.trim() : ''
    patch.mission_phone = v ? normalizePhoneE164(v) : null
  }
  const isoDate = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : null
  if (body.mission_start_date !== undefined) {
    patch.mission_start_date = body.mission_start_date === null ? null : isoDate(body.mission_start_date)
  }
  if (body.mission_end_date !== undefined) {
    patch.mission_end_date = body.mission_end_date === null ? null : isoDate(body.mission_end_date)
  }
  // Validation dates cohérentes (utilise les valeurs finales si fournies, sinon les existantes)
  if (patch.mission_start_date !== undefined || patch.mission_end_date !== undefined) {
    const { data: current } = await supabase
      .from('report_link_clients' as any)
      .select('mission_start_date, mission_end_date')
      .eq('id', clientId)
      .single()
    const start = (patch.mission_start_date !== undefined ? patch.mission_start_date : (current as any)?.mission_start_date) as string | null
    const end = (patch.mission_end_date !== undefined ? patch.mission_end_date : (current as any)?.mission_end_date) as string | null
    if (start && end && end < start) {
      return NextResponse.json({ error: 'La date de fin doit être ≥ date de début' }, { status: 400 })
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('report_link_clients' as any)
    .update(patch)
    .eq('id', clientId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ client: data })
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const authError = await requireAuth()
  if (authError) return authError

  const { id: linkId, clientId } = await ctx.params
  const supabase = createAdminClient()

  // Vérifie l'appartenance au lien (évite delete cross-lien)
  const { data: row } = await supabase
    .from('report_link_clients' as any)
    .select('id, link_id')
    .eq('id', clientId)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: 'Entreprise introuvable' }, { status: 404 })
  if ((row as any).link_id !== linkId) return NextResponse.json({ error: 'Mismatch link_id' }, { status: 400 })

  const { error } = await supabase
    .from('report_link_clients' as any)
    .delete()
    .eq('id', clientId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
