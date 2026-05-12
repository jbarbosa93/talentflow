// TalentFlow Rapports — Soumission rapport candidat (Phase 5)
// v2.4.0 — Phase 1 : multi-entreprise + notes_candidat
//
// POST {
//   week_start, field_values,
//   signature_data_url,
//   report_link_client_id?,  // v2.4.0 — entreprise destinataire
//   notes_candidat?,         // v2.4.0 — note libre max 300 chars
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
  sendClientInviteEmail,
  sendClientInviteWhatsApp,
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
  // v2.4.0 — multi-entreprise + note candidat
  const reportLinkClientId = typeof body.report_link_client_id === 'string' && body.report_link_client_id.trim()
    ? body.report_link_client_id.trim()
    : null
  const notesCandidatRaw = typeof body.notes_candidat === 'string' ? body.notes_candidat.trim() : ''
  const notesCandidat = notesCandidatRaw ? notesCandidatRaw.slice(0, 300) : null

  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ error: 'week_start invalide (YYYY-MM-DD)' }, { status: 400 })
  }
  if (!signatureDataUrl || !signatureDataUrl.startsWith('data:image/')) {
    return NextResponse.json({ error: 'signature_data_url manquante ou invalide' }, { status: 400 })
  }
  // Anti-DoS data URL — aligné sur sign-field (1.5 MB)
  if (signatureDataUrl.length > 1_500_000) {
    return NextResponse.json({ error: 'signature trop volumineuse (max 1.5 MB)' }, { status: 413 })
  }

  const link = await getReportLinkBySlug(slug)
  if (!link) return NextResponse.json({ error: 'Lien introuvable' }, { status: 404 })
  if (link.status !== 'active') return NextResponse.json({ error: 'Lien désactivé' }, { status: 403 })

  const supabase = createAdminClient()

  // v2.4.0 — Récup entreprise destinataire (multi-entreprise)
  let linkClient: {
    id: string; client_name: string; client_email: string | null;
    client_contact_name: string | null; client_phone: string | null;
  } | null = null
  if (reportLinkClientId) {
    const { data } = await supabase
      .from('report_link_clients' as any)
      .select('id, link_id, client_name, client_email, client_contact_name, client_phone')
      .eq('id', reportLinkClientId)
      .maybeSingle()
    if (!data) {
      return NextResponse.json({ error: 'Entreprise destinataire introuvable' }, { status: 404 })
    }
    if ((data as any).link_id !== link.id) {
      return NextResponse.json({ error: 'Entreprise non autorisée pour ce lien' }, { status: 403 })
    }
    linkClient = data as any
  }

  // Destinataires effectifs : entreprise sélectionnée > legacy link.client_*
  const dest = {
    name:    linkClient?.client_name         || link.client_name,
    email:   linkClient?.client_email        || link.client_email,
    contact: linkClient?.client_contact_name || link.client_contact_name,
    phone:   linkClient?.client_phone        || link.client_phone,
  }

  const weekDates = getWeekDates(parseIsoDate(weekStart))
  const existing = await getSubmissionByWeek(link.id, weekStart, reportLinkClientId)
  if (existing && existing.status !== 'draft') {
    return NextResponse.json({
      error: `Semaine déjà ${existing.status === 'completed' ? 'complétée' : 'signée'}`,
      submission_id: existing.id,
      status: existing.status,
    }, { status: 409 })
  }
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
        report_link_client_id: reportLinkClientId,
        notes_candidat: notesCandidat,
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
        report_link_client_id: reportLinkClientId,
        week_start: weekStart,
        week_end: weekDates.end,
        field_values: fieldValues,
        status: 'candidate_signed',
        candidate_signature_data_url: signatureDataUrl,
        candidate_signed_at: nowIso,
        candidate_signed_ip: ip,
        client_token_expires_at: tokenExpires,
        notes_candidat: notesCandidat,
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
      metadata: { week: weekStart, slug, source: 'submit', mode, report_link_client_id: reportLinkClientId },
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

    // v2.7.3 — Mode portail rapports : si activé, on remplace l'URL signature
    // par le portail permanent + on cible l'email principal de l'entreprise.
    let portalSignUrl: string | null = null
    let portalDestEmail: string | null = null
    let portalUsed = false
    if ((link as any).use_client_portal === true) {
      // Trouve le client_id via report_link_clients (1ʳᵉ ligne avec client_id non null)
      const { data: rlc } = await supabase
        .from('report_link_clients' as any)
        .select('client_id')
        .eq('link_id', link.id)
        .not('client_id', 'is', null)
        .limit(1)
        .maybeSingle()
      const clientId = (rlc as any)?.client_id as string | null
      if (clientId) {
        const { data: portal } = await supabase
          .from('client_portals' as any)
          .select('slug, is_active')
          .eq('client_id', clientId)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if ((portal as any)?.slug) {
          portalSignUrl = `${appUrl}/client-portal/${(portal as any).slug}?tab=rapports`
        }
        const { data: clientRow } = await (supabase as any)
          .from('clients')
          .select('email')
          .eq('id', clientId)
          .maybeSingle()
        portalDestEmail = (clientRow as any)?.email || null
      }
    }

    // URL et destinataire effectifs (portail prioritaire si dispo)
    const signUrl = portalSignUrl || `${appUrl}/report/client/${clientToken}`
    const emailTarget = portalSignUrl && portalDestEmail ? portalDestEmail : dest.email
    portalUsed = !!(portalSignUrl && portalDestEmail)

    // v2.3.x Bug 7 — Utilise link.candidat_name (source unique) au lieu de parser title.
    // Plus jamais "Rapport d'heures Joao a soumis..." dans les emails.
    let candidateName = (link.candidat_name && link.candidat_name.trim())
      || (link.title || 'Le collaborateur')

    // v2.7.3 — Ajoute le métier entre parenthèses : "Mickael Voyenet (Chauffeur PL)"
    // Source : missions.metier_display || missions.metier via link.mission_id
    const missionIdLink = (link as any).mission_id as string | null
    if (missionIdLink) {
      try {
        const { data: missionRow } = await (supabase as any)
          .from('missions')
          .select('metier, metier_display')
          .eq('id', missionIdLink)
          .maybeSingle()
        const metier = (missionRow as any)?.metier_display || (missionRow as any)?.metier
        if (metier && !candidateName.includes('(')) {
          candidateName = `${candidateName} (${metier})`
        }
      } catch { /* silent */ }
    }

    if (link.delivery_channel === 'email' || link.delivery_channel === 'both') {
      if (emailTarget) {
        const r = await sendClientInviteEmail({
          to: emailTarget,
          clientName: dest.name || emailTarget,
          clientContactName: portalUsed ? null : dest.contact,
          candidateName,
          weekLabel: weekDates.label,
          signUrl,
          expiresAt: tokenExpires,
          portalMode: portalUsed,
        })
        notifResult.email = r
      } else {
        notifResult.email = {
          ok: false,
          error: portalUsed
            ? 'Email principal entreprise manquant (renseigne-le dans la fiche client)'
            : 'Email client manquant',
        }
      }
    }
    if (link.delivery_channel === 'whatsapp' || link.delivery_channel === 'both') {
      if (dest.phone) {
        const r = await sendClientInviteWhatsApp({
          phone: dest.phone,
          clientName: dest.name,
          clientContactName: dest.contact,
          candidateName,
          weekLabel: weekDates.label,
          signUrl,
          expiresAt: tokenExpires,
        })
        notifResult.whatsapp = r
      } else {
        notifResult.whatsapp = { ok: false, error: 'Téléphone client manquant' }
      }
    }
    await logReportAudit({
      submissionId,
      action: 'client_notified',
      ip,
      metadata: { channel: link.delivery_channel, portal_used: portalUsed, ...notifResult },
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
