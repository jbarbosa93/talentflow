// TalentFlow Sign — Stream un PDF d'un template (authentifié)
// v2.2.0 — Phase 2
// Query : ?path=templates/{templateId}/{file.pdf}
// Vérifie que le path appartient bien au template demandé.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'
import { downloadSignDocument } from '@/lib/sign/storage'
import type { SignDocument, SignTemplate } from '@/lib/sign/types'

export const runtime = 'nodejs'

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const { id } = await ctx.params
    const { searchParams } = new URL(req.url)
    const path = searchParams.get('path')
    if (!path) {
      return NextResponse.json({ error: 'path requis' }, { status: 400 })
    }

    // Sécurité : seulement vérifier que le path est bien présent dans documents[]
    // du template demandé. Pas de check préfixé `templates/{id}/` car les uploads
    // depuis CreateTemplateModal utilisent `templates/draft/...` (template pas
    // encore créé au moment de l'upload), et c'est légitime.
    const supabase = createAdminClient()
    const { data: tpl } = await supabase
      .from('sign_templates' as any)
      .select('documents')
      .eq('id', id)
      .maybeSingle()
    const t = tpl as unknown as Pick<SignTemplate, 'documents'> | null
    const docs = (t?.documents || []) as SignDocument[]
    const allowed = docs.some(d => d.storage_path === path)
    if (!allowed) {
      return NextResponse.json({ error: 'Document hors template' }, { status: 403 })
    }
    // Garde un préfixe `templates/` minimum pour éviter qu'un attaquant injecte
    // un path arbitraire (ex: `signed/...` d'une autre enveloppe). Le bucket
    // talentflow-sign contient `templates/`, `envelopes/`, `signed/` — on limite
    // l'accès aux PDFs sources.
    if (!path.startsWith('templates/')) {
      return NextResponse.json({ error: 'Path non autorisé' }, { status: 403 })
    }

    const blob = await downloadSignDocument(path)
    const arrayBuffer = await blob.arrayBuffer()

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (e) {
    console.error('[sign/templates/file] error', e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
