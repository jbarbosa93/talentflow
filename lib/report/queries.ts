// TalentFlow Rapports — Queries (Phase 5)
// v2.2.6

import { createAdminClient } from '@/lib/supabase/admin'
import type { SignTemplate } from '@/lib/sign/types'
import type { ReportLink, ReportSubmission, ReportLinkStatus } from './types'

/** Récupère un lien par son slug (route publique candidat). */
export async function getReportLinkBySlug(slug: string): Promise<ReportLink | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('report_links' as any)
    .select('*')
    .eq('slug', slug)
    .maybeSingle()
  return data as ReportLink | null
}

/** Récupère un lien par son id (dashboard). */
export async function getReportLinkById(id: string): Promise<ReportLink | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('report_links' as any)
    .select('*')
    .eq('id', id)
    .maybeSingle()
  return data as ReportLink | null
}

/** Récupère le template d'un lien (= sign_template avec kind='report'). */
export async function getTemplateForLink(templateId: string | null): Promise<SignTemplate | null> {
  if (!templateId) return null
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('sign_templates' as any)
    .select('*')
    .eq('id', templateId)
    .maybeSingle()
  return data as SignTemplate | null
}

/** Récupère une submission par (link_id, week_start[, report_link_client_id]).
 *  v2.4.0 — Si reportLinkClientId est fourni, scope sur ce triplet (UNIQUE).
 *  Si non fourni, prend la 1ʳᵉ trouvée pour (link, week) — utile au mode legacy. */
export async function getSubmissionByWeek(
  linkId: string,
  weekStart: string,
  reportLinkClientId?: string | null,
): Promise<ReportSubmission | null> {
  const supabase = createAdminClient()
  let q = supabase
    .from('report_submissions' as any)
    .select('*')
    .eq('link_id', linkId)
    .eq('week_start', weekStart)
  if (reportLinkClientId === null) q = q.is('report_link_client_id', null)
  else if (reportLinkClientId) q = q.eq('report_link_client_id', reportLinkClientId)
  const { data } = await q.maybeSingle()
  return data as ReportSubmission | null
}

/** Récupère une submission par client_token (route publique client). */
export async function getSubmissionByToken(token: string): Promise<ReportSubmission | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('report_submissions' as any)
    .select('*')
    .eq('client_token', token)
    .maybeSingle()
  return data as ReportSubmission | null
}

/** Liste paginée des liens du dashboard (filtre par status optionnel). */
export async function listReportLinks(opts: {
  status?: ReportLinkStatus | null
  search?: string | null
  limit?: number
  offset?: number
} = {}): Promise<{ links: ReportLink[]; count: number }> {
  const supabase = createAdminClient()
  let q = supabase
    .from('report_links' as any)
    .select('*', { count: 'exact' })
    .order('updated_at', { ascending: false })
  if (opts.status) q = q.eq('status', opts.status)
  if (opts.search) q = q.ilike('title', `%${opts.search}%`)
  q = q.range(opts.offset || 0, (opts.offset || 0) + (opts.limit || 50) - 1)
  const { data, count } = await q
  return { links: (data || []) as unknown as ReportLink[], count: count ?? 0 }
}

/** Liste les submissions d'un lien (pour la page détail). */
export async function listSubmissions(linkId: string): Promise<ReportSubmission[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('report_submissions' as any)
    .select('*')
    .eq('link_id', linkId)
    .order('week_start', { ascending: false })
  return (data || []) as unknown as ReportSubmission[]
}

/** Liste cross-links des N dernières submissions (page "Soumissions récentes"). */
export async function listRecentSubmissions(limit = 50): Promise<
  Array<ReportSubmission & { link?: Pick<ReportLink, 'id' | 'slug' | 'title' | 'candidat_id' | 'client_name'> }>
> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('report_submissions' as any)
    .select('*, link:report_links(id, slug, title, candidat_id, client_name)')
    .order('updated_at', { ascending: false })
    .limit(limit)
  return (data || []) as unknown as Array<ReportSubmission & {
    link?: Pick<ReportLink, 'id' | 'slug' | 'title' | 'candidat_id' | 'client_name'>
  }>
}
