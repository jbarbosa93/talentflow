// app/(dashboard)/api/onedrive/pending-validation/route.ts
// v1.9.31 — Gestion des CVs en attente de validation (matches incertains score 8-10)
//
// GET  → liste tous les fichiers en statut pending_validation + candidat suspect
// POST → body { id: string, action: 'confirm' | 'reject' | 'ignore', note?: string }
//   confirm : update candidat suspect avec les données du CV (écrase bio via même logique que cron auto)
//   reject  : crée nouveau candidat depuis analyse_json
//   ignore  : marque le fichier statut_action='ignored', rien d'autre
//
// Dans les 3 cas : log dans decisions_matching (dataset ML).

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'
import { normaliserGenre } from '@/lib/normaliser-genre'

export const runtime = 'nodejs'

// ───────────────────────────────────────────────────────────────────────────────
// GET — liste des pending_validation avec candidat suspect

export async function GET() {
  const authError = await requireAuth()
  if (authError) return authError

  const supabase = createAdminClient()

  const { data: fichiers, error } = await (supabase as any)
    .from('onedrive_fichiers')
    .select('id, nom_fichier, traite_le, last_modified_at, match_suspect_candidat_id, match_suspect_score, cv_url_temp, analyse_json, erreur')
    .eq('statut_action', 'pending_validation')
    .order('traite_le', { ascending: false })
    .limit(200)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Enrichir avec les données du candidat suspect
  const suspectIds = Array.from(new Set((fichiers || []).map((f: any) => f.match_suspect_candidat_id).filter(Boolean)))
  const suspectsMap = new Map<string, any>()
  if (suspectIds.length > 0) {
    const { data: suspects } = await supabase
      .from('candidats')
      .select('id, nom, prenom, email, telephone, date_naissance, localisation, titre_poste, cv_url, cv_nom_fichier')
      .in('id', suspectIds as string[])
    for (const c of suspects || []) suspectsMap.set((c as any).id, c)
  }

  const enriched = (fichiers || []).map((f: any) => ({
    id: f.id,
    nom_fichier: f.nom_fichier,
    traite_le: f.traite_le,
    last_modified_at: f.last_modified_at,
    match_suspect_score: f.match_suspect_score,
    cv_url_temp: f.cv_url_temp,
    analyse_json: f.analyse_json,
    erreur: f.erreur,
    candidat_suspect: f.match_suspect_candidat_id ? suspectsMap.get(f.match_suspect_candidat_id) || null : null,
  }))

  return NextResponse.json({ fichiers: enriched, count: enriched.length })
}

// ───────────────────────────────────────────────────────────────────────────────
// POST — valider / rejeter / ignorer

