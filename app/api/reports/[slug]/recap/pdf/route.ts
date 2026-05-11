// TalentFlow Rapports — Récapitulatif par période (PDF, route publique)
// v2.4.1 — Phase 2
//
// GET /api/reports/[slug]/recap/pdf?from=YYYY-MM-DD&to=YYYY-MM-DD&scope=candidate|dashboard
//
// Stream un PDF A4 simple :
//   - Header L-Agence
//   - Nom candidat + période
//   - Tableau par mission (entreprise, count semaines, heures, repas)
//   - Total général
//   - Footer "Généré par TalentFlow · {date}"

import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { createAdminClient } from '@/lib/supabase/admin'
import { getReportLinkBySlug, getTemplateForLink } from '@/lib/report/queries'
import {
  aggregateTotals, sumSubmissionMetrics, formatHours, type SubmissionTotals,
  CANDIDATE_RECAP_STATUSES, DASHBOARD_RECAP_STATUSES,
} from '@/lib/report/recap'
import { formatDateChDot } from '@/lib/report/text-format'
import type { SignField } from '@/lib/sign/types'
import type { ReportSubmission } from '@/lib/report/types'

export const runtime = 'nodejs'
export const maxDuration = 30

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params
  if (!slug) return NextResponse.json({ error: 'slug manquant' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const from = (searchParams.get('from') || '').trim()
  const to = (searchParams.get('to') || '').trim()
  const scope = searchParams.get('scope') === 'dashboard' ? 'dashboard' : 'candidate'

  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) {
    return NextResponse.json({ error: 'from/to invalides' }, { status: 400 })
  }

  const link = await getReportLinkBySlug(slug)
  if (!link) return NextResponse.json({ error: 'Lien introuvable' }, { status: 404 })
  if (link.status !== 'active') return NextResponse.json({ error: 'Lien inactif' }, { status: 403 })

  const template = await getTemplateForLink(link.template_id)
  if (!template) return NextResponse.json({ error: 'Template introuvable' }, { status: 404 })

  const templateFields: SignField[] = (template.documents || []).flatMap(d => d.fields || [])
  const statuses = scope === 'dashboard' ? DASHBOARD_RECAP_STATUSES : CANDIDATE_RECAP_STATUSES

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('report_submissions' as any)
    .select('id, week_start, week_end, status, field_values, report_link_client_id')
    .eq('link_id', link.id)
    .gte('week_start', from)
    .lte('week_start', to)
    .in('status', statuses as any)
    .order('week_start', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const submissions = (data || []) as unknown as ReportSubmission[]

  const linkClientIds = Array.from(new Set(submissions.map(s => s.report_link_client_id).filter(Boolean))) as string[]
  let clientsById = new Map<string, string>()
  if (linkClientIds.length > 0) {
    const { data: clients } = await supabase
      .from('report_link_clients' as any)
      .select('id, client_name')
      .in('id', linkClientIds)
    for (const c of (clients || []) as any[]) clientsById.set(c.id, c.client_name)
  }

  const fallbackName = link.client_name || 'Sans entreprise'
  const missionMap = new Map<string, {
    client_name: string; count: number; totals: SubmissionTotals;
  }>()
  for (const s of submissions) {
    const key = s.report_link_client_id || '__legacy__'
    const clientName = s.report_link_client_id
      ? (clientsById.get(s.report_link_client_id) || fallbackName)
      : fallbackName
    if (!missionMap.has(key)) {
      missionMap.set(key, { client_name: clientName, count: 0, totals: { heures_normales: 0, heures_sup: 0, repas: 0, deplacement: 0 } })
    }
    const m = missionMap.get(key)!
    m.count += 1
    m.totals = aggregateTotals([m.totals, sumSubmissionMetrics(s, templateFields)])
  }
  const byMission = Array.from(missionMap.values()).sort((a, b) => b.totals.heures_normales - a.totals.heures_normales)
  const total = aggregateTotals(byMission.map(m => m.totals))

  // ─── Génération PDF ─────────────────────────────────────────────
  const pdf = await PDFDocument.create()
  const helv = await pdf.embedFont(StandardFonts.Helvetica)
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const page = pdf.addPage([595, 842])
  const W = 595
  const M = 50
  let y = 800

  page.drawRectangle({ x: 0, y: y - 12, width: W, height: 50, color: rgb(0.918, 0.706, 0.031) })
  page.drawText('L-AGENCE', { x: M, y: y + 4, size: 22, font: helvBold, color: rgb(0.11, 0.10, 0.08) })
  page.drawText('Recapitulatif des heures', { x: M, y: y - 8, size: 9.5, font: helv, color: rgb(0.31, 0.27, 0.13) })

  y -= 56

  const candidatName = (link.candidat_name || '').trim() || 'Collaborateur'
  page.drawText(asciiSafe(candidatName), { x: M, y, size: 14, font: helvBold, color: rgb(0.11, 0.10, 0.08) })
  y -= 18
  const period = `Periode du ${formatDateChDot(from)} au ${formatDateChDot(to)}`
  page.drawText(period, { x: M, y, size: 11, font: helv, color: rgb(0.40, 0.43, 0.49) })
  y -= 12
  const subsLine = `${submissions.length} rapport${submissions.length > 1 ? 's' : ''} ${scope === 'dashboard' ? '(tous statuts incl. en attente)' : 'complete' + (submissions.length > 1 ? 's' : '')}`
  page.drawText(subsLine, { x: M, y, size: 10, font: helv, color: rgb(0.40, 0.43, 0.49) })

  y -= 32

  page.drawText('PAR MISSION', { x: M, y, size: 10, font: helvBold, color: rgb(0.40, 0.43, 0.49) })
  y -= 4
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: rgb(0.85, 0.85, 0.85) })
  y -= 18

  if (byMission.length === 0) {
    page.drawText('Aucune mission sur cette periode.', { x: M, y, size: 11, font: helv, color: rgb(0.55, 0.55, 0.6) })
    y -= 24
  } else {
    for (const m of byMission) {
      page.drawRectangle({
        x: M, y: y - 38, width: W - 2 * M, height: 46,
        borderColor: rgb(0.88, 0.88, 0.9), borderWidth: 0.8,
        color: rgb(0.99, 0.99, 0.97),
      })
      page.drawText(asciiSafe(m.client_name), { x: M + 12, y: y - 6, size: 12, font: helvBold, color: rgb(0.11, 0.10, 0.08) })
      const line2 = compactLine(m.count, m.totals)
      page.drawText(asciiSafe(line2), { x: M + 12, y: y - 24, size: 10.5, font: helv, color: rgb(0.40, 0.43, 0.49) })
      y -= 56
      if (y < 200) break  // page break simple : on s'arrête (12 missions max raisonnable)
    }
  }

  y -= 8

  page.drawText('TOTAL PERIODE', { x: M, y, size: 11, font: helvBold, color: rgb(0.40, 0.43, 0.49) })
  y -= 4
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: rgb(0.85, 0.85, 0.85) })
  y -= 22

  const rows: [string, string][] = [
    ['Heures normales',         `${formatHours(total.heures_normales)} h`],
    ['Heures supplementaires',  `${formatHours(total.heures_sup)} h`],
    ['Temps de deplacement',    `${formatHours(total.deplacement)} h`],
    ['Repas',                    `${total.repas}`],
  ]
  for (const [k, v] of rows) {
    page.drawText(k, { x: M, y, size: 11, font: helv, color: rgb(0.20, 0.20, 0.22) })
    const w = helvBold.widthOfTextAtSize(v, 11)
    page.drawText(v, { x: W - M - w, y, size: 11, font: helvBold, color: rgb(0.11, 0.10, 0.08) })
    y -= 22
  }

  const footer = `Genere par TalentFlow - ${formatDateChDot(new Date().toISOString().slice(0, 10))}`
  page.drawText(footer, { x: M, y: 40, size: 9, font: helv, color: rgb(0.60, 0.60, 0.65) })
  page.drawText(`Lien : talent-flow.ch/report/${slug}`, { x: M, y: 28, size: 8.5, font: helv, color: rgb(0.66, 0.66, 0.71) })

  const bytes = await pdf.save()
  const filename = `recap_${slugify(candidatName)}_${from}_${to}.pdf`
  return new Response(bytes as any, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

function compactLine(count: number, t: SubmissionTotals): string {
  const parts: string[] = [`${count} semaine${count > 1 ? 's' : ''}`]
  if (t.heures_normales > 0) parts.push(`${formatHours(t.heures_normales)}h`)
  if (t.heures_sup > 0) parts.push(`${formatHours(t.heures_sup)}h sup`)
  if (t.repas > 0) parts.push(`${t.repas} repas`)
  if (t.deplacement > 0) parts.push(`${formatHours(t.deplacement)}h depl.`)
  return parts.join(' - ')
}

/** pdf-lib StandardFonts (WinAnsi) ne gère pas U+0080+ correctement → strip accents. */
function asciiSafe(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/[•]/g, '*')
    .replace(/[  ​]/g, ' ')
}

function slugify(s: string): string {
  return asciiSafe(s).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'recap'
}
