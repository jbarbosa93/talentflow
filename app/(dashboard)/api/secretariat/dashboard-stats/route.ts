// GET /api/secretariat/dashboard-stats
// Statistiques pour le dashboard secrétaire

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const annee = new Date().getFullYear()
    const now = Date.now()

    // 1. Fetch tous les candidats de l'année en cours
    const { data: candidats, error: e1 } = await (supabase as any)
      .from('secretariat_candidats')
      .select('id, nom, prenom, date_echeance_permis, docs_manquants, candidat_id, updated_at, candidats!candidat_id(photo_url, tel, email)')
      .eq('annee', annee)

    if (e1) throw e1
    const candidatsList = (candidats || []).map((c: any) => ({
      ...c,
      photo_url: c.candidats?.photo_url ?? null,
      tel: c.candidats?.tel ?? null,
      email: c.candidats?.email ?? null,
      candidats: undefined,
    }))

    // 2. Fetch accidents en cours (termine = false) toutes années
    const { data: accidents, error: e2 } = await (supabase as any)
      .from('secretariat_accidents')
      .select('id, nom_prenom, date_debut, type_cas, candidat_id, updated_at, candidats!candidat_id(photo_url, tel, email)')
      .eq('termine', false)

    if (e2) throw e2
    const accidentsList = (accidents || []).map((a: any) => ({
      ...a,
      photo_url: a.candidats?.photo_url ?? null,
      tel: a.candidats?.tel ?? null,
      email: a.candidats?.email ?? null,
      candidats: undefined,
    }))

    // 3. KPIs
    const candidats_actifs = candidatsList.length

    const permis_urgents = candidatsList.filter((c: any) => {
      if (!c.date_echeance_permis) return false
      const j = Math.floor((new Date(c.date_echeance_permis).getTime() - now) / 86400000)
      return j >= 0 && j < 30
    }).length

    const permis_surveillance = candidatsList.filter((c: any) => {
      if (!c.date_echeance_permis) return false
      const j = Math.floor((new Date(c.date_echeance_permis).getTime() - now) / 86400000)
      return j >= 30 && j < 90
    }).length

    const accidents_en_cours = accidentsList.length

    // 4. À traiter — liste priorisée (max 15 items)
    type Urgence = 'rouge' | 'orange' | 'jaune'
    interface ATraiter {
      id: string
      candidat_id: string | null
      nom: string
      prenom: string
      photo_url: string | null
      tel: string | null
      email: string | null
      raison: string
      urgence: Urgence
      type: 'permis' | 'accident' | 'docs'
    }
    const aTraiter: ATraiter[] = []

    // Permis urgents (<30j)
    for (const c of candidatsList) {
      if (!c.date_echeance_permis) continue
      const j = Math.floor((new Date(c.date_echeance_permis).getTime() - now) / 86400000)
      if (j >= 0 && j < 30) {
        aTraiter.push({
          id: c.id, candidat_id: c.candidat_id,
          nom: c.nom, prenom: c.prenom,
          photo_url: c.photo_url, tel: c.tel, email: c.email,
          raison: `Permis expire dans ${j} jour${j !== 1 ? 's' : ''}`,
          urgence: j < 7 ? 'rouge' : 'orange',
          type: 'permis',
        })
      }
    }

    // Docs manquants
    for (const c of candidatsList) {
      if (!c.docs_manquants) continue
      aTraiter.push({
        id: c.id, candidat_id: c.candidat_id,
        nom: c.nom, prenom: c.prenom,
        photo_url: c.photo_url, tel: c.tel, email: c.email,
        raison: `Docs manquants : ${String(c.docs_manquants).slice(0, 60)}`,
        urgence: 'jaune',
        type: 'docs',
      })
    }

    // Accidents sans suivi depuis >30j
    for (const a of accidentsList) {
      if (!a.date_debut) continue
      const j = Math.floor((now - new Date(a.date_debut).getTime()) / 86400000)
      if (j > 30) {
        const parts = String(a.nom_prenom || '').trim().split(' ')
        const prenom = parts.slice(1).join(' ')
        const nom = parts[0] || ''
        aTraiter.push({
          id: a.id, candidat_id: a.candidat_id,
          nom, prenom,
          photo_url: a.photo_url, tel: a.tel, email: a.email,
          raison: `${a.type_cas} en cours depuis ${j} jours`,
          urgence: 'orange',
          type: 'accident',
        })
      }
    }

    // Sort rouge → orange → jaune
    const urgOrder: Record<Urgence, number> = { rouge: 0, orange: 1, jaune: 2 }
    aTraiter.sort((a, b) => urgOrder[a.urgence] - urgOrder[b.urgence])

    // 5. Activité récente — 5 derniers updated_at (candidats + accidents combinés)
    const allRecents = [
      ...candidatsList.map((c: any) => ({
        nom: `${c.prenom} ${c.nom}`.trim(),
        action: 'Dossier candidat mis à jour',
        date: c.updated_at,
      })),
      ...accidentsList.map((a: any) => ({
        nom: String(a.nom_prenom || '').trim(),
        action: `${a.type_cas} en cours`,
        date: a.updated_at,
      })),
    ]
    allRecents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const activite_recente = allRecents.slice(0, 5)

    return NextResponse.json({
      candidats_actifs,
      permis_urgents,
      permis_surveillance,
      accidents_en_cours,
      a_traiter: aTraiter.slice(0, 12),
      activite_recente,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
