// TalentFlow Sign — Download public via token signataire (Phase 4b)
// v2.2.5
//
// Auth : token signataire (déjà reçu par email). Pas de cookie session requis.
// Permet à un destinataire externe (candidat, client) de re-télécharger les PDFs
// signés depuis le lien email même après que son token soit "used" (post-finalize).
//
// Comportement :
//   - Token doit exister, ne pas être expiré (used_at OK — c'est même l'état nominal)
//   - L'enveloppe associée doit être 'completed' avec signed_pdf_paths non vide
//   - Renvoie 1 PDF (single doc) ou un ZIP (multi docs)
//
// La route équivalente sender-only : /api/sign/download/[envelopeId]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SignEnvelope, SignToken } from '@/lib/sign/types'
import { streamSignedPaths, type SignedPath } from '@/lib/sign/download-helpers'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ token: string }>
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    const { token } = await ctx.params
    if (!token) {
      return NextResponse.json({ error: 'token manquant' }, { status: 400 })
    }

    const admin = createAdminClient()

    // 1. Récup token (sans verifyToken : on accepte les used, mais pas les expired
    //    si l'enveloppe n'est pas completed)
    const { data: tokRow, error: tokErr } = await admin
      .from('sign_tokens' as any)
      .select('id, envelope_id, recipient_email, expires_at, used_at')
      .eq('token', token)
      .maybeSingle()
    if (tokErr || !tokRow) {
      return NextResponse.json({ error: 'Lien invalide' }, { status: 404 })
    }
    const tok = tokRow as unknown as SignToken

    // 2. Récup enveloppe
    const { data: envRow, error: envErr } = await admin
      .from('sign_envelopes' as any)
      .select('id, title, status, signed_pdf_paths')
      .eq('id', tok.envelope_id)
      .maybeSingle()
    if (envErr || !envRow) {
      return NextResponse.json({ error: 'Enveloppe introuvable' }, { status: 404 })
    }
    const envelope = envRow as unknown as Pick<SignEnvelope, 'id' | 'title' | 'status'> & {
      signed_pdf_paths: SignedPath[] | null
    }

    // 3. Doit être complétée (sinon pas de PDFs disponibles)
    if (envelope.status !== 'completed') {
      return NextResponse.json({ error: 'Enveloppe non finalisée' }, { status: 409 })
    }

    // 4. Garde-fou : si l'enveloppe est completed mais que CE token est expiré
    //    sans avoir été utilisé (cas pathologique), on refuse.
    if (!tok.used_at) {
      const expiresAt = new Date(tok.expires_at).getTime()
      if (expiresAt < Date.now()) {
        return NextResponse.json({ error: 'Lien expiré' }, { status: 410 })
      }
    }

    const paths = (envelope.signed_pdf_paths || []) as SignedPath[]
    if (paths.length === 0) {
      return NextResponse.json({ error: 'Aucun PDF signé disponible' }, { status: 404 })
    }

    // v2.2.5 — ?doc=N → télécharge UN seul doc (PDF inline) au lieu du ZIP
    const docIdxRaw = req.nextUrl.searchParams.get('doc')
    if (docIdxRaw !== null) {
      const idx = Number(docIdxRaw)
      if (!Number.isInteger(idx) || idx < 0 || idx >= paths.length) {
        return NextResponse.json({ error: 'Index document invalide' }, { status: 400 })
      }
      return await streamSignedPaths([paths[idx]], envelope.title || 'document-signe')
    }

    return await streamSignedPaths(paths, envelope.title || 'document-signe')
  } catch (e) {
    console.error('[sign/download/public] error', e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
