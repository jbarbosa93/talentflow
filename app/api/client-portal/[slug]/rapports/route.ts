// GET /api/client-portal/[slug]/rapports — Liste publique des rapports d'heures
// du client (portail). v2.7.2
//
// Q1=B : on inclut TOUTES les submissions dont report_link_clients.client_id
// matche portal.client_id (= historique élargi, même après fin de mission).
//
// Filtres optionnels :
//   ?status=pending     → status='candidate_signed' (à valider)
//   ?status=completed   → status='completed'
//   ?status=draft       → status='draft'
//   ?candidat_id=uuid   → filtre par candidat
//
// Sécurité : slug imprévisible + portal.is_active. Pas d'auth.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sumSubmissionMetrics } from '@/lib/report/recap'
import type { SignTemplate, SignField } from '@/lib/sign/types'
import type { ReportSubmission, ReportSubmissionStatus } from '@/lib/report/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RapportPayload {
  id: string
  link_id: string
  report_link_client_id: string | null
  candidat_id: string | null
  candidat_name: string
  candidat_photo_url: string | null
  week_start: string
  week_end: string
  status: ReportSubmissionStatus
  client_contact_name: string | null
  client_name: string
  mission_metier_display: string | null
  /** Totaux calculés (heures normales, repas, etc.) */
  totals: {
    heures_normales: number
    heures_sup: number
    repas: number
    deplacement: number
  }
  /** Notes candidat (à destination du responsable) — affichées bandeau amber. */
  notes_candidat: string | null
  /** v2.7.3 — Notes client (saisies depuis /report/client/[token]) — bandeau bleu. */
  notes_client: string | null
  /** Token client pour /report/client/{token}. Renseigné UNIQUEMENT si status='candidate_signed'
   *  ET token non expiré. NULL sinon (le client doit régénérer via /refresh-token). */
  client_token: string | null
  /** Si token expiré et status='candidate_signed' → indique au front qu'il faut régénérer. */
  client_token_expired: boolean
  client_token_expires_at: string | null
  /** Indique si un PDF stampé existe (= signed_pdf_paths non vide). */
  has_signed_pdf: boolean
  /** Slug du lien rapport (utile pour télécharger via route publique existante). */
  link_slug: string
  candidate_signed_at: string | null
  client_signed_at: string | null
  created_at: string
  updated_at: string
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params
    if (!slug || slug.length < 8) {
      return NextResponse.json({ error: 'Lien invalide' }, { status: 404 })
    }

    const statusFilter = req.nextUrl.searchParams.get('status')
    const candidatIdFilter = req.nextUrl.searchParams.get('candidat_id')

    const admin = createAdminClient()

    // 1. Portal
    const { data: portal } = await (admin as any)
      .from('client_portals')
      .select('id, client_id, is_active')
      .eq('slug', slug)
      .maybeSingle()
    if (!portal) return NextResponse.json({ error: 'Lien invalide' }, { status: 404 })
    if (!portal.is_active) return NextResponse.json({ error: 'Lien révoqué' }, { status: 410 })

    // 2. Récupère tous les report_link_clients dont client_id matche
    const { data: rlcRows } = await (admin as any)
      .from('report_link_clients')
      .select('id, link_id, client_id, client_name, client_contact_name')
      .eq('client_id', portal.client_id)

    const rlcs = (rlcRows ?? []) as Array<{
      id: string
      link_id: string
      client_id: string | null
      client_name: string
      client_contact_name: string | null
    }>

    if (rlcs.length === 0) {
      return NextResponse.json({ rapports: [], counts: { total: 0, pending: 0, completed: 0, draft: 0 } })
    }

    const rlcIds = rlcs.map(r => r.id)
    const linkIds = Array.from(new Set(rlcs.map(r => r.link_id)))

    // 3. Submissions
    let subQuery = (admin as any)
      .from('report_submissions')
      .select('*')
      .in('report_link_client_id', rlcIds)
      .order('week_start', { ascending: false })

    if (statusFilter === 'pending') subQuery = subQuery.eq('status', 'candidate_signed')
    else if (statusFilter === 'completed') subQuery = subQuery.eq('status', 'completed')
    else if (statusFilter === 'draft') subQuery = subQuery.eq('status', 'draft')

    const { data: submissionsRaw } = await subQuery
    let submissions = ((submissionsRaw as unknown) ?? []) as ReportSubmission[]

    // 4. Récupère liens (candidat_id, candidat_name, slug, template_id)
    const { data: linksRaw } = await (admin as any)
      .from('report_links')
      .select('id, slug, candidat_id, candidat_name, template_id, mission_id')
      .in('id', linkIds)
    const links = ((linksRaw as unknown) ?? []) as Array<{
      id: string
      slug: string
      candidat_id: string | null
      candidat_name: string | null
      template_id: string | null
      mission_id: string | null
    }>
    const linkById = new Map(links.map(l => [l.id, l]))

    // Filtre optionnel candidat
    if (candidatIdFilter) {
      const allowedLinkIds = new Set(links.filter(l => l.candidat_id === candidatIdFilter).map(l => l.id))
      submissions = submissions.filter(s => allowedLinkIds.has(s.link_id))
    }

    // 5. Photos candidats
    const candidatIds = Array.from(new Set(links.map(l => l.candidat_id).filter(Boolean) as string[]))
    const photoByCandidat = new Map<string, string | null>()
    if (candidatIds.length > 0) {
      const { data: cands } = await (admin as any)
        .from('candidats')
        .select('id, photo_url')
        .in('id', candidatIds)
      for (const c of (cands ?? []) as { id: string; photo_url: string | null }[]) {
        photoByCandidat.set(c.id, c.photo_url)
      }
    }

    // 6. Métier affiché (via mission liée si présente)
    const missionIds = Array.from(new Set(links.map(l => l.mission_id).filter(Boolean) as string[]))
    const metierByMission = new Map<string, string | null>()
    if (missionIds.length > 0) {
      const { data: missions } = await (admin as any)
        .from('missions')
        .select('id, metier, metier_display')
        .in('id', missionIds)
      for (const m of (missions ?? []) as any[]) {
        metierByMission.set(m.id, m.metier_display || m.metier || null)
      }
    }

    // 7. Templates → fields (pour totaux). Cache par template_id.
    const templateIds = Array.from(new Set(links.map(l => l.template_id).filter(Boolean) as string[]))
    const fieldsByTemplate = new Map<string, SignField[]>()
    if (templateIds.length > 0) {
      const { data: tpls } = await (admin as any)
        .from('sign_templates')
        .select('id, documents')
        .in('id', templateIds)
      for (const t of (tpls ?? []) as Array<{ id: string; documents?: SignTemplate['documents'] }>) {
        const allFields: SignField[] = []
        for (const doc of t.documents || []) {
          for (const f of doc.fields || []) allFields.push(f)
        }
        fieldsByTemplate.set(t.id, allFields)
      }
    }

    // 8. Construit le payload
    const nowMs = Date.now()
    const rlcById = new Map(rlcs.map(r => [r.id, r]))

    const rapports: RapportPayload[] = []
    for (const sub of submissions) {
      const link = linkById.get(sub.link_id)
      if (!link) continue
      const rlc = sub.report_link_client_id ? rlcById.get(sub.report_link_client_id) : null
      const fields = link.template_id ? (fieldsByTemplate.get(link.template_id) || []) : []
      const totals = sumSubmissionMetrics(sub, fields)

      // Expose client_token seulement si status='candidate_signed' et non expiré
      let exposedToken: string | null = null
      let tokenExpired = false
      if (sub.status === 'candidate_signed' && sub.client_token) {
        const exp = sub.client_token_expires_at ? new Date(sub.client_token_expires_at).getTime() : 0
        if (exp && exp > nowMs) {
          exposedToken = sub.client_token
        } else {
          tokenExpired = true
        }
      }

      rapports.push({
        id: sub.id,
        link_id: link.id,
        report_link_client_id: sub.report_link_client_id,
        candidat_id: link.candidat_id,
        candidat_name: link.candidat_name || 'Candidat',
        candidat_photo_url: link.candidat_id ? (photoByCandidat.get(link.candidat_id) || null) : null,
        week_start: sub.week_start,
        week_end: sub.week_end,
        status: sub.status,
        client_contact_name: rlc?.client_contact_name || null,
        client_name: rlc?.client_name || '',
        mission_metier_display: link.mission_id ? (metierByMission.get(link.mission_id) || null) : null,
        totals,
        notes_candidat: sub.notes_candidat ?? null,
        notes_client: (sub as any).notes_client ?? null,
        client_token: exposedToken,
        client_token_expired: tokenExpired,
        client_token_expires_at: sub.client_token_expires_at,
        has_signed_pdf: Array.isArray(sub.signed_pdf_paths) && sub.signed_pdf_paths.length > 0,
        link_slug: link.slug,
        candidate_signed_at: sub.candidate_signed_at,
        client_signed_at: sub.client_signed_at,
        created_at: sub.created_at,
        updated_at: sub.updated_at,
      })
    }

    // Counts (pour les badges/filtres) — calculé sur le résultat AVANT filtre status mais APRÈS candidat
    // Donc on récupère les counts depuis submissions (incluant déjà filtré candidat si applicable)
    const counts = {
      total: rapports.length,
      pending: rapports.filter(r => r.status === 'candidate_signed').length,
      completed: rapports.filter(r => r.status === 'completed').length,
      draft: rapports.filter(r => r.status === 'draft').length,
    }

    return NextResponse.json({ rapports, counts })
  } catch (e: any) {
    console.error('[client-portal/rapports] error', e)
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
