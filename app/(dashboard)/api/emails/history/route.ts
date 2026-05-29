// /api/emails/history — Historique des envois (email + iMessage + WhatsApp + SMS), groupé par campagne_id.
// v1.9.68 : RLS SELECT global team → tous les users voient tous les envois, avec « envoyé par X ».
// (INSERT/UPDATE/DELETE restent per-user → on ne peut supprimer que ses propres envois.)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'

// v2.9.78 — Destinataire résolu : on tente d'associer chaque email/téléphone à un candidat
// (par email ou téléphone) ou à une entreprise cliente (par email), pour afficher un NOM
// plutôt qu'un numéro/email brut dans l'historique.
interface ResolvedRecipient {
  value: string                  // email ou téléphone brut envoyé
  kind: 'candidat' | 'client' | 'raw'
  candidat?: { id: string; prenom: string | null; nom: string | null; pipeline_metier: string | null; cv_url: string | null; cv_nom_fichier: string | null }
  entreprise?: string | null     // nom entreprise (si email = client)
  contact?: string | null        // nom de la personne de contact (si email = contact client)
}

interface CampagneResume {
  campagne_id: string
  created_at: string
  sujet: string
  destinataires: string[]
  nb_destinataires: number
  recipients: ResolvedRecipient[]
  candidat_ids: string[]
  nb_candidats: number
  candidats: { id: string; prenom: string | null; nom: string | null; cv_url: string | null; cv_nom_fichier: string | null; pipeline_metier: string | null }[]
  metier: string | null          // v2.9.78 — métier ciblé par la campagne (extrait du corps)
  client_nom: string | null
  cv_personnalise: boolean
  cv_urls_utilises: string[]
  corps_extract: string  // 220 chars max pour preview liste
  corps_full: string     // v2.1.15 — corps complet sans signature pour le panneau preview
  statut: string
  canal: 'email' | 'imessage' | 'whatsapp' | 'sms'
  user_id: string | null          // v1.9.68 — expéditeur (pour historique global team)
  user_name: string | null        // v1.9.68 — prénom ou nom affiché
  is_own: boolean                 // v1.9.68 — true si l'envoi appartient au user courant (pour UI bouton supprimer)
}

