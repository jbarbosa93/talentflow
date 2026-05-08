// TalentFlow Rapports — Page publique client (GET infos pour signer)
// v2.2.6 Phase 5
//
// Renvoie au client :
//   - Submission (field_values en lecture seule + signature candidat)
//   - Lien (titre, candidat lié, semaine)
//   - Template (documents pour stamping ultérieur)
//
// Vérif : token valide + non expiré + status='candidate_signed' (pas 'completed').
// Si déjà signée par le client → renvoie 'already_signed'.

import { NextRequest, NextResponse } from 'next/server'
import { getSubmissionByToken, getReportLinkById, getTemplateForLink } from '@/lib/report/queries'
import { getWeekDates } from '@/lib/report/week-helpers'
import { logReportAudit, extractIp } from '@/lib/report/audit'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params
  if (!token) return NextResponse.json({ error: 'token manquant' }, { status: 400 })

  const submission = await getSubmissionByToken(token)
  if (!submission) {
    return NextResponse.json({ valid: false, reason: 'not_found' }, { status: 404 })
  }
  if (submission.status === 'completed' || submission.status === 'client_signed') {
    return NextResponse.json({ valid: false, reason: 'already_signed' }, { status: 410 })
  }
  if (submission.status === 'cancelled') {
    return NextResponse.json({ valid: false, reason: 'cancelled' }, { status: 410 })
  }
  if (submission.status !== 'candidate_signed') {
    return NextResponse.json({ valid: false, reason: 'not_ready' }, { status: 409 })
  }
  if (submission.client_token_expires_at) {
    const expires = new Date(submission.client_token_expires_at).getTime()
    if (expires < Date.now()) {
      return NextResponse.json({ valid: false, reason: 'expired' }, { status: 410 })
    }
  }

  const link = await getReportLinkById(submission.link_id)
  if (!link) {
    return NextResponse.json({ valid: false, reason: 'link_not_found' }, { status: 404 })
  }
  const template = await getTemplateForLink(link.template_id)
  if (!template) {
    return NextResponse.json({ valid: false, reason: 'no_template' }, { status: 404 })
  }
  const tplExtra = template as unknown as { wizard_enabled?: boolean; wizard_steps?: unknown[] }
  const wizardEnabled = tplExtra.wizard_enabled !== false
  const wizardSteps = Array.isArray(tplExtra.wizard_steps) ? tplExtra.wizard_steps : []

  // Pré-fill candidat (pour affichage nom collaborateur en haut du PDF + UI)
  // v2.3.x — Priorité : candidat lié en DB > candidat_name saisi manuellement sur le lien
  let candidat: { prenom: string | null; nom: string | null; email: string | null } | null = null
  if (link.candidat_id) {
    try {
      const supabase = createAdminClient()
      const { data } = await supabase
        .from('candidats')
        .select('prenom, nom, email')
        .eq('id', link.candidat_id)
        .maybeSingle()
      candidat = data as { prenom: string | null; nom: string | null; email: string | null } | null
    } catch { /* silent */ }
  }
  if (!candidat && link.candidat_name && link.candidat_name.trim()) {
    const parts = link.candidat_name.trim().split(/\s+/)
    candidat = {
      prenom: parts[0] || null,
      nom: parts.slice(1).join(' ') || null,
      email: null,
    }
  }

  const weekDates = getWeekDates(submission.week_start)

  // Audit : on log la 1re consultation (pas chaque GET — détection grossière via metadata)
  await logReportAudit({
    submissionId: submission.id,
    action: 'client_viewed',
    ip: extractIp(req),
    metadata: { user_agent: req.headers.get('user-agent') || null },
  })

  return NextResponse.json({
    valid: true,
    submission: {
      id: submission.id,
      week_start: submission.week_start,
      week_end: submission.week_end,
      field_values: submission.field_values,
      candidate_signature_data_url: submission.candidate_signature_data_url,
      candidate_signed_at: submission.candidate_signed_at,
      status: submission.status,
      client_token_expires_at: submission.client_token_expires_at,
    },
    link: {
      id: link.id,
      title: link.title,
      client_name: link.client_name,
    },
    candidat,
    template: {
      id: template.id,
      name: template.name,
      documents: template.documents,
    },
    wizard: { enabled: wizardEnabled, steps: wizardSteps },
    weekLabel: weekDates.label,
  })
}
