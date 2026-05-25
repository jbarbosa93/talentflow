// TalentFlow Sign — Liste + download des pièces jointes chargées par le candidat
// v2.9.50
//
// Les uploads candidat sont stockés dans `talentflow-sign/uploads/{envelopeId}/{tokenId}/...`
// et leur métadonnées (path, name, mimeType, size, expiryDate) sont enregistrées
// dans `sign_tokens.field_values[fieldId]` au format `SignAttachmentValue`.
//
// Cette route les expose au créateur de l'enveloppe via la page /sign/[id] :
//   GET /api/sign/envelopes/[id]/uploads        → liste { fields: [{ fieldId, label, files: [{ name, path, size, mimeType }] }] }
//   GET /api/sign/envelopes/[id]/uploads?path=… → stream le fichier (download inline)
//
// Validation : path doit être préfixé par `uploads/{envelopeId}/` — anti-traversal.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'
import { downloadSignDocument } from '@/lib/sign/storage'
import type {
  SignDocument,
  SignField,
  SignAttachmentValue,
  SignAttachmentFile,
} from '@/lib/sign/types'

export const runtime = 'nodejs'
export const maxDuration = 30

interface UploadFieldGroup {
  fieldId: string
  label: string
  files: Array<{
    name: string
    path: string
    size: number
    mimeType: string
    expiryDate: string | null
    readable: 'ok' | 'unreadable' | 'poor' | null
  }>
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth()
  if (authError) return authError

  const { id } = await ctx.params
  const supabase = createAdminClient()

  // Mode 2 — download via ?path=
  const url = new URL(req.url)
  const downloadPath = url.searchParams.get('path')
  if (downloadPath) {
    // Anti-traversal : le path DOIT être préfixé par uploads/{envelopeId}/
    const expectedPrefix = `uploads/${id}/`
    if (!downloadPath.startsWith(expectedPrefix) || downloadPath.includes('..')) {
      return NextResponse.json({ error: 'Chemin invalide' }, { status: 400 })
    }
    try {
      const blob = await downloadSignDocument(downloadPath)
      const filename = downloadPath.split('/').pop() || 'fichier'
      const mimeType = blob.type || 'application/octet-stream'
      const headers = new Headers()
      headers.set('Content-Type', mimeType)
      headers.set(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      )
      headers.set('Cache-Control', 'private, no-store')
      const buf = Buffer.from(await blob.arrayBuffer())
      return new NextResponse(buf as unknown as BodyInit, { status: 200, headers })
    } catch (e) {
      console.warn('[sign/uploads] download échoué', downloadPath, e)
      return NextResponse.json({ error: 'Fichier introuvable' }, { status: 404 })
    }
  }

  // Mode 1 — liste
  // 1. Envelope (template + verif existence)
  const { data: envRow, error: envErr } = await (supabase as any)
    .from('sign_envelopes')
    .select('id, template_id')
    .eq('id', id)
    .maybeSingle()
  if (envErr || !envRow) {
    return NextResponse.json({ error: 'Enveloppe introuvable' }, { status: 404 })
  }
  if (!envRow.template_id) {
    return NextResponse.json({ fields: [] })
  }

  // 2. Champs `attachment` du template
  const { data: tpl } = await (supabase as any)
    .from('sign_templates')
    .select('documents')
    .eq('id', envRow.template_id)
    .maybeSingle()
  const tplDocs = ((tpl as { documents?: SignDocument[] } | null)?.documents || []) as SignDocument[]
  const attachmentFields: SignField[] = []
  for (const d of tplDocs) {
    for (const f of d.fields || []) {
      if (f.type === 'attachment') attachmentFields.push(f)
    }
  }
  if (attachmentFields.length === 0) {
    return NextResponse.json({ fields: [] })
  }

  // 3. field_values de tous les tokens de l'enveloppe (dédup par path)
  const { data: tokRows } = await (supabase as any)
    .from('sign_tokens')
    .select('field_values')
    .eq('envelope_id', id)
  const tokens = (tokRows || []) as Array<{ field_values: Record<string, unknown> | null }>

  const result: UploadFieldGroup[] = []
  for (const af of attachmentFields) {
    const seenPaths = new Set<string>()
    const files: UploadFieldGroup['files'] = []
    for (const tok of tokens) {
      const v = (tok.field_values || {})[af.id] as SignAttachmentValue | undefined
      for (const f of (v?.files || []) as SignAttachmentFile[]) {
        if (!f || typeof f.path !== 'string' || seenPaths.has(f.path)) continue
        seenPaths.add(f.path)
        files.push({
          name: f.name || 'fichier',
          path: f.path,
          size: typeof f.size === 'number' ? f.size : 0,
          mimeType: f.mimeType || 'application/octet-stream',
          expiryDate: f.expiryDate || null,
          readable: f.readable || null,
        })
      }
    }
    if (files.length > 0) {
      result.push({
        fieldId: af.id,
        label: (af.tooltip || af.label || 'Document').slice(0, 200),
        files,
      })
    }
  }

  return NextResponse.json({ fields: result })
}
