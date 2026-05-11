// TalentFlow Rapports — Entreprises autorisées par lien (admin)
// v2.4.0 — Phase 1
// GET  : liste les entreprises associées au lien (ordre display_order ASC)
// POST : ajoute une entreprise (lookup client_id optionnel, normalize phone)

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhoneE164 } from '@/lib/sign/phone-format'

export const runtime = 'nodejs'

interface Ctx {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const authError = await requireAuth()
  if (authError) return authError

  const { id } = await ctx.params
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('report_link_clients' as any)
    .select('*')
    .eq('link_id', id)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ clients: data || [] })
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const authError = await requireAuth()
  if (authError) return authError

  const { id: linkId } = await ctx.params
  const supabase = createAdminClient()

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 }) }

  const clientName = typeof body.client_name === 'string' ? body.client_name.trim() : ''
  if (!clientName) return NextResponse.json({ error: 'Nom entreprise requis' }, { status: 400 })

  const clientId = typeof body.client_id === 'string' && body.client_id.trim() ? body.client_id.trim() : null
  const clientEmail = typeof body.client_email === 'string' ? body.client_email.trim().toLowerCase() || null : null
  const clientContact = typeof body.client_contact_name === 'string' ? body.client_contact_name.trim() || null : null
  const clientPhoneRaw = typeof body.client_phone === 'string' ? body.client_phone.trim() : ''
  const clientPhone = clientPhoneRaw ? normalizePhoneE164(clientPhoneRaw) : null

  const displayOrder = Number.isFinite(body.display_order) ? Math.max(0, Math.floor(body.display_order)) : 0

  // Vérifie que le lien existe
  const { data: linkExists } = await supabase
    .from('report_links' as any)
    .select('id')
    .eq('id', linkId)
    .maybeSingle()
  if (!linkExists) return NextResponse.json({ error: 'Lien introuvable' }, { status: 404 })

  const { data, error } = await supabase
    .from('report_link_clients' as any)
    .insert({
      link_id: linkId,
      client_id: clientId,
      client_name: clientName,
      client_email: clientEmail,
      client_contact_name: clientContact,
      client_phone: clientPhone,
      display_order: displayOrder,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ client: data }, { status: 201 })
}
