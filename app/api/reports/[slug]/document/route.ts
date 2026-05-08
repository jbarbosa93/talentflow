// TalentFlow Rapports — PUBLIC : sert un PDF du template inline (Phase 5)
// v2.2.6
//
// URL : GET /api/reports/{slug}/document?path=templates/{tplId}/{file.pdf}
// Auth : lien actif uniquement (pas de token candidat — c'est un lien permanent).
// Vérifie que `path` appartient bien aux documents du template lié.
// Pattern aligné sur /api/sign/document/[token].

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getReportLinkBySlug } from '@/lib/report/queries'
import { downloadSignDocument } from '@/lib/sign/storage'
import type { SignDocument, SignTemplate } from '@/lib/sign/types'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await ctx.params
    const path = req.nextUrl.searchParams.get('path')
    if (!path) return NextResponse.json({ error: 'path requis' }, { status: 400 })

    const link = await getReportLinkBySlug(slug)
    if (!link) return NextResponse.json({ error: 'Lien introuvable' }, { status: 404 })
    if (link.status !== 'active') {
      return NextResponse.json({ error: 'Lien désactivé' }, { status: 403 })
    }
    if (!link.template_id) {
      return NextResponse.json({ error: 'Template introuvable' }, { status: 404 })
    }

    // Vérifie que le path demandé appartient bien aux documents du template
    const supabase = createAdminClient()
    const { data: tpl } = await supabase
      .from('sign_templates' as any)
      .select('documents')
      .eq('id', link.template_id)
      .maybeSingle()
    const t = tpl as unknown as Pick<SignTemplate, 'documents'> | null
    const docs = (t?.documents || []) as SignDocument[]
    const allowed = docs.some(d => d.storage_path === path)
    if (!allowed) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

    const blob = await downloadSignDocument(path)
    const arrayBuffer = await blob.arrayBuffer()
    return new NextResponse(arrayBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (e) {
    console.error('[reports/document] error', e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
