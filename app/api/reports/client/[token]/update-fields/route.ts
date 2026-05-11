// TalentFlow Rapports — Modification des données par le client
// v2.4.0 — Phase 1 : ajout notes_client
//
// PATCH { fieldValues?: Record<string, string>, notes_client?: string }
//   1. Vérif token valide + non expiré + status='candidate_signed'
//   2. UPDATE report_submissions.field_values (merge partiel) si fourni
//   3. UPDATE notes_client si fourni (max 300 chars)
//   4. UPDATE metadata : { client_modified: true, modified_at, modified_fields }
//   5. Log audit 'client_modified'
//   6. Retourne { ok: true }
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

  const fieldValues = (body.fieldValues && typeof body.fieldValues === 'object' && !Array.isArray(body.fieldValues))
    ? body.fieldValues as Record<string, unknown>
    : null
  const notesClientRaw = typeof body.notes_client === 'string' ? body.notes_client.trim() : undefined
  const hasNotesClient = notesClientRaw !== undefined
  const notesClient = hasNotesClient ? (notesClientRaw ? notesClientRaw.slice(0, 300) : null) : undefined

  if (!fieldValues && !hasNotesClient) {
    return NextResponse.json({ error: 'fieldValues ou notes_client requis' }, { status: 400 })
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
  const modifiedFields = fieldValues ? Object.keys(fieldValues) : []

  const patch: Record<string, unknown> = {}
  if (fieldValues) {
    patch.field_values = {
      ...(submission.field_values || {}),
      ...fieldValues,
    }
  }
  if (hasNotesClient) patch.notes_client = notesClient

  // metadata : marque client_modified UNIQUEMENT si fields modifiés (pas pour note seule)
  if (modifiedFields.length > 0) {
    const existingMeta = (submission as any).metadata || {}
    patch.metadata = {
      ...existingMeta,
      client_modified: true,
      modified_at: nowIso,
      modified_fields: modifiedFields,
    }
  }

  const { error } = await supabase
    .from('report_submissions' as any)
    .update(patch)
    .eq('id', submission.id)

  if (error) {
    console.error('[reports/client/update-fields] update error', error)
    return NextResponse.json({ error: 'Erreur mise à jour' }, { status: 500 })
  }

  if (modifiedFields.length > 0) {
    await logReportAudit({
      submissionId: submission.id,
      action: 'client_modified',
      ip,
      metadata: { modified_fields: modifiedFields, fields_count: modifiedFields.length, note_updated: hasNotesClient },
    })
  }

  return NextResponse.json({ ok: true })
}
