// TalentFlow Rapports — Routes liens (Phase 5)
// v2.2.6
// GET  : liste paginée + filtre status/search
// POST : créer un nouveau lien (slug auto, status='active')

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { generateSlug } from '@/lib/report/slug'
import { listReportLinks } from '@/lib/report/queries'
import { normalizePhoneE164 } from '@/lib/sign/phone-format'
import type { ReportDeliveryChannel, ReportLinkStatus } from '@/lib/report/types'

export const runtime = 'nodejs'

const VALID_CHANNELS: ReportDeliveryChannel[] = ['email', 'whatsapp', 'both']
const VALID_STATUS: ReportLinkStatus[] = ['active', 'paused', 'revoked']

export async function GET(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') as ReportLinkStatus | null
  const search = searchParams.get('search')
  const limit = Math.min(Number(searchParams.get('limit')) || 50, 200)
  const offset = Math.max(Number(searchParams.get('offset')) || 0, 0)

  const filter: ReportLinkStatus | null = status && (VALID_STATUS as string[]).includes(status) ? status : null

  const { links, count } = await listReportLinks({
    status: filter,
    search,
    limit,
    offset,
  })
  return NextResponse.json({ links, count })
}

export async function POST(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const body = await req.json()
    if (!body.title || typeof body.title !== 'string') {
      return NextResponse.json({ error: 'title requis' }, { status: 400 })
    }
    if (!body.template_id || typeof body.template_id !== 'string') {
      return NextResponse.json({ error: 'template_id requis' }, { status: 400 })
    }

    const channel: ReportDeliveryChannel = (VALID_CHANNELS as string[]).includes(body.delivery_channel)
      ? body.delivery_channel
      : 'email'

    // Validation : si canal whatsapp/both → client_phone obligatoire
    const clientPhoneRaw = body.client_phone
    const clientPhone = clientPhoneRaw ? normalizePhoneE164(clientPhoneRaw) : null
    if ((channel === 'whatsapp' || channel === 'both') && !clientPhone) {
      return NextResponse.json({
        error: 'Numéro WhatsApp client requis pour ce canal (format E.164, ex: +41791234567)',
      }, { status: 400 })
    }

    // Récup info user créateur
    const server = await createServerClient()
    const { data: { user } } = await server.auth.getUser()

    // Récup candidat lié pour générer un slug propre
    const supabase = createAdminClient()
    let candidatPrenom: string | null = null
    let candidatNom: string | null = null
    if (body.candidat_id) {
      const { data: cand } = await supabase
        .from('candidats')
        .select('prenom, nom')
        .eq('id', body.candidat_id)
        .maybeSingle()
      const c = cand as unknown as { prenom?: string | null; nom?: string | null } | null
      candidatPrenom = c?.prenom || null
      candidatNom = c?.nom || null
    }

    // Vérifie que le template existe et est de kind='report'
    const { data: tpl } = await supabase
      .from('sign_templates' as any)
      .select('id, kind')
      .eq('id', body.template_id)
      .maybeSingle()
    const tplData = tpl as unknown as { id: string; kind?: string } | null
    if (!tplData) {
      return NextResponse.json({ error: 'Template introuvable' }, { status: 404 })
    }
    if (tplData.kind && tplData.kind !== 'report') {
      return NextResponse.json({
        error: 'Template invalide : doit être de type rapport (kind=report)',
      }, { status: 400 })
    }

    const slug = await generateSlug(candidatPrenom, candidatNom)

    // v2.3.x — Stocke le nom complet du candidat. 3 sources :
    //   1. body.candidat_name explicite (saisie UI, prioritaire)
    //   2. concat candidat lié (candidatPrenom + candidatNom) si candidat_id présent
    //   3. fallback null
    let candidatNameStored: string | null = null
    if (typeof body.candidat_name === 'string' && body.candidat_name.trim()) {
      candidatNameStored = body.candidat_name.trim()
    } else if (candidatPrenom || candidatNom) {
      candidatNameStored = [candidatPrenom, candidatNom].filter(Boolean).join(' ').trim() || null
    }

    // v2.3.x Bug 8c — Phone candidat (E.164 normalisé, optionnel)
    const candidatPhoneNorm = body.candidat_phone
      ? normalizePhoneE164(body.candidat_phone)
      : null

    // v2.3.7 — Email candidat (optionnel, notif post-signature client)
    const candidatEmailNorm = typeof body.candidat_email === 'string' && body.candidat_email.trim()
      ? body.candidat_email.toLowerCase().trim()
      : null

    const insertPayload = {
      slug,
      candidat_id: body.candidat_id || null,
      candidat_name: candidatNameStored,
      candidat_phone: candidatPhoneNorm,
      template_id: body.template_id,
      title: body.title.trim(),
      client_name: body.client_name?.trim() || null,
      // v2.3.x — Nom du contact client (texte libre, prioritaire pour la salutation emails/WA)
      client_contact_name: typeof body.client_contact_name === 'string' && body.client_contact_name.trim()
        ? body.client_contact_name.trim()
        : null,
      client_email: body.client_email?.toLowerCase().trim() || null,
      client_phone: clientPhone,
      candidat_email: candidatEmailNorm,
      status: 'active' as const,
      delivery_channel: channel,
      created_by: user?.id || null,
    }

    const { data, error } = await supabase
      .from('report_links' as any)
      .insert(insertPayload)
      .select()
      .single()

    if (error) {
      console.error('[reports] POST insert error', error)
      return NextResponse.json({ error: 'Erreur création' }, { status: 500 })
    }

    // v2.4.3 — Crée automatiquement la 1ʳᵉ entreprise destinataire dans
    // report_link_clients à partir des coords client saisies. Plus de "lien orphelin".
    if (data && insertPayload.client_name) {
      const linkRow = data as unknown as { id: string }
      try {
        await supabase
          .from('report_link_clients' as any)
          .insert({
            link_id: linkRow.id,
            client_id: null,
            client_name: insertPayload.client_name,
            client_email: insertPayload.client_email,
            client_contact_name: insertPayload.client_contact_name,
            client_phone: insertPayload.client_phone,
            display_order: 0,
          })
      } catch (e) {
        // Non-bloquant : la section "Entreprises autorisées" auto-create au mount sinon
        console.warn('[reports] POST report_link_clients seed failed (non-blocking)', e)
      }
    }

    return NextResponse.json({ link: data })
  } catch (e) {
    console.error('[reports] POST exception', e)
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 })
  }
}