export async function POST(req: Request) {
  const authError = await requireAuth()
  if (authError) return authError

  const body = await req.json().catch(() => ({} as any))
  const fichierId = String(body?.id || '')
  const action = String(body?.action || '') as 'confirm' | 'reject' | 'ignore'
  const note = typeof body?.note === 'string' ? body.note : null

  if (!fichierId) return NextResponse.json({ error: 'id manquant' }, { status: 400 })
  if (!['confirm', 'reject', 'ignore'].includes(action)) {
    return NextResponse.json({ error: 'action invalide (confirm|reject|ignore)' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Récupérer le fichier pending
  const { data: fichier, error: errFichier } = await (supabase as any)
    .from('onedrive_fichiers')
    .select('id, nom_fichier, statut_action, match_suspect_candidat_id, match_suspect_score, cv_url_temp, analyse_json, last_modified_at')
    .eq('id', fichierId)
    .single() as { data: any; error: any }

  if (errFichier || !fichier) {
    return NextResponse.json({ error: 'Fichier introuvable' }, { status: 404 })
  }
  if (fichier.statut_action !== 'pending_validation') {
    return NextResponse.json({ error: 'Fichier déjà traité' }, { status: 409 })
  }

  const analyse = fichier.analyse_json || {}
  const suspectId: string | null = fichier.match_suspect_candidat_id || null
  const score: number = fichier.match_suspect_score || 0

  // Récupérer user pour decided_by
  let decidedBy: string | null = null
  try {
    const userSupabase = createAdminClient()
    const { data: { user } } = await userSupabase.auth.getUser()
    decidedBy = user?.id || null
  } catch {}

  // ═══ Action : IGNORE ═══
  if (action === 'ignore') {
    await (supabase as any)
      .from('onedrive_fichiers')
      .update({
        statut_action: 'ignored',
        erreur: note ? `Ignoré — ${note}` : 'Ignoré par l\'utilisateur',
      })
      .eq('id', fichierId)

    await (supabase as any).from('decisions_matching').insert({
      fichier_id: fichierId,
      candidat_id: suspectId,
      decision: 'ignored',
      score,
      signals: analyse?._signals || null,
      decided_by: decidedBy,
      note,
    })

    return NextResponse.json({ success: true, action: 'ignored' })
  }

  // ═══ Action : CONFIRM (oui même candidat) ═══
  if (action === 'confirm') {
    if (!suspectId) return NextResponse.json({ error: 'Pas de candidat suspect associé' }, { status: 400 })

    // Récupérer le candidat actuel (pour archivage ancien CV)
    const { data: existing } = await supabase
      .from('candidats')
      .select('id, cv_url, cv_nom_fichier, documents, prenom, nom, photo_url')
      .eq('id', suspectId)
      .single() as { data: any }

    if (!existing) return NextResponse.json({ error: 'Candidat suspect supprimé' }, { status: 404 })

    // Archiver l'ancien CV dans documents[]
    const existingDocs = Array.isArray(existing.documents) ? existing.documents : []
    if (existing.cv_url && !existingDocs.some((d: any) => d.url === existing.cv_url)) {
      existingDocs.push({
        name: existing.cv_nom_fichier || 'Ancien CV',
        url: existing.cv_url,
        type: 'cv',
        uploaded_at: new Date().toISOString(),
      })
    }

    // Update candidat : mêmes champs que onedrive/sync ligne 1025 (écrasement complet)
    const fileDate = fichier.last_modified_at || new Date().toISOString()
    const updatePayload: Record<string, any> = {
      titre_poste: analyse.titre_poste || null,
      competences: analyse.competences || [],
      langues: analyse.langues || [],
      experiences: analyse.experiences || [],
      formations_details: analyse.formations_details || [],
      formation: analyse.formation || null,
      resume_ia: analyse.resume || null,
      permis_conduire: analyse.permis_conduire ?? null,
      date_naissance: analyse.date_naissance || null,
      genre: normaliserGenre(analyse.genre) ?? null,
      linkedin: analyse.linkedin || null,
      annees_exp: analyse.annees_exp || null,
      cv_url: fichier.cv_url_temp,
      cv_nom_fichier: fichier.nom_fichier,
      documents: existingDocs,
      created_at: fileDate,
      updated_at: new Date().toISOString(),
      last_import_at: new Date().toISOString(),
    }
    // Email/tel/localisation : si vides en DB, remplir (cohérent avec v1.9.28 cv/parse mode merge)
    const { data: existingCoords } = await supabase
      .from('candidats').select('email, telephone, localisation')
      .eq('id', suspectId).single() as { data: any }
    if (analyse.email && !existingCoords?.email) updatePayload.email = analyse.email
    if (analyse.telephone && !existingCoords?.telephone) updatePayload.telephone = analyse.telephone
    if (analyse.localisation && !existingCoords?.localisation) updatePayload.localisation = analyse.localisation

    await (supabase as any).from('candidats').update(updatePayload).eq('id', suspectId)

    // Purger candidats_vus pour faire réapparaître badges
    try { await (supabase as any).from('candidats_vus').delete().eq('candidat_id', suspectId) } catch {}

    // Mettre à jour le fichier : attaché au candidat confirmé
    await (supabase as any)
      .from('onedrive_fichiers')
      .update({
        statut_action: 'updated',
        candidat_id: suspectId,
        erreur: `✅ Validé — ${existing.prenom || ''} ${existing.nom || ''}`.trim(),
      })
      .eq('id', fichierId)

    // Log activité
    try {
      await (supabase as any).from('activites').insert({
        type: 'candidat_modifie',
        description: `CV validé (pending_validation confirmé) — ${existing.prenom || ''} ${existing.nom || ''}`.trim(),
        candidat_id: suspectId,
        metadata: { source: 'pending_validation', filename: fichier.nom_fichier, score, reason: 'user_confirmed' },
        created_at: new Date().toISOString(),
      })
    } catch {}

    // Log décision (dataset ML)
    await (supabase as any).from('decisions_matching').insert({
      fichier_id: fichierId,
      candidat_id: suspectId,
      decision: 'confirmed_match',
      score,
      signals: analyse?._signals || null,
      decided_by: decidedBy,
      note,
    })

    return NextResponse.json({ success: true, action: 'confirmed', candidat_id: suspectId })
  }

  // ═══ Action : REJECT (non, créer nouveau candidat) ═══
  if (action === 'reject') {
    // Créer nouveau candidat depuis analyse_json
    const insertPayload: Record<string, any> = {
      nom: analyse.nom || 'Candidat',
      prenom: analyse.prenom || '',
      email: analyse.email || null,
      telephone: analyse.telephone || null,
      localisation: analyse.localisation || null,
      titre_poste: analyse.titre_poste || null,
      competences: analyse.competences || [],
      langues: analyse.langues || [],
      experiences: analyse.experiences || [],
      formations_details: analyse.formations_details || [],
      formation: analyse.formation || null,
      resume_ia: analyse.resume || null,
      permis_conduire: analyse.permis_conduire ?? null,
      date_naissance: analyse.date_naissance || null,
      genre: normaliserGenre(analyse.genre) ?? null,
      linkedin: analyse.linkedin || null,
      annees_exp: analyse.annees_exp || null,
      cv_url: fichier.cv_url_temp,
      cv_nom_fichier: fichier.nom_fichier,
      import_status: 'a_traiter',
      created_at: fichier.last_modified_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_import_at: new Date().toISOString(),
    }

    const { data: nouveau, error: errCreate } = await (supabase as any)
      .from('candidats')
      .insert(insertPayload)
      .select('id, nom, prenom')
      .single()

    if (errCreate || !nouveau) {
      return NextResponse.json({ error: `Échec création candidat : ${errCreate?.message || 'inconnu'}` }, { status: 500 })
    }

    // Mettre à jour le fichier : attaché au NOUVEAU candidat
    await (supabase as any)
      .from('onedrive_fichiers')
      .update({
        statut_action: 'created',
        candidat_id: nouveau.id,
        match_suspect_candidat_id: null, // libérer la référence
        erreur: `✅ Nouveau candidat créé — ${nouveau.prenom || ''} ${nouveau.nom || ''}`.trim(),
      })
      .eq('id', fichierId)

    // Log activité
    try {
      await (supabase as any).from('activites').insert({
        type: 'candidat_importe',
        description: `Nouveau candidat créé (pending_validation rejeté) — ${nouveau.prenom || ''} ${nouveau.nom || ''}`.trim(),
        candidat_id: nouveau.id,
        metadata: { source: 'pending_validation', filename: fichier.nom_fichier, score, reason: 'user_rejected_suspect' },
        created_at: new Date().toISOString(),
      })
    } catch {}

    // Log décision (dataset ML) — rejected = suspect n'était PAS le bon
    await (supabase as any).from('decisions_matching').insert({
      fichier_id: fichierId,
      candidat_id: suspectId,
      decision: 'rejected_match',
      score,
      signals: analyse?._signals || null,
      decided_by: decidedBy,
      note,
    })

    return NextResponse.json({ success: true, action: 'rejected', candidat_id: nouveau.id })
  }

  return NextResponse.json({ error: 'action non gérée' }, { status: 500 })
}
