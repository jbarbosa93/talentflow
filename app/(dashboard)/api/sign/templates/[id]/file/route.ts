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

    // Sécurité : on accepte 2 cas légitimes (l'un OU l'autre).
    // v2.7.4 — Avant on n'autorisait QUE le path déjà persisté dans documents[].
    // Bug : avec le nouveau workflow upload direct Supabase, le PDF est uploadé
    // AVANT que l'utilisateur clique "Enregistrer" → le preview demandait le PDF
    // mais le path n'était pas encore en DB → 403.
    //
    // Cas A (legacy) : le path est déjà dans documents[] du template DB.
    // Cas B (édition en cours) : le path commence par `templates/{id}/` — par
    //   définition scopé à ce template car l'upload-url l'a préfixé avec ownerId=templateId.
    //   Pour les uploads depuis CreateTemplateModal on a `templates/draft/...` qui ne
    //   matche aucun cas → reste interdit (déjà persisté à ce stade).
    const supabase = createAdminClient()
    const { data: tpl } = await supabase
      .from('sign_templates' as any)
      .select('documents')
      .eq('id', id)
      .maybeSingle()
    const t = tpl as unknown as Pick<SignTemplate, 'documents'> | null
    const docs = (t?.documents || []) as SignDocument[]
    const inTemplate = docs.some(d => d.storage_path === path)
    const scopedToTemplate = path.startsWith(`templates/${id}/`)
    if (!inTemplate && !scopedToTemplate) {
      return NextResponse.json({ error: 'Document hors template' }, { status: 403 })
    }
    // Garde un préfixe `templates/` minimum pour éviter qu'un attaquant injecte
    // un path arbitraire (ex: `signed/...` d'une autre enveloppe).
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
