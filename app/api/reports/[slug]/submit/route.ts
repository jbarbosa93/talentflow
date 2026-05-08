// TalentFlow Rapports — Soumission rapport candidat (Phase 5)
// v2.2.6
//
// POST {
//   week_start, field_values,
//   signature_data_url,
//   mode: 'remote' | 'present',  // 'remote' = envoi distant client, 'present' = QR sur place
// }
//
// Workflow :
//   1. Vérif lien actif + semaine non encore signée
//   2. Upsert submission : status='candidate_signed', signature stockée, IP loggée
//   3. Génère/refresh client_token + TTL (2h présent, 7j remote)
//   4. Si mode='remote' : envoie email/WhatsApp client selon delivery_channel
//      Si mode='present' : pas de notif, on retourne juste le token (le candidat
//      affichera un QR code côté UI)
//   5. Audit log 'candidate_signed' + 'client_notified' si remote

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getReportLinkBySlug, getSubmissionByWeek } from '@/lib/report/queries'
import { logReportAudit, extractIp } from '@/lib/report/audit'
import { getWeekDates, parseIsoDate } from '@/lib/report/week-helpers'
import {
  sendClientInviteEmail, sendClientInviteWhatsApp,
} from '@/lib/report/send-notifications'
import { CLIENT_TOKEN_TTL_MS } from '@/lib/report/types'

export const runtime = 'nodejs'

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params

  let body: any
  try { body = await req.json() } catch { body = {} }

  const weekStart = body.week_start as string | undefined
  const fieldValues = (body.field_values && typeof body.field_values === 'object') ? body.field_values : {}
  const signatureDataUrl = typeof body.signature_data_url === 'string' ? body.signature_data_url : null
  // v2.3.x Bug 1 — Mode 'present' (QR code) supprimé. Tous les envois sont 'remote'
  // (token 7j, notif client par email/WhatsApp). On accepte le param pour compat
  // mais on ignore — toujours 'remote'.
  const mode: 'remote' = 'remote'

  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ error: 'week_start invalide (YYYY-MM-DD)' }, { status: 400 })
  }
  if (!signatureDataUrl || !signatureDataUrl.startsWith('data:image/')) {
    return NextResponse.json({ error: 'signature_data_url manquante ou invalide' }, { status: 400 })
  }

  const link = await getReportLinkBySlug(slug)
  if (!link) return NextResponse.json({ error: 'Lien introuvable' }, { status: 404 })
  if (link.status !== 'active') return NextResponse.json({ error: 'Lien désactivé' }, { status: 403 })

  const weekDates = getWeekDates(parseIsoDate(weekStart))
  const existing = await getSubmissionByWeek(link.id, weekStart)
  if (existing && existing.status !== 'draft') {
    return NextResponse.json({
      error: `Semaine déjà ${existing.status === 'completed' ? 'complétée' : 'signée'}`,
      submission_id: existing.id,
      status: existing.status,
    }, { status: 409 })
  }

  const supabase = createAdminClient()
  const ip = extractIp(req)
  const nowIso = new Date().toISOString()
  // v2.3.x Bug 1 — Toujours TTL remote (7j). Mode présentiel supprimé.
  const tokenExpires = new Date(Date.now() + CLIENT_TOKEN_TTL_MS.remote).toISOString()

  // Upsert
  let submissionId: string
  if (existing) {
    const { data, error } = await supabase
      .from('report_submissions' as any)
      .update({
        field_values: fieldValues,
        status: 'candidate_signed',
        candidate_signature_data_url: signatureDataUrl,
        candidate_signed_at: nowIso,
        candidate_signed_ip: ip,
        client_token_expires_at: tokenExpires,
      })
      .eq('id', existing.id)
      .select('id, client_token')
      .single()
    if (error) {
      console.error('[reports/submit] update', error)
      return NextResponse.json({ error: 'Erreur soumission' }, { status: 500 })
    }
    submissionId = (data as unknown as { id: string }).id
  } else {
    const { data, error } = await supabase
      .from('report_submissions' as any)
      .insert({
        link_id: link.id,
        week_start: weekStart,
        week_end: weekDates.end,
        field_values: fieldValues,
        status: 'candidate_signed',
        candidate_signature_data_url: signatureDataUrl,
        candidate_signed_at: nowIso,
        candidate_signed_ip: ip,
        client_token_expires_at: tokenExpires,
      })
      .select('id, client_token')
      .single()
    if (error) {
      console.error('[reports/submit] insert', error)
      return NextResponse.json({ error: 'Erreur soumission' }, { status: 500 })
    }
    submissionId = (data as unknown as { id: string }).id
    await logReportAudit({
      submissionId,
      action: 'created',
      ip,
      metadata: { week: weekStart, slug, source: 'submit', mode },
    })
  }

  // Récup le client_token (généré par DEFAULT à la création, jamais NULL)
  const { data: refreshed } = await supabase
    .from('report_submissions' as any)
    .select('client_token')
    .eq('id', submissionId)
    .maybeSingle()
  const clientToken = (refreshed as { client_token?: string } | null)?.client_token || null

  // Audit candidate_signed
  await logReportAudit({
    submissionId,
    action: 'candidate_signed',
    ip,
    metadata: { mode, week: weekStart },
  })

  // Notif client (remote uniquement)
  let notifResult: { email?: { ok: boolean; error?: string }; whatsapp?: { ok: boolean; error?: string } } = {}
  if (clientToken) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'
    const signUrl = `${appUrl}/report/client/${clientToken}`
    // v2.3.x Bug 7 — Utilise link.candidat_name (source unique) au lieu de parser title.
    // Plus jamais "Rapport d'heures Joao a soumis..." dans les emails.
    const candidateName = (link.candidat_name && link.candidat_name.trim())
      || (link.title || 'Le collaborateur')

    if (link.delivery_channel === 'email' || link.delivery_channel === 'both') {
      if (link.client_email) {
        const r = await sendClientInviteEmail({
          to: link.client_email,
          clientName: link.client_name || link.client_email,
          clientContactName: link.client_contact_name,
          candidateName,
          weekLabel: weekDates.label,
          signUrl,
          expiresAt: tokenExpires,
        })
        notifResult.email = r
      } else {
        notifResult.email = { ok: false, error: 'Email client manquant' }
      }
    }
    if (link.delivery_channel === 'whatsapp' || link.delivery_channel === 'both') {
      if (link.client_phone) {
        const r = await sendClientInviteWhatsApp({
          phone: link.client_phone,
          clientName: link.client_name || link.client_phone,
          clientContactName: link.client_contact_name,
          candidateName,
          weekLabel: weekDates.label,
          signUrl,
          expiresAt: tokenExpires,
        })
        notifResult.whatsapp = r
      } else {
        notifResult.whatsapp = { ok: false, error: 'Phone client manquant' }
      }
    }

    await logReportAudit({
      submissionId,
      action: 'client_notified',
      ip,
      metadata: { channel: link.delivery_channel, ...notifResult },
    })
  }

  return NextResponse.json({
    ok: true,
    submission_id: submissionId,
    mode,
    client_token: clientToken,
    client_token_expires_at: tokenExpires,
    notif: notifResult,
  })
}
