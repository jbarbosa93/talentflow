// GET /api/client-portal/[slug] — Endpoint PUBLIC (sans auth) pour le portail client
// v2.7.0
//
// Retourne :
//   - infos du portail (nom, client)
//   - liste des candidats EN MISSION ACTIVE chez ce client
//   - pour chaque candidat : documents conformité + métadonnées (nom, âge, métier, photo)
//
// Sécurité : le slug est imprévisible (16 chars random). Vérifie is_active=true.

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCandidatDocuments } from '@/lib/compliance/queries'
import { isDriver } from '@/lib/compliance/driver-detection'
import type { CandidatDocumentWithStatus } from '@/lib/compliance/types'
import { verifySession, cookieName } from '@/lib/portal-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface PortalCandidatPayload {
  id: string
  prenom: string | null
  nom: string | null
  date_naissance: string | null
  age: number | null
  metier_affiche: string | null
  photo_url: string | null
  is_driver: boolean
  /** v2.7.1 — Téléphone E.164 normalisé (contact rapide) */
  telephone: string | null
  /** v2.7.1 — Email candidat (contact rapide) */
  email: string | null
  /** v2.7.1 — Localisation "Ville, Pays" */
  localisation: string | null
  /** v2.7.1 — Highlight pour chauffeur : permis + échéance */
  driver_highlights: Array<{ name: string; expiry_date: string | null; status: string }>
  mission: {
    metier_display: string | null
    metier: string | null
    date_debut: string
    date_fin: string | null
    marge_brute: number | null
  } | null
  /** v2.10.7 — Absence EN COURS (aujourd'hui dans une période vacances/arrêt/absence). */
  absence: { type: 'vacances' | 'arret' | 'absence'; debut: string; fin: string } | null
  legacy_documents: { name: string; url: string; type?: string | null; uploaded_at?: string | null }[]
  compliance_documents: CandidatDocumentWithStatus[]
}

// v2.10.7 — Normalise une date (ISO ou DD/MM/YYYY) en ISO YYYY-MM-DD.
function toIsoDate(s: string | null | undefined): string | null {
  if (!s) return null
  const t = s.trim()
  const fr = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (fr) return `${fr[3]}-${fr[2]}-${fr[1]}`
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  return null
}
// v2.10.7 — Absence EN COURS aujourd'hui (priorité arrêt > vacances > absence, comme la page Missions).
function currentAbsence(m: any, todayIso: string): { type: 'vacances' | 'arret' | 'absence'; debut: string; fin: string } | null {
  const inPeriod = (periods: any): { debut: string; fin: string } | null => {
    if (!Array.isArray(periods)) return null
    for (const p of periods) {
      const d = toIsoDate(p?.debut); const f = toIsoDate(p?.fin)
      if (d && f && d <= todayIso && todayIso <= f) return { debut: d, fin: f }
    }
    return null
  }
  const arret = inPeriod(m?.arrets); if (arret) return { type: 'arret', ...arret }
  const vac = inPeriod(m?.vacances); if (vac) return { type: 'vacances', ...vac }
  const abs = inPeriod(m?.absences); if (abs) return { type: 'absence', ...abs }
  return null
}

