// TalentFlow Sign — Download authentifié des PDFs signés (Phase 4b)
// v2.2.5
//
// Auth : Supabase session cookie (dashboard L-Agence) — sender-only.
// Permission : envelope.created_by === user.id.
// Comportement :
//   - Status doit être 'completed' + signed_pdf_paths non vide
//   - 1 doc → renvoie le PDF inline (Content-Disposition: attachment)
//   - 2+ docs → zippe les PDFs (filename = envelope.title + .zip)
//
// La route équivalente publique (token signataire) : /api/sign/download/public/[token]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { streamSignedPaths, type SignedPath } from '@/lib/sign/download-helpers'
import type { SignEnvelope } from '@/lib/sign/types'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ envelopeId: string }>
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    const { envelopeId } = await ctx.params
    if (!envelopeId) {
      return NextResponse.json({ error: 'envelopeId manquant' }, { status: 400 })
    }

    // 1. Auth
    const userClient = await createClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // 2. Récupère l'enveloppe (service role pour bypass RLS, on check ownership manuellement)
    const admin = createAdminClient()
    const { data: env, error: envErr } = await admin
      .from('sign_envelopes' as any)
      .select('id, title, status, created_by, signed_pdf_paths')
      .eq('id', envelopeId)
      .maybeSingle()
    if (envErr || !env) {
      return NextResponse.json({ error: 'Enveloppe introuvable' }, { status: 404 })
    }
    const envelope = env as unknown as SignEnvelope & {
      signed_pdf_paths: SignedPath[] | null
    }

    // 3. Permission : sender-only (admin role dashboard pourrait être ajouté ici)
    if (envelope.created_by !== user.id) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    // 4. État : completed + paths persistés
    if (envelope.status !== 'completed') {
      return NextResponse.json({ error: 'Enveloppe non finalisée' }, { status: 409 })
    }
    const paths = (envelope.signed_pdf_paths || []) as SignedPath[]
    if (paths.length === 0) {
      return NextResponse.json({ error: 'Aucun PDF signé disponible' }, { status: 404 })
    }

    // v2.2.5 — ?doc=N → télécharge UN seul doc (PDF inline) au lieu du ZIP
    // v2.9.70 — ?preview=1 → disposition=inline pour rendre dans une iframe (œil)
    const isPreview = req.nextUrl.searchParams.get('preview') === '1'
    const docIdxRaw = req.nextUrl.searchParams.get('doc')
    if (docIdxRaw !== null) {
      const idx = Number(docIdxRaw)
      if (!Number.isInteger(idx) || idx < 0 || idx >= paths.length) {
        return NextResponse.json({ error: 'Index document invalide' }, { status: 400 })
      }
      return await streamSignedPaths(
        [paths[idx]],
        envelope.title || 'document-signe',
        { disposition: isPreview ? 'inline' : 'attachment' },
      )
    }

    return await streamSignedPaths(paths, envelope.title || 'document-signe')
  } catch (e) {
    console.error('[sign/download] error', e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
