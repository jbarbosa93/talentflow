// GET /api/candidats/doublons/deterministic
// Appelle la RPC find_deterministic_duplicates (4 catégories : sha256, email, ddn_nom, metier_contact)
// + enrichit avec les données candidats complètes pour l'UI.
//
// v1.9.45

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET() {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const admin = createAdminClient()

    // 1. RPC des 4 catégories (inclut déjà filtre historique)
    const { data: pairs, error } = await (admin as any).rpc('find_deterministic_duplicates')

    if (error) {
      console.error('[Doublons/deterministic] RPC error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!pairs || pairs.length === 0) {
      return NextResponse.json({ pairs: [], by_category: {} })
    }

    // 2. Charger les données complètes des candidats impliqués
    const candidatIds = new Set<string>()
    for (const p of pairs as any[]) {
      candidatIds.add(p.id_a)
      candidatIds.add(p.id_b)
    }

    const { data: candidats } = await admin
      .from('candidats')
      .select('id, nom, prenom, email, telephone, titre_poste, localisation, annees_exp, competences, cv_url, cv_nom_fichier, cv_texte_brut, created_at, photo_url, source, experiences, formations_details, langues, resume_ia, permis_conduire, date_naissance, tags, notes, documents')
      .in('id', Array.from(candidatIds))

    const candidatMap = new Map<string, any>()
    for (const c of candidats || []) candidatMap.set(c.id, c)

    // 3. Construire les paires enrichies
    const enriched = (pairs as any[])
      .map((p: any) => {
        const a = candidatMap.get(p.id_a)
        const b = candidatMap.get(p.id_b)
        if (!a || !b) return null
        return {
          candidat_a: a,
          candidat_b: b,
          match_type: p.match_type,
          match_types: p.match_types || [p.match_type],
          score: p.score,
          reasons: p.reasons || [],
        }
      })
      .filter(Boolean)

    // 4. Grouper par catégorie (pour l'UI)
    const by_category: Record<string, any[]> = {
      sha256: [],
      email: [],
      ddn_nom: [],
      metier_contact: [],
    }
    for (const p of enriched as any[]) {
      if (by_category[p.match_type]) by_category[p.match_type].push(p)
    }

    return NextResponse.json({
      pairs: enriched,
      by_category,
      counts: {
        total: enriched.length,
        sha256: by_category.sha256.length,
        email: by_category.email.length,
        ddn_nom: by_category.ddn_nom.length,
        metier_contact: by_category.metier_contact.length,
      },
    })
  } catch (e: any) {
    console.error('[Doublons/deterministic] Error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
