// TalentFlow Rapports — Liste publique des entreprises autorisées d'un lien
// v2.4.0 — Phase 1
//
// Le candidat (sans auth, slug suffit) récupère les entreprises configurées
// par João pour ce lien. Sert au ClientSelector côté page candidat.
// Si aucune entreprise configurée → fallback sur les champs client_* du lien.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getReportLinkBySlug } from '@/lib/report/queries'

export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params
  if (!slug) return NextResponse.json({ error: 'slug manquant' }, { status: 400 })

  const link = await getReportLinkBySlug(slug)
  if (!link) return NextResponse.json({ error: 'Lien introuvable' }, { status: 404 })
  if (link.status !== 'active') return NextResponse.json({ error: 'Lien inactif' }, { status: 403 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('report_link_clients' as any)
    .select('id, client_name, client_email, client_contact_name, client_phone, mission_contact_name, mission_phone, mission_start_date, mission_end_date, display_order')
    .eq('link_id', link.id)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ clients: data || [] })
}
