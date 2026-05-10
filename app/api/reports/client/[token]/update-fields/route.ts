// TalentFlow Rapports — Modification des données par le client
// v2.3.x
//
// PATCH { fieldValues: Record<string, string> }
//   1. Vérif token valide + non expiré + status='candidate_signed'
//   2. UPDATE report_submissions.field_values (merge partiel)
//   3. UPDATE metadata : { client_modified: true, modified_at, modified_fields }
//   4. Log audit 'client_modified'
//   5. Retourne { ok: true }
//
// Champs autorisés : number, text, checkbox (recipientOrder=1 uniquement).
// Pas de signature, fullname, date, company — ces champs sont filtrés côté UI.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSubmissionByToken } from '@/lib/report/queries'
import { logReportAudit, extractIp } from '@/lib/report/audit'

export const runtime = 'nodejs'

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params
  if (!token) return NextResponse.json({ error: 'token manquant' }, { status: 400 })

  let body: any
  try { body = await req.json() } catch { body = {} }

  const fieldValues = body.fieldValues
  if (!fieldValues || typeof fieldValues !== 'object' || Array.isArray(fieldValues)) {
    return NextResponse.json({ error: 'fieldValues manquant ou invalide' }, { status: 400 })
  }

  const submission = await getSubmissionByToken(token)
  if (!submission) return NextResponse.json({ error: 'Token invalide' }, { status: 404 })

  if (submission.status !== 'candidate_signed') {
    return NextResponse.json({ error: `Modification impossible : statut ${submission.status}` }, { status: 409 })
  }
  if (submission.client_token_expires_at) {
    const expires = new Date(submission.client_token_expires_at).getTime()
    if (expires < Date.now()) {
      return NextResponse.json({ error: 'Token expiré' }, { status: 410 })
    }
  }

  const supabase = createAdminClient()
  const ip = extractIp(req)
  const nowIso = new Date().toISOString()
  const modifiedFields = Object.keys(fieldValues)

  // Merge les nouvelles valeurs sur les field_values existantes
  const mergedValues = {
    ...(submission.field_values || {}),
    ...fieldValues,
  }

  // metadata : marque client_modified + liste des champs modifiés
  const existingMeta = (submission as any).metadata || {}
  const newMeta = {
    ...existingMeta,
    client_modified: true,
    modified_at: nowIso,
    modified_fields: modifiedFields,
  }

  const { error } = await supabase
    .from('report_submissions' as any)
    .update({
      field_values: mergedValues,
      metadata: newMeta,
    })
    .eq('id', submission.id)

  if (error) {
    console.error('[reports/client/update-fields] update error', error)
    return NextResponse.json({ error: 'Erreur mise à jour' }, { status: 500 })
  }

  await logReportAudit({
    submissionId: submission.id,
    action: 'client_modified',
    ip,
    metadata: { modified_fields: modifiedFields, fields_count: modifiedFields.length },
  })

  return NextResponse.json({ ok: true })
}
