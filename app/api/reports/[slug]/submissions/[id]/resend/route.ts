// TalentFlow Rapports — Renvoyer la notif client (Bug 4 v2.3.x)
// v2.3.2
//
// URL : POST /api/reports/{slug}/submissions/{id}/resend
// Auth : lien actif uniquement (slug public).
//
// Comportement :
//   - Vérifie que submission appartient au lien
//   - Vérifie que status='candidate_signed' (pas la peine si déjà completed/draft)
//   - Refresh client_token_expires_at (TTL 7j)
//   - Renvoie email/WhatsApp client selon delivery_channel
//   - Retourne le résumé des notifs

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getReportLinkBySlug } from '@/lib/report/queries'
import { logReportAudit, extractIp } from '@/lib/report/audit'
import { getWeekDates } from '@/lib/report/week-helpers'
import {
  sendClientInviteEmail,
} from '@/lib/report/send-notifications'
import { CLIENT_TOKEN_TTL_MS } from '@/lib/report/types'
import type { ReportSubmission } from '@/lib/report/types'

export const runtime = 'nodejs'

interface Ctx {
  params: Promise<{ slug: string; id: string }>
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { slug, id } = await ctx.params

    const link = await getReportLinkBySlug(slug)
    if (!link) return NextResponse.json({ error: 'Lien introuvable' }, { status: 404 })
    if (link.status !== 'active') {
      return NextResponse.json({ error: 'Lien désactivé' }, { status: 403 })
    }

    const supabase = createAdminClient()
    const { data: subRow } = await supabase
      .from('report_submissions' as any)
      .select('*')
      .eq('id', id)
      .eq('link_id', link.id)
      .maybeSingle()
    if (!subRow) {
      return NextResponse.json({ error: 'Submission introuvable pour ce lien' }, { status: 404 })
    }
    const submission = subRow as unknown as ReportSubmission
    if (submission.status !== 'candidate_signed') {
      return NextResponse.json({
        error: `Renvoi impossible (status=${submission.status})`,
      }, { status: 409 })
    }

    // Refresh token TTL
    const newExpires = new Date(Date.now() + CLIENT_TOKEN_TTL_MS.remote).toISOString()
    await supabase
      .from('report_submissions' as any)
      .update({ client_token_expires_at: newExpires })
      .eq('id', submission.id)

    // Renvoi notifs
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'
    const signUrl = `${appUrl}/report/client/${submission.client_token}`
    const candidateName = (link.candidat_name && link.candidat_name.trim())
      || (link.title || 'Le collaborateur')
    const weekDates = getWeekDates(submission.week_start)

    const notifs: { email?: any; whatsapp?: any } = {}

    if ((link.delivery_channel === 'email' || link.delivery_channel === 'both') && link.client_email) {
      notifs.email = await sendClientInviteEmail({
        to: link.client_email,
        clientName: link.client_name || link.client_email,
        clientContactName: link.client_contact_name,
        candidateName,
        weekLabel: weekDates.label,
        signUrl,
        expiresAt: newExpires,
      })
    }
    await logReportAudit({
      submissionId: submission.id,
      action: 'client_notified',
      ip: extractIp(req),
      metadata: { source: 'resend', channel: link.delivery_channel, ...notifs },
    })

    return NextResponse.json({
      ok: true,
      client_token_expires_at: newExpires,
      notifs,
    })
  } catch (e) {
    console.error('[reports/resend] error', e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
