// GET /api/client-portal/[slug]/rapports/[id]/document
// Proxy PDF d'une submission depuis le portail client. v2.7.2
//
// Sécurité :
//   - Vérifie portal.is_active
//   - Vérifie que la submission appartient à un report_link_client.client_id = portal.client_id
//   - Si signed_pdf_paths non vide → stream Storage
//   - Sinon → génère à la volée via generateReportPdf
//
// Query :
//   ?inline=1 → Content-Disposition: inline (modal viewer)
//   sinon     → attachment (download direct)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { downloadSignDocument } from '@/lib/sign/storage'
import { generateReportPdf } from '@/lib/report/pdf-generator'
import { getReportLinkById } from '@/lib/report/queries'
import type { ReportSubmission } from '@/lib/report/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  try {
    const { slug, id } = await params
    if (!slug || slug.length < 8 || !id) {
      return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 })
    }
    const dispositionMode = new URL(req.url).searchParams.get('inline') === '1' ? 'inline' : 'attachment'

    const admin = createAdminClient()

    // 1. Portal
    const { data: portal } = await (admin as any)
      .from('client_portals')
      .select('id, client_id, is_active')
      .eq('slug', slug)
      .maybeSingle()
    if (!portal) return NextResponse.json({ error: 'Lien invalide' }, { status: 404 })
    if (!portal.is_active) return NextResponse.json({ error: 'Lien révoqué' }, { status: 410 })

    // 2. Submission + ownership check
    const { data: subRow } = await (admin as any)
      .from('report_submissions')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (!subRow) return NextResponse.json({ error: 'Rapport introuvable' }, { status: 404 })
    const submission = subRow as ReportSubmission

    // 3. Vérifie ownership via report_link_clients
    if (!submission.report_link_client_id) {
      return NextResponse.json({ error: 'Rapport non rattaché' }, { status: 403 })
    }
    const { data: rlc } = await (admin as any)
      .from('report_link_clients')
      .select('id, client_id, link_id')
      .eq('id', submission.report_link_client_id)
      .maybeSingle()
    if (!rlc || rlc.client_id !== portal.client_id) {
      return NextResponse.json({ error: 'Rapport non autorisé' }, { status: 403 })
    }

    const week = submission.week_start.replace(/-/g, '')

    // 4. PDF stampé → stream Storage
    const reportEntry = (submission.signed_pdf_paths || []).find(
      p => !/certificat/i.test(p.name || '') && !/certificat/i.test(p.path || ''),
    )
    if (reportEntry) {
      const blob = await downloadSignDocument(reportEntry.path)
      const buffer = Buffer.from(await blob.arrayBuffer())
      const filename = `Rapport-${week}-${reportEntry.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      return new NextResponse(buffer as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `${dispositionMode}; filename="${filename}"`,
          'Content-Length': String(buffer.length),
          'Cache-Control': 'private, no-cache, no-store',
        },
      })
    }

    // 5. Pas encore stampé → génère à la volée (aperçu pré-signature)
    const link = await getReportLinkById(rlc.link_id)
    if (!link) return NextResponse.json({ error: 'Lien rapport introuvable' }, { status: 404 })

    let candidat: { prenom: string | null; nom: string | null; email: string | null } | null = null
    if (link.candidat_id) {
      try {
        const { data } = await (admin as any)
          .from('candidats')
          .select('prenom, nom, email')
          .eq('id', link.candidat_id)
          .maybeSingle()
        candidat = data as { prenom: string | null; nom: string | null; email: string | null } | null
      } catch { /* silent */ }
    }
    if (!candidat && link.candidat_name) {
      const parts = link.candidat_name.trim().split(/\s+/)
      candidat = { prenom: parts[0] || null, nom: parts.slice(1).join(' ') || null, email: null }
    }

    let stamped: { name: string; pdfBase64: string }[] = []
    try {
      const docs = await generateReportPdf({ link, submission, candidat })
      stamped = docs.map(d => ({ name: d.name, pdfBase64: d.pdfBase64 }))
    } catch (e) {
      console.error('[client-portal/document] generateReportPdf failed', e)
      return NextResponse.json({
        error: 'PDF en cours de génération — réessayez dans quelques secondes',
      }, { status: 503 })
    }

    if (stamped.length === 0) {
      return NextResponse.json({ error: 'Aucun PDF disponible' }, { status: 404 })
    }
    const reportDoc = stamped.find(d => !/certificat/i.test(d.name)) || stamped[0]
    const buffer = Buffer.from(reportDoc.pdfBase64, 'base64')
    const filename = `Rapport-${week}-${reportDoc.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${dispositionMode}; filename="${filename}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, no-cache, no-store',
      },
    })
  } catch (e: any) {
    console.error('[client-portal/document] error', e)
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
