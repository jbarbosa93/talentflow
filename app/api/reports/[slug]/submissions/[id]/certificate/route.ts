// TalentFlow Rapports — Download du CERTIFICAT d'une submission (Bug 11c v2.3.9)
//
// URL : GET /api/reports/{slug}/submissions/{id}/certificate
// Auth : lien actif uniquement (slug public, pas de cookie session).
//
// Comportement :
//   - Vérifie que `slug` matche un lien actif
//   - Vérifie que `id` (submission) appartient bien à ce lien
//   - Cherche dans signed_pdf_paths[] celui dont le nom contient 'certificat'
//   - Si trouvé → stream depuis Storage
//   - Sinon → 404 (le certificat n'est généré qu'à la signature client = status='completed').
//     Pas de génération à la volée (le certificat ne peut exister sans signatures).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getReportLinkBySlug } from '@/lib/report/queries'
import { downloadSignDocument } from '@/lib/sign/storage'
import type { ReportSubmission } from '@/lib/report/types'

export const runtime = 'nodejs'
export const maxDuration = 30

interface Ctx {
  params: Promise<{ slug: string; id: string }>
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { slug, id } = await ctx.params
    if (!slug || !id) {
      return NextResponse.json({ error: 'slug + id requis' }, { status: 400 })
    }

    const link = await getReportLinkBySlug(slug)
    if (!link) return NextResponse.json({ error: 'Lien introuvable' }, { status: 404 })
    if (link.status === 'revoked') {
      return NextResponse.json({ error: 'Lien révoqué' }, { status: 403 })
    }

    // Vérifie que la submission appartient au lien (sécurité)
    const supabase = createAdminClient()
    const { data: subRow } = await supabase
      .from('report_submissions' as any)
      .select('*')
      .eq('id', id)
      .eq('link_id', link.id)
      .maybeSingle()
    if (!subRow) {
      return NextResponse.json({ error: 'Submission introuvable pour ce lien' }, { status: 404 })
    }
    const submission = subRow as unknown as ReportSubmission

    // Cherche le certificat dans signed_pdf_paths
    const certEntry = (submission.signed_pdf_paths || []).find(
      p => /certificat/i.test(p.name || '') || /certificat/i.test(p.path || ''),
    )
    if (!certEntry) {
      return NextResponse.json({
        error: 'Certificat non disponible — généré uniquement à la signature client',
      }, { status: 404 })
    }

    const blob = await downloadSignDocument(certEntry.path)
    const buffer = Buffer.from(await blob.arrayBuffer())
    const week = submission.week_start.replace(/-/g, '')
    const filename = `Certificat-${week}-${certEntry.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, no-cache, no-store',
      },
    })
  } catch (e) {
    console.error('[reports/certificate] error', e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
