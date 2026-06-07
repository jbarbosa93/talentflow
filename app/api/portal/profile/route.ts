// GET /api/portal/profile — Profil du candidat connecté (portail /report).
// v2.10.35 — PUBLIC (lit le cookie portail candidat). Renvoie UNIQUEMENT les
// données du candidat connecté (résolu via sa session → report_links.candidat_id).
// Lecture seule. Inclut la mission en cours + l'entreprise si dispo.

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifySession, cookieName } from '@/lib/portal-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function resolveContext(): Promise<{ candidateId: string; reportLinkId: string; slug: string } | null> {
  const jar = await cookies()
  const jwt = jar.get(cookieName('candidat'))?.value
  if (!jwt) return null
  const session = await verifySession(jwt)
  if (!session || session.accountType !== 'candidat' || !session.reportLinkId) return null
  const admin = createAdminClient()
  const { data: link } = await (admin as any)
    .from('report_links')
    .select('candidat_id, slug')
    .eq('id', session.reportLinkId)
    .maybeSingle()
  if (!link?.candidat_id) return null
  return { candidateId: link.candidat_id as string, reportLinkId: session.reportLinkId, slug: (link.slug as string) || '' }
}

export async function GET() {
  const ctx = await resolveContext()
  if (!ctx) return NextResponse.json({ error: 'non connecté' }, { status: 401 })
  const { candidateId, reportLinkId, slug } = ctx

  const admin = createAdminClient()
  const { data: c } = await (admin as any)
    .from('candidats')
    .select('id, prenom, nom, email, telephone, telephone_2, localisation, date_naissance, titre_poste, photo_url')
    .eq('id', candidateId)
    .maybeSingle()
  if (!c) return NextResponse.json({ error: 'introuvable' }, { status: 404 })

  // Mission en cours (la plus récente non terminée), + nom de l'entreprise.
  let mission: any = null
  try {
    const { data: missions } = await (admin as any)
      .from('missions')
      .select('id, client_id, metier, date_debut, date_fin, statut')
      .eq('candidat_id', candidateId)
      .order('date_debut', { ascending: false })
      .limit(5)
    const today = new Date().toISOString().slice(0, 10)
    const current = (missions || []).find((m: any) =>
      (!m.date_fin || m.date_fin >= today) && (!m.statut || /cours|active|en_cours/i.test(String(m.statut))),
    ) || (missions || [])[0] || null
    if (current) {
      let clientName = ''
      if (current.client_id) {
        const { data: cl } = await (admin as any)
          .from('clients').select('nom').eq('id', current.client_id).maybeSingle()
        clientName = (cl?.nom as string) || ''
      }
      const active = !current.date_fin || current.date_fin >= today
      mission = {
        entreprise: clientName,
        metier: current.metier || null,
        date_debut: current.date_debut || null,
        date_fin: current.date_fin || null,
        active,
      }
    }
  } catch { /* mission best-effort */ }

  // Photo : signe l'URL si c'est un chemin de stockage privé (sinon renvoie tel quel).
  let photoUrl: string | null = (c.photo_url as string) || null
  if (photoUrl && !/^https?:\/\//.test(photoUrl)) {
    try {
      const path = photoUrl.replace(/^\/+/, '')
      const { data: signed } = await (admin as any).storage
        .from('candidat-photos')
        .createSignedUrl(path, 60 * 60)
      if (signed?.signedUrl) photoUrl = signed.signedUrl
    } catch { /* garde la valeur brute */ }
  }

  // Entreprises du lien + infos mission (contact, dates) — pour l'Accueil.
  let companies: any[] = []
  try {
    const { data: rlc } = await (admin as any)
      .from('report_link_clients')
      .select('client_name, mission_contact_name, mission_phone, mission_start_date, mission_end_date, display_order')
      .eq('link_id', reportLinkId)
      .order('display_order', { ascending: true })
    companies = (rlc || []).map((r: any) => ({
      name: r.client_name || '',
      contact_name: r.mission_contact_name || '',
      contact_phone: r.mission_phone || '',
      start: r.mission_start_date || null,
      end: r.mission_end_date || null,
    }))
  } catch { /* best-effort */ }

  // Résumé rapports (pour le tableau de bord Accueil).
  let reports: { count: number; last: null | { status: string; week_start: string | null; week_end: string | null } } = { count: 0, last: null }
  try {
    const { data: subs } = await (admin as any)
      .from('report_submissions')
      .select('status, week_start, week_end, created_at')
      .eq('link_id', reportLinkId)
      .order('created_at', { ascending: false })
      .limit(50)
    const list = (subs || []) as any[]
    reports = {
      count: list.length,
      last: list[0] ? { status: list[0].status || '', week_start: list[0].week_start || null, week_end: list[0].week_end || null } : null,
    }
  } catch { /* best-effort */ }

  return NextResponse.json({
    slug,
    reports,
    companies,
    profile: {
      prenom: c.prenom || '',
      nom: c.nom || '',
      email: c.email || '',
      telephone: c.telephone || '',
      telephone_2: c.telephone_2 || '',
      localisation: c.localisation || '',
      date_naissance: c.date_naissance || '',
      titre_poste: c.titre_poste || '',
      photo_url: photoUrl,
      mission,
    },
  })
}
