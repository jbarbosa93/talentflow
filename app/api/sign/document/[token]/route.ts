// TalentFlow Sign — PUBLIC : sert un PDF inline si token valide
// v2.2.0 — Phase 3 (stamp TalentFlow Envelope ID, remplace header DocuSign)
// Query : ?path=templates/{tplId}/{file.pdf} (path doit appartenir au template/envelope du token)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyToken } from '@/lib/sign/tokens'
import { downloadSignDocument } from '@/lib/sign/storage'
import { stampTalentflowEnvelopeId } from '@/lib/sign/pdf-stamp'
import type { SignEnvelope, SignTemplate, SignDocument } from '@/lib/sign/types'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await ctx.params
    const { searchParams } = new URL(req.url)
    const path = searchParams.get('path')

    if (!path) return NextResponse.json({ error: 'path requis' }, { status: 400 })

    const result = await verifyToken(token)
    if (!result.valid || !result.token) {
      return NextResponse.json({ error: 'Token invalide' }, { status: 403 })
    }

    // Vérifie que le path demandé appartient bien à l'enveloppe/template du token
    const supabase = createAdminClient()
    const { data: env } = await supabase
      .from('sign_envelopes' as any)
      .select('template_id')
      .eq('id', result.token.envelope_id)
      .maybeSingle()

    const envelope = env as unknown as Pick<SignEnvelope, 'template_id'> | null
    let allowed = false

    // Path autorisé si dans envelopes/{envelopeId}/...
    if (path.startsWith(`envelopes/${result.token.envelope_id}/`)) {
      allowed = true
    }

    // Ou dans les documents du template lié — OU dans les helpAttachments
    // d'un field du template (v2.9.72 — aide visuelle par champ).
    let isHelpAttachment = false
    let helpMimeType: string | null = null
    if (!allowed && envelope?.template_id) {
      const { data: tpl } = await supabase
        .from('sign_templates' as any)
        .select('documents')
        .eq('id', envelope.template_id)
        .maybeSingle()
      const t = tpl as unknown as Pick<SignTemplate, 'documents'> | null
      const docs = (t?.documents || []) as SignDocument[]
      allowed = docs.some(d => d.storage_path === path)
      // v2.9.72 — Check helpAttachment du field (PDF ou image)
      if (!allowed) {
        for (const d of docs) {
          for (const f of (d.fields || [])) {
            const help = (f as { helpAttachment?: { path: string; mimeType: string } }).helpAttachment
            if (help && help.path === path) {
              allowed = true
              isHelpAttachment = true
              helpMimeType = help.mimeType || null
              break
            }
          }
          if (allowed) break
        }
      }
    }

    if (!allowed) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const blob = await downloadSignDocument(path)
    const arrayBuffer = await blob.arrayBuffer()

    // v2.9.72 — Aide visuelle : pas de stamp envelope ID (juste servir le fichier
    // tel quel, sinon les images sont cassées et les PDF stamped portent un ID
    // sans rapport avec leur usage).
    if (isHelpAttachment) {
      return new NextResponse(arrayBuffer as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': helpMimeType || blob.type || 'application/octet-stream',
          'Content-Disposition': 'inline',
          'Cache-Control': 'private, max-age=300',
        },
      })
    }

    // v2.2.0 Phase 3 — Stamp TalentFlow Envelope ID en haut de chaque page
    // (couvre le header "Docusign Envelope ID: ..." qui vient de l'export DocuSign)
    const envelopeId = result.token.envelope_id
    const stamped = await stampTalentflowEnvelopeId(new Uint8Array(arrayBuffer), envelopeId)

    return new NextResponse(stamped as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline',
        // Cache court (5 min) — évite de re-stamper à chaque page-flip côté client
        // sans empêcher le refresh si l'envelope est modifiée
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (e) {
    console.error('[sign/document] error', e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
