// TalentFlow Rapports — Download d'une submission spécifique (Bug 4 v2.3.x)
// v2.3.2
//
// URL : GET /api/reports/{slug}/submissions/{id}/download
// Auth : lien actif uniquement (slug public, pas de cookie session).
//
// Comportement :
//   - Vérifie que `slug` matche un lien actif
//   - Vérifie que `id` (submission) appartient bien à ce lien (sécurité)
//   - Si signed_pdf_paths non vide → stream le 1er PDF depuis Storage (PDF final stampé)
//   - Sinon → génère à la volée un PDF stampé avec valeurs candidat (+ signature
//     candidat si dispo). Utile pour télécharger un aperçu avant signature client
//     (status='candidate_signed') ou même un brouillon (status='draft').

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getReportLinkBySlug } from '@/lib/report/queries'
import { downloadSignDocument } from '@/lib/sign/storage'
import { generateReportPdf } from '@/lib/report/pdf-generator'
import type { ReportSubmission } from '@/lib/report/types'

export const runtime = 'nodejs'
export const maxDuration = 60

interface Ctx {
  params: Promise<{ slug: string; id: string }>
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { slug, id } = await ctx.params
    if (!slug || !id) {
      return NextResponse.json({ error: 'slug + id requis' }, { status: 400 })
    }
    // v2.4.7 — Mode inline (preview iframe) vs attachment (download direct)
    // ?inline=1 → Content-Disposition: inline (modal viewer)
    // sinon → attachment (téléchargement direct)
    const dispositionMode = new URL(req.url).searchParams.get('inline') === '1' ? 'inline' : 'attachment'

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

    const week = submission.week_start.replace(/-/g, '')

    // 1. PDF final déjà stampé (status='completed') → stream depuis Storage
    // v2.3.9 Bug 11c — Filtre explicite : exclure les certificats (route dédiée).
    // Cette route ne renvoie QUE le rapport signé, jamais le certificat.
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

    // 2. PDF pas encore stampé → génère à la volée (aperçu)
    // Récup candidat lié (si dispo) pour pré-fill autoFill
    let candidat: { prenom: string | null; nom: string | null; email: string | null } | null = null
    if (link.candidat_id) {
      try {
        const { data } = await supabase
          .from('candidats')
          .select('prenom, nom, email')
          .eq('id', link.candidat_id)
          .maybeSingle()
        candidat = data as { prenom: string | null; nom: string | null; email: string | null } | null
      } catch { /* silent */ }
    }
    if (!candidat && link.candidat_name) {
      const parts = link.candidat_name.trim().split(/\s+/)
      candidat = {
        prenom: parts[0] || null,
        nom: parts.slice(1).join(' ') || null,
        email: null,
      }
    }

    let stamped: { name: string; pdfBase64: string }[] = []
    try {
      const docs = await generateReportPdf({ link, submission, candidat })
      stamped = docs.map(d => ({ name: d.name, pdfBase64: d.pdfBase64 }))
    } catch (e) {
      console.error('[reports/download] generateReportPdf failed', e)
      return NextResponse.json({
        error: 'PDF en cours de génération — réessayez dans quelques secondes',
      }, { status: 503 })
    }

    if (stamped.length === 0) {
      return NextResponse.json({
        error: 'Aucun PDF disponible pour cette submission',
      }, { status: 404 })
    }

    // v2.3.9 Bug 11c — Stream le RAPPORT (filtre exclure certificat)
    const reportDoc = stamped.find(d => !/certificat/i.test(d.name)) || stamped[0]
    const buffer = Buffer.from(reportDoc.pdfBase64, 'base64')
    const filename = `Rapport-${week}-${reportDoc.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
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
    console.error('[reports/download] error', e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
