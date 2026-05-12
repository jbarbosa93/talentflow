// v2.7.3 — Download PDF stampé depuis le token client
// Génère à la volée si pas encore stampé (status='candidate_signed').
// ?inline=1 → Content-Disposition: inline (preview iframe)
// sinon → attachment (download direct)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSubmissionByToken, getReportLinkById } from '@/lib/report/queries'
import { downloadSignDocument } from '@/lib/sign/storage'
import { generateReportPdf } from '@/lib/report/pdf-generator'
import type { ReportSubmission } from '@/lib/report/types'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await ctx.params
    if (!token) return NextResponse.json({ error: 'Token manquant' }, { status: 400 })

    const dispositionMode = new URL(req.url).searchParams.get('inline') === '1' ? 'inline' : 'attachment'

    const submission = await getSubmissionByToken(token)
    if (!submission) return NextResponse.json({ error: 'Token invalide' }, { status: 404 })
    if (submission.client_token_expires_at) {
      if (new Date(submission.client_token_expires_at).getTime() < Date.now()) {
        return NextResponse.json({ error: 'Token expiré' }, { status: 410 })
      }
    }

    const link = await getReportLinkById(submission.link_id)
    if (!link) return NextResponse.json({ error: 'Lien introuvable' }, { status: 404 })

    const week = submission.week_start.replace(/-/g, '')
    const candidatNameSafe = (link.candidat_name || 'Rapport').replace(/[^a-zA-Z0-9-_]/g, '_')

    // 1. PDF stampé déjà en Storage (status='completed')
    const reportEntry = (submission.signed_pdf_paths || []).find(
      p => !/certificat/i.test(p.name || '') && !/certificat/i.test(p.path || ''),
    )
    if (reportEntry) {
      const blob = await downloadSignDocument(reportEntry.path)
      const buffer = Buffer.from(await blob.arrayBuffer())
      const filename = `Rapport_${candidatNameSafe}_S${week}.pdf`
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

    // 2. Pas encore stampé → génère à la volée (status='candidate_signed')
    const supabase = createAdminClient()
    let candidat: { prenom: string | null; nom: string | null; email: string | null } | null = null
    if (link.candidat_id) {
      try {
        const { data } = await (supabase as any)
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
      const docs = await generateReportPdf({ link, submission: submission as ReportSubmission, candidat })
      stamped = docs.map(d => ({ name: d.name, pdfBase64: d.pdfBase64 }))
    } catch (e) {
      console.error('[reports/client/download] generateReportPdf failed', e)
      return NextResponse.json({
        error: 'PDF en cours de génération — réessayez dans quelques secondes',
      }, { status: 503 })
    }

    if (stamped.length === 0) {
      return NextResponse.json({ error: 'Aucun PDF disponible' }, { status: 404 })
    }
    const reportDoc = stamped.find(d => !/certificat/i.test(d.name)) || stamped[0]
    const buffer = Buffer.from(reportDoc.pdfBase64, 'base64')
    const filename = `Rapport_${candidatNameSafe}_S${week}.pdf`
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${dispositionMode}; filename="${filename}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, no-cache, no-store',
      },
    })
  } catch (e) {
    console.error('[reports/client/download] error', e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
