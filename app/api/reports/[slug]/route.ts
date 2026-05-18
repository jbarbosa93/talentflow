// TalentFlow Rapports — Route publique candidat (GET infos lien)
// v2.2.6 Phase 5
//
// Renvoie au candidat :
//   - Lien (titre, candidat lié, status)
//   - Template (documents + fields placés à l'éditeur Sign)
//   - Liste des submissions existantes (semaines déjà soumises → lecture seule)
//
// Pas d'auth (lien permanent). Si status != 'active' → erreur 403.

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  getReportLinkBySlug, getTemplateForLink, listSubmissions,
} from '@/lib/report/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifySession, cookieName } from '@/lib/portal-auth'

export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params
  if (!slug) return NextResponse.json({ error: 'slug manquant' }, { status: 400 })

  const link = await getReportLinkBySlug(slug)
  if (!link) {
    return NextResponse.json({ valid: false, reason: 'not_found' }, { status: 404 })
  }
  if (link.status !== 'active') {
    return NextResponse.json({
      valid: false,
      reason: link.status === 'paused' ? 'paused' : 'revoked',
    }, { status: 403 })
  }

  // v2.9.0 — Si auth_required, vérifier la session candidat
  if ((link as any).auth_required) {
    const jar = await cookies()
    const jwt = jar.get(cookieName('candidat'))?.value
    const session = jwt ? await verifySession(jwt) : null
    if (!session || session.reportLinkId !== link.id) {
      return NextResponse.json({ valid: false, reason: 'auth_required' }, { status: 401 })
    }
    const supabase = createAdminClient()
    const { data: account } = await (supabase as any)
      .from('portal_accounts')
      .select('is_revoked')
      .eq('id', session.accountId)
      .maybeSingle()
    if (!account || account.is_revoked) {
      return NextResponse.json({ valid: false, reason: 'auth_required' }, { status: 401 })
    }
  }

  const template = await getTemplateForLink(link.template_id)
  if (!template) {
    return NextResponse.json({ valid: false, reason: 'no_template' }, { status: 404 })
  }
  // Wizard config (mêmes patterns que /sign/v/[token])
  const tplExtra = template as unknown as { wizard_enabled?: boolean; wizard_steps?: unknown[] }
  const wizardEnabled = tplExtra.wizard_enabled !== false
  const wizardSteps = Array.isArray(tplExtra.wizard_steps) ? tplExtra.wizard_steps : []

  // Récup candidat lié pour pré-fill (collaborateur name)
  // v2.3.x — Priorité : (a) candidat lié en DB (candidat_id) → fetch fiche complète,
  //                     (b) sinon candidat_name saisi manuellement sur le lien → split en prenom/nom.
  // Source unique côté front : `candidat.prenom + candidat.nom` qui alimente l'autoFill PublicFieldsLayer.
  let candidat: { prenom: string | null; nom: string | null; email: string | null } | null = null
  if (link.candidat_id) {
    try {
      const supabase = createAdminClient()
      const { data } = await supabase
        .from('candidats')
        .select('prenom, nom, email')
        .eq('id', link.candidat_id)
        .maybeSingle()
      candidat = data as { prenom: string | null; nom: string | null; email: string | null } | null
    } catch { /* silent */ }
  }

  // Fallback : si pas de candidat lié OU fetch raté, utilise candidat_name du lien (split)
  if (!candidat && link.candidat_name && link.candidat_name.trim()) {
    const parts = link.candidat_name.trim().split(/\s+/)
    candidat = {
      prenom: parts[0] || null,
      nom: parts.slice(1).join(' ') || null,
      email: null,
    }
  }

  // v2.7.1 — Si le lien est rattaché à une mission, récupérer les arrêts pour bloquer
  // les jours côté form candidat. Best-effort (silent fail si KO).
  let missionArrets: { debut: string; fin: string }[] = []
  const missionId = (link as any).mission_id as string | null
  if (missionId) {
    try {
      const supabase = createAdminClient()
      const { data } = await (supabase as any)
        .from('missions')
        .select('arrets')
        .eq('id', missionId)
        .maybeSingle()
      const raw = (data as any)?.arrets
      if (Array.isArray(raw)) {
        missionArrets = raw.filter(
          (a: any) => a && typeof a.debut === 'string' && typeof a.fin === 'string'
        )
      }
    } catch { /* silent */ }
  }

  // Submissions existantes (pour bloquer les semaines déjà soumises ET montrer l'historique)
  const submissions = await listSubmissions(link.id)

  // Expose UN MINIMUM côté public : pas de sender info, pas d'audit, juste ce qu'il faut
  return NextResponse.json({
    valid: true,
    link: {
      id: link.id,
      slug: link.slug,
      title: link.title,
      client_name: link.client_name,
      delivery_channel: link.delivery_channel,
      auth_required: !!(link as any).auth_required,
    },
    candidat,
    template: {
      id: template.id,
      name: template.name,
      documents: template.documents,
    },
    wizard: { enabled: wizardEnabled, steps: wizardSteps },
    /** v2.7.1 — Arrêts maladie/accident de la mission liée (si applicable).
     *  Exposé côté candidat pour griser les jours d'arrêt dans le form. */
    mission_arrets: missionArrets,
    submissions: submissions.map(s => ({
      id: s.id,
      week_start: s.week_start,
      week_end: s.week_end,
      status: s.status,
      candidate_signed_at: s.candidate_signed_at,
      client_signed_at: s.client_signed_at,
      // v2.4.2 — Permet à la page candidat de retrouver l'entreprise lors de
      // la reprise d'un brouillon ou pour l'affichage du nom dans MissionList.
      report_link_client_id: (s as any).report_link_client_id ?? null,
      // On ne renvoie PAS field_values ici (lourd + peut-être confidentiel client_*)
      // — la page candidat fetch /api/reports/[slug]/draft?week=... pour reprendre.
    })),
  })
}