function ageFromBirthdate(s: string | null): number | null {
  if (!s) return null
  const trimmed = s.trim()
  let d: Date
  // v2.7.1 — Support du format FR/CH "DD/MM/YYYY" (stocké en DB sur 99% des candidats),
  // en plus de l'ISO "YYYY-MM-DD".
  const frMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (frMatch) {
    const [, dd, mm, yyyy] = frMatch
    d = new Date(Number(yyyy), Number(mm) - 1, Number(dd))
  } else if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    d = new Date(trimmed)
  } else {
    d = new Date(trimmed)
  }
  if (isNaN(d.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
  return age >= 0 && age < 130 ? age : null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params
    if (!slug || slug.length < 8) {
      return NextResponse.json({ error: 'Lien invalide' }, { status: 404 })
    }

    const admin = createAdminClient()

    // 1. Portal
    const { data: portal } = await (admin as any)
      .from('client_portals')
      .select('id, client_id, slug, name, is_active, last_accessed_at, auth_required')
      .eq('slug', slug)
      .maybeSingle()
    if (!portal) return NextResponse.json({ error: 'Lien invalide' }, { status: 404 })
    if (!portal.is_active) return NextResponse.json({ error: 'Lien révoqué' }, { status: 410 })

    // 1bis. v2.9.0 — Si auth_required, vérifier la session (cookie JWT)
    if (portal.auth_required) {
      const jar = await cookies()
      const jwt = jar.get(cookieName('client'))?.value
      const session = jwt ? await verifySession(jwt) : null
      if (!session || session.portalId !== portal.id) {
        return NextResponse.json({ error: 'Authentification requise' }, { status: 401 })
      }
      // Re-check révocation côté DB
      const { data: account } = await (admin as any)
        .from('portal_accounts')
        .select('is_revoked')
        .eq('id', session.accountId)
        .maybeSingle()
      if (!account || account.is_revoked) {
        return NextResponse.json({ error: 'Accès refusé' }, { status: 401 })
      }
    }

    // 2. Client (logo, nom)
    const { data: client } = await (admin as any)
      .from('clients')
      .select('id, nom_entreprise, site_web, ville')
      .eq('id', portal.client_id)
      .maybeSingle()

    // 3. Missions actives chez ce client
    const todayIso = new Date().toISOString().slice(0, 10)
    const { data: missions } = await (admin as any)
      .from('missions')
      .select('id, candidat_id, candidat_nom, metier, metier_display, date_debut, date_fin, marge_brute, statut, vacances, arrets, absences')
      .eq('client_id', portal.client_id)
      .eq('statut', 'en_cours')
      .lte('date_debut', todayIso)
    const activeMissions = (missions || []).filter((m: any) => !m.date_fin || m.date_fin >= todayIso)
    const candIds = Array.from(new Set(activeMissions.map((m: any) => m.candidat_id).filter(Boolean) as string[]))

    if (candIds.length === 0) {
      // Update last_accessed_at quand même
      try { await (admin as any).from('client_portals').update({ last_accessed_at: new Date().toISOString() }).eq('id', portal.id) } catch {}
      return NextResponse.json({
        portal: { id: portal.id, name: portal.name, slug: portal.slug },
        client: client || null,
        candidats: [],
      })
    }

    // 4. Candidats (incluant documents legacy depuis candidats.documents JSONB + cv_url)
    const { data: cands } = await (admin as any)
      .from('candidats')
      .select('id, prenom, nom, date_naissance, photo_url, titre_poste, pipeline_metier, is_driver_override, documents, cv_url, cv_nom_fichier, telephone, email, localisation')
      .in('id', candIds)

    const candById = new Map<string, any>()
    for (const c of (cands || [])) candById.set(c.id, c)

    // 5. Documents conformité (compliance) — récup en bulk par candidat
    const candidatsOut: PortalCandidatPayload[] = []
    for (const cid of candIds) {
      const cand = candById.get(cid)
      if (!cand) continue
      const mission = activeMissions.find((m: any) => m.candidat_id === cid) || null

      let compliance: CandidatDocumentWithStatus[] = []
      try { compliance = await getCandidatDocuments(cid) } catch {}

      const legacyDocs: PortalCandidatPayload['legacy_documents'] = []
      // CV principal
      if (cand.cv_url) legacyDocs.push({ name: cand.cv_nom_fichier || 'CV', url: cand.cv_url, type: 'cv', uploaded_at: null })
      // Autres docs JSONB legacy (sans dates échéance)
      const docsArr = Array.isArray(cand.documents) ? cand.documents : []
      for (const d of docsArr) {
        if (!d || !d.url) continue
        legacyDocs.push({ name: d.name || 'Document', url: d.url, type: d.type || 'autre', uploaded_at: d.uploaded_at || null })
      }

      const candIsDriver = isDriver({
        pipeline_metier: cand.pipeline_metier,
        titre_poste: cand.titre_poste,
        is_driver_override: cand.is_driver_override,
      })

      // v2.7.1 — Highlights chauffeur : permis + CQC + carte conducteur avec date d'échéance
      const driverHighlights: PortalCandidatPayload['driver_highlights'] = []
      if (candIsDriver) {
        for (const d of compliance) {
          const cat = d.document_type?.category
          if (cat === 'permis_conduire' || cat === 'qualification') {
            driverHighlights.push({
              name: d.label || d.document_type?.name || 'Document',
              expiry_date: d.expiry_date,
              status: d.status,
            })
          }
        }
      }

      candidatsOut.push({
        id: cand.id,
        prenom: cand.prenom,
        nom: cand.nom,
        date_naissance: cand.date_naissance,
        age: ageFromBirthdate(cand.date_naissance),
        metier_affiche: mission?.metier_display || mission?.metier || cand.pipeline_metier || cand.titre_poste || null,
        photo_url: cand.photo_url,
        is_driver: candIsDriver,
        telephone: cand.telephone || null,
        email: cand.email || null,
        localisation: cand.localisation || null,
        driver_highlights: driverHighlights,
        mission: mission ? {
          metier_display: mission.metier_display,
          metier: mission.metier,
          date_debut: mission.date_debut,
          date_fin: mission.date_fin,
          marge_brute: null, // jamais exposé côté client (sensible)
        } : null,
        absence: mission ? currentAbsence(mission, todayIso) : null,
        legacy_documents: legacyDocs,
        compliance_documents: compliance,
      })
    }

    // 6. v2.7.1 — Sort par mission.date_debut DESC (la plus récente en premier).
    // Si même date ou pas de mission → fallback alphabétique.
    candidatsOut.sort((a, b) => {
      const da = a.mission?.date_debut || ''
      const db = b.mission?.date_debut || ''
      if (da && db && da !== db) return db.localeCompare(da)
      if (!da && db) return 1
      if (da && !db) return -1
      const an = `${a.prenom || ''} ${a.nom || ''}`.trim().toLowerCase()
      const bn = `${b.prenom || ''} ${b.nom || ''}`.trim().toLowerCase()
      return an.localeCompare(bn, 'fr')
    })

    // Update last_accessed_at (best-effort)
    try { await (admin as any).from('client_portals').update({ last_accessed_at: new Date().toISOString() }).eq('id', portal.id) } catch {}

    return NextResponse.json({
      portal: { id: portal.id, name: portal.name, slug: portal.slug, auth_required: !!portal.auth_required },
      client: client || null,
      candidats: candidatsOut,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
