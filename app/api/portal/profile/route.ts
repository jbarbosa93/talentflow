// GET /api/portal/profile — Profil du candidat connecté (portail /report).
// v2.10.35 — PUBLIC (lit le cookie portail candidat). Renvoie UNIQUEMENT les
// données du candidat connecté (résolu via sa session → report_links.candidat_id).
// Lecture seule. Inclut la mission en cours + l'entreprise si dispo.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifySession, getPortalJwt } from '@/lib/portal-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// v2.13.7 — Distingue « pas authentifié » (→ 401, déconnexion légitime) de
// « authentifié mais aucun candidat lié » (→ candidateId null, on renverra 200
// vide → la page reste connectée et affiche « pas de rapport », PAS de logout).
async function resolveContext(): Promise<{ authed: boolean; candidateId: string | null; reportLinkId: string; slug: string } | null> {
  const jwt = await getPortalJwt('candidat')
  const session = jwt ? await verifySession(jwt) : null
  if (!session || session.accountType !== 'candidat') return null // vraiment pas connecté
  let candidateId: string | null = null
  let slug = ''
  if (session.reportLinkId) {
    const admin = createAdminClient()
    const { data: link } = await (admin as any)
      .from('report_links')
      .select('candidat_id, slug')
      .eq('id', session.reportLinkId)
      .maybeSingle()
    candidateId = (link?.candidat_id as string) || null
    slug = (link?.slug as string) || ''
  }
  return { authed: true, candidateId, reportLinkId: session.reportLinkId || '', slug }
}

export async function GET() {
  const ctx = await resolveContext()
  if (!ctx) return NextResponse.json({ error: 'non connecté' }, { status: 401 })
  // Connecté mais aucun candidat lié au lien → 200 vide (la page reste connectée).
  if (!ctx.candidateId) return NextResponse.json({ profile: null, reports: { count: 0, last: null }, companies: [] })
  const { candidateId, reportLinkId, slug } = ctx as { candidateId: string; reportLinkId: string; slug: string }

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

// v2.13.31 — PATCH : le candidat renseigne sa date de naissance SI ELLE EST VIDE.
// Règle métier ABSOLUE : date_naissance = identité → IMMUABLE. On ne remplit que si
// elle est NULL (garde-fou au niveau SQL avec .is('date_naissance', null)) ; jamais
// d'écrasement d'une valeur existante. Sert à la notification d'anniversaire.
export async function PATCH(req: Request) {
  const ctx = await resolveContext()
  if (!ctx) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  if (!ctx.candidateId) return NextResponse.json({ error: 'Aucun dossier candidat lié' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const dn = typeof body.date_naissance === 'string' ? body.date_naissance.trim() : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dn)) {
    return NextResponse.json({ error: 'Date invalide (format attendu : AAAA-MM-JJ)' }, { status: 400 })
  }
  // Bornes raisonnables (évite les fautes de frappe : 1920–aujourd'hui)
  const year = Number(dn.slice(0, 4))
  const nowYear = new Date().getFullYear()
  if (year < 1920 || year > nowYear) {
    return NextResponse.json({ error: 'Année invalide' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: cur } = await (admin as any)
    .from('candidats').select('date_naissance').eq('id', ctx.candidateId).maybeSingle()
  if (cur?.date_naissance) {
    return NextResponse.json({ error: 'Date de naissance déjà renseignée' }, { status: 409 })
  }
  const { error } = await (admin as any)
    .from('candidats')
    .update({ date_naissance: dn })
    .eq('id', ctx.candidateId)
    .is('date_naissance', null) // garde-fou immuabilité : n'écrase jamais une valeur existante
  if (error) return NextResponse.json({ error: 'Erreur lors de l\'enregistrement' }, { status: 500 })

  return NextResponse.json({ ok: true, date_naissance: dn })
}