// v2.9.78 — Extrait le métier ciblé du corps d'un message de prospection.
// Modèle L-Agence : « …à la recherche d'un CHAUFFEUR PERMIS BE pour une mission sur … ».
function extractMetier(corps: string | null | undefined): string | null {
  const txt = (corps || '').replace(/\s+/g, ' ').trim()
  if (!txt) return null
  const patterns = [
    /recherche d['’]une?\s+(.+?)\s+pour\b/i,
    /recherchons? une?\s+(.+?)\s+pour\b/i,
    /cherch\w*\s+une?\s+(.+?)\s+pour\b/i,
  ]
  for (const re of patterns) {
    const m = txt.match(re)
    if (m && m[1]) {
      const v = m[1].trim().replace(/[.,;:]+$/, '')
      if (v.length >= 2 && v.length <= 60) return v
    }
  }
  return null
}

export async function GET(req: Request) {
  const authError = await requireAuth()
  if (authError) return authError

  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200)
  const search = (url.searchParams.get('search') || '').trim().toLowerCase()
  const canal = (url.searchParams.get('canal') || '').trim() // '' ou email/imessage/whatsapp/sms

  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  const currentUserId = userData?.user?.id ?? null

  // Fetch bruts (RLS SELECT = USING true depuis v1.9.68 → historique global team)
  let query = supabase
    .from('emails_envoyes')
    .select('id, user_id, user_name, campagne_id, candidat_id, candidat_ids, client_id, client_nom, sujet, corps, destinataire, statut, cv_personnalise, cv_urls_utilises, created_at, canal')
    .order('created_at', { ascending: false })
    .limit(limit * 15)
  if (canal && ['email','imessage','whatsapp','sms'].includes(canal)) {
    query = query.eq('canal', canal)
  }
  const { data: rows, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const allRows = (rows ?? []) as any[]

  // Agrégation : campagne_id si présent, sinon fallback = id de la ligne (1 ligne = 1 campagne virtuelle)
  const campagnesMap = new Map<string, any[]>()
  for (const r of allRows) {
    const key = r.campagne_id || `legacy-${r.id}`
    if (!campagnesMap.has(key)) campagnesMap.set(key, [])
    campagnesMap.get(key)!.push(r)
  }

  // Construction des résumés
  const campagnes: CampagneResume[] = []
  for (const [campagne_id, items] of campagnesMap) {
    const first = items[0]
    const destinataires = [...new Set(items.map((r: any) => r.destinataire).filter(Boolean))]
    const candidatIdsSet = new Set<string>()
    for (const r of items) {
      if (Array.isArray(r.candidat_ids)) r.candidat_ids.forEach((id: string) => candidatIdsSet.add(id))
      else if (r.candidat_id) candidatIdsSet.add(r.candidat_id)
    }
    const candidatIds = [...candidatIdsSet]
    campagnes.push({
      campagne_id,
      created_at: first.created_at,
      sujet: first.sujet ?? '(sans sujet)',
      destinataires,
      nb_destinataires: destinataires.length,
      candidat_ids: candidatIds,
      nb_candidats: candidatIds.length,
      recipients: [],
      candidats: [],
      client_nom: first.client_nom ?? null,
      cv_personnalise: !!first.cv_personnalise,
      cv_urls_utilises: first.cv_urls_utilises ?? [],
      corps_extract: (first.corps ?? '').slice(0, 220),
      // v2.1.15 — Corps complet, signature retirée si elle est concaténée à la fin.
      // La signature est ajoutée côté send avec `<br><br>` ou `\n\n` + bloc HTML/texte.
      // Heuristique : couper avant le dernier "<br><br>" ou "\n\n" suivi d'un mot signature courant.
      corps_full: (() => {
        const raw = first.corps ?? ''
        if (!raw) return ''
        // Repère un séparateur signature classique : 2+ sauts de ligne + (Cordialement / Bien à vous / Sincères / Salutations / Bonne journée / Best regards / -- )
        const sigRegex = /\n\s*\n\s*(Cordialement|Bien à vous|Sincères|Salutations|Bonne journée|Best regards|--\s)/i
        const m = raw.match(sigRegex)
        if (m && typeof m.index === 'number') return raw.slice(0, m.index).trimEnd()
        // Fallback : si HTML signature avec <table> ou block-level signature à la fin
        const htmlSigRegex = /\n*<(table|div\s+[^>]*signature|p[^>]*>(?:Cordialement|Bien à vous))/i
        const mh = raw.match(htmlSigRegex)
        if (mh && typeof mh.index === 'number') return raw.slice(0, mh.index).trimEnd()
        return raw
      })(),
      metier: extractMetier(first.corps),
      statut: first.statut ?? 'envoye',
      canal: (first.canal ?? 'email') as CampagneResume['canal'],
      user_id: first.user_id ?? null,
      user_name: first.user_name ?? null,
      is_own: !!currentUserId && first.user_id === currentUserId,
    })
  }

  // Hydrater les noms candidats en 1 seul fetch
  const allCandidatIds = [...new Set(campagnes.flatMap(c => c.candidat_ids))].filter(Boolean)
  if (allCandidatIds.length > 0) {
    const { data: cands } = await supabase
      .from('candidats')
      .select('id, prenom, nom, cv_url, cv_nom_fichier, pipeline_metier')
      .in('id', allCandidatIds)
    const byId = new Map((cands ?? []).map((c: any) => [c.id, c]))
    for (const c of campagnes) {
      c.candidats = c.candidat_ids.map(id => byId.get(id)).filter(Boolean) as any[]
    }
  }

  // Tri + filtre search (sujet / destinataires / candidat nom)
  campagnes.sort((a, b) => b.created_at.localeCompare(a.created_at))
  const filtered = search
    ? campagnes.filter(c => {
        const haystack = [
          c.sujet,
          c.destinataires.join(' '),
          c.client_nom ?? '',
          c.candidats.map(k => `${k.prenom ?? ''} ${k.nom ?? ''}`).join(' '),
        ].join(' ').toLowerCase()
        return haystack.includes(search)
      })
    : campagnes

  const result = filtered.slice(0, limit)

  // ──────────────────────────────────────────────────────────────────────
  // v2.9.78 — Résolution des destinataires en NOMS (candidat ou entreprise).
  // Objectif : afficher « Sava Durasovic — Chauffeur PL » au lieu de « +4179... »,
  // et « Entreprise (Contact) » au lieu d'un email brut. Cliquable vers la fiche candidat.
  // ──────────────────────────────────────────────────────────────────────
  const phoneKey = (s: string): string => {
    const d = (s || '').replace(/\D/g, '')
    return d.length >= 9 ? d.slice(-9) : d
  }
  const norm = (e: string) => e.toLowerCase().trim()

  const allDest = [...new Set(result.flatMap(c => c.destinataires))].filter(Boolean)
  const emailDest = [...new Set(allDest.filter(d => d.includes('@')).map(norm))]
  const phoneDestKeys = new Set(allDest.filter(d => !d.includes('@')).map(phoneKey).filter(Boolean))

  const candByEmail = new Map<string, ResolvedRecipient['candidat']>()
  const candByPhone = new Map<string, ResolvedRecipient['candidat']>()
  const clientByEmail = new Map<string, { entreprise: string | null; contact: string | null }>()

  const pickCand = (c: any) => ({
    id: c.id, prenom: c.prenom ?? null, nom: c.nom ?? null,
    pipeline_metier: c.pipeline_metier ?? null, cv_url: c.cv_url ?? null, cv_nom_fichier: c.cv_nom_fichier ?? null,
  })

  // 1) Candidats par EMAIL (requête exacte, indexée)
  if (emailDest.length > 0) {
    const { data } = await supabase
      .from('candidats')
      .select('id, prenom, nom, email, pipeline_metier, cv_url, cv_nom_fichier')
      .in('email', emailDest)
    for (const c of (data ?? []) as any[]) if (c.email) candByEmail.set(norm(c.email), pickCand(c))
  }

  // 2) Candidats par TÉLÉPHONE (9 derniers chiffres) — pagination bornée car formats variés
  if (phoneDestKeys.size > 0) {
    let from = 0
    const page = 1000
    for (let i = 0; i < 8; i++) {
      const { data } = await supabase
        .from('candidats')
        .select('id, prenom, nom, telephone, pipeline_metier, cv_url, cv_nom_fichier')
        .not('telephone', 'is', null)
        .range(from, from + page - 1)
      const rows = (data ?? []) as any[]
      for (const c of rows) {
        const k = phoneKey(c.telephone)
        if (k && phoneDestKeys.has(k) && !candByPhone.has(k)) candByPhone.set(k, pickCand(c))
      }
      if (rows.length < page) break
      from += page
    }
  }

  // 3) Entreprises clientes par EMAIL (email principal OU email d'un contact)
  if (emailDest.length > 0) {
    const { data } = await supabase
      .from('clients' as any)
      .select('id, nom, email, contacts')
      .in('email', emailDest)
    for (const cl of (data ?? []) as any[]) {
      if (cl.email) clientByEmail.set(norm(cl.email), { entreprise: cl.nom ?? null, contact: null })
    }
    // Contacts (jsonb) : on récupère TOUS les clients ayant des contacts pour matcher l'email contact.
    // Borné : on ne le fait que s'il reste des emails non résolus (ni candidat ni email principal client).
    const stillUnresolved = emailDest.filter(e => !candByEmail.has(e) && !clientByEmail.has(e))
    if (stillUnresolved.length > 0) {
      const unresolvedSet = new Set(stillUnresolved)
      let from = 0
      const page = 1000
      for (let i = 0; i < 4; i++) {
        const { data: cls } = await supabase
          .from('clients' as any)
          .select('id, nom, contacts')
          .not('contacts', 'is', null)
          .range(from, from + page - 1)
        const rows = (cls ?? []) as any[]
        for (const cl of rows) {
          // contacts peut être un array OU une string JSON (cf. parser fiche client)
          let contacts: any[] = []
          if (Array.isArray(cl.contacts)) contacts = cl.contacts
          else if (typeof cl.contacts === 'string') { try { const p = JSON.parse(cl.contacts); if (Array.isArray(p)) contacts = p } catch { /* ignore */ } }
          for (const ct of contacts) {
            const ce = ct?.email ? norm(ct.email) : ''
            if (ce && unresolvedSet.has(ce) && !clientByEmail.has(ce)) {
              const contactName = [ct.prenom, ct.nom].filter(Boolean).join(' ').trim() || null
              clientByEmail.set(ce, { entreprise: cl.nom ?? null, contact: contactName })
            }
          }
        }
        if (rows.length < page) break
        from += page
      }
    }
  }

  // 4) Construit recipients[] par campagne
  for (const c of result) {
    c.recipients = c.destinataires.map((d): ResolvedRecipient => {
      if (d.includes('@')) {
        const e = norm(d)
        const cand = candByEmail.get(e)
        if (cand) return { value: d, kind: 'candidat', candidat: cand }
        const cl = clientByEmail.get(e)
        if (cl) return { value: d, kind: 'client', entreprise: cl.entreprise, contact: cl.contact }
        return { value: d, kind: 'raw' }
      }
      const cand = candByPhone.get(phoneKey(d))
      if (cand) return { value: d, kind: 'candidat', candidat: cand }
      return { value: d, kind: 'raw' }
    })
  }

  return NextResponse.json({ campagnes: result })
}

/**
 * DELETE /api/emails/history
 *   - Sans body      → purge TOUT l'historique du user courant (RLS per-user).
 *   - Body { campagne_id } → supprime tous les envois d'une campagne (par user).
 *   - Body { legacy_id }   → supprime une ligne legacy sans campagne_id.
 * Retourne { deleted: N }.
 */
export async function DELETE(req: Request) {
  const authError = await requireAuth()
  if (authError) return authError

  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData?.user?.id
  if (!userId) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  let body: any = null
  try { body = await req.json() } catch { /* no body = delete all */ }

  const campagneId = typeof body?.campagne_id === 'string' ? body.campagne_id.trim() : null
  const legacyId = typeof body?.legacy_id === 'string' ? body.legacy_id.trim() : null

  // v1.9.65 patch 3 — Utilise service role pour bypass la RLS DELETE policy qui exige
  // user_id = auth.uid() STRICT (ne matche pas les legacy NULL).
  // v1.9.79 — Option A : DELETE global team (chacun peut supprimer n'importe quel envoi, y compris ceux de ses collègues).
  //            Cohérent avec SELECT global team (v1.9.70). Garde requireAuth pour que seuls les users loggés puissent purger.
  const admin = createAdminClient()
  void userId // loggé + obtenu pour traçabilité, mais pas utilisé comme filtre

  // Purge all — toute la table (authenticated)
  if (!campagneId && !legacyId) {
    const { error, count } = await admin
      .from('emails_envoyes')
      .delete({ count: 'exact' })
      .not('id', 'is', null) // trick : supprime tout (Supabase refuse .delete() sans filtre)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ deleted: count ?? 0 })
  }

  // Delete 1 campagne — même si elle appartient à un autre user
  if (campagneId) {
    const { error, count } = await admin
      .from('emails_envoyes')
      .delete({ count: 'exact' })
      .eq('campagne_id', campagneId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ deleted: count ?? 0 })
  }

  // Delete 1 legacy row (id de la row)
  if (legacyId) {
    const id = legacyId.replace(/^legacy-/, '')
    const { error, count } = await admin
      .from('emails_envoyes')
      .delete({ count: 'exact' })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ deleted: count ?? 0 })
  }

  return NextResponse.json({ deleted: 0 })
}
