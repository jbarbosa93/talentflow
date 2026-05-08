// TalentFlow Rapports — PUBLIC : sert un PDF du template inline pour le CLIENT
// v2.2.6
//
// URL : GET /api/reports/client/{token}/document?path=...
// Auth : token client de submission valide + non expiré.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getSubmissionByToken, getReportLinkById,
} from '@/lib/report/queries'
import { downloadSignDocument } from '@/lib/sign/storage'
import type { SignDocument, SignTemplate } from '@/lib/sign/types'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await ctx.params
    const path = req.nextUrl.searchParams.get('path')
    if (!path) return NextResponse.json({ error: 'path requis' }, { status: 400 })

    const submission = await getSubmissionByToken(token)
    if (!submission) return NextResponse.json({ error: 'Token invalide' }, { status: 404 })
    if (submission.client_token_expires_at) {
      if (new Date(submission.client_token_expires_at).getTime() < Date.now()) {
        return NextResponse.json({ error: 'Token expiré' }, { status: 410 })
      }
    }

    const link = await getReportLinkById(submission.link_id)
    if (!link?.template_id) {
      return NextResponse.json({ error: 'Template introuvable' }, { status: 404 })
    }

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
    console.error('[reports/client/document] error', e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
