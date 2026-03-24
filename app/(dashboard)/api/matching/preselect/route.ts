// app/(dashboard)/api/matching/preselect/route.ts
// Pré-sélection rapide côté serveur avant l'analyse IA Claude
// POST /api/matching/preselect { offre_id }
// Retourne les candidats pré-filtrés triés par score de pertinence textuelle

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 30

// Mots vides français à ignorer pour l'extraction de mots-clés
const STOP_WORDS = new Set([
  'le','la','les','de','du','des','un','une','et','en','au','aux',
  'avec','pour','par','sur','dans','qui','que','ou','à','d','l',
  'je','tu','il','elle','nous','vous','ils','elles','ce','cet','cette',
  'mon','ton','son','ma','ta','sa','nos','vos','leurs','est','sont',
  'avoir','être','faire','plus','très','bien','aussi','mais',
  'chef','poste','responsable','chargé','agent','technicien',
])

// Max candidats envoyés à Claude pour analyse IA
const MAX_AI_CANDIDATES = 60
// Score minimum pour être retenu (au moins 1 match)
const MIN_SCORE = 1

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['']/g, '')
}

function extractKeywords(text: string): string[] {
  return text
    .split(/[\s,;\/\-–()\[\]]+/)
    .map(w => normalize(w.trim()))
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w))
}

function scoreCandidat(
  candidat: any,
  offreKeywords: string[],
  offreCompetences: string[],
  expRequise: number,
): number {
  let score = 0

  const normComp    = (candidat.competences || []).map((s: string) => normalize(s))
  const normTags    = (candidat.tags || []).map((s: string) => normalize(s))
  const normTitre   = normalize(candidat.titre_poste || '')
  const normResume  = normalize(candidat.resume_ia || '')
  const normFormation = normalize(candidat.formation || '')
  // CV brut tronqué pour la recherche (évite de traiter des MBs de texte)
  const normCvBrut  = normalize((candidat.cv_texte_brut || '').slice(0, 3000))

  // ── Correspondance compétences (pondération max) ─────────────────────────
  for (const comp of offreCompetences) {
    const nc = normalize(comp)
    if (!nc || nc.length < 2) continue
    if (normComp.some((c: string) => c === nc || c.includes(nc) || nc.includes(c))) {
      score += 5
    } else if (normTags.some((t: string) => t.includes(nc))) {
      score += 3
    } else if (normTitre.includes(nc) || normFormation.includes(nc)) {
      score += 3
    } else if (normResume.includes(nc) || normCvBrut.includes(nc)) {
      score += 2  // Bonus : trouvé dans le vrai CV
    }
  }

  // ── Correspondance mots-clés du titre de l'offre ─────────────────────────
  for (const kw of offreKeywords) {
    if (normTitre.includes(kw)) {
      score += 3
    } else if (normComp.some((c: string) => c.includes(kw))) {
      score += 2
    } else if (normTags.some((t: string) => t.includes(kw))) {
      score += 2
    } else if (normResume.includes(kw)) {
      score += 1
    } else if (normCvBrut.includes(kw)) {
      score += 1  // Trouvé dans le CV brut
    }
  }

  // ── Correspondance expérience ─────────────────────────────────────────────
  if (expRequise > 0) {
    const exp = candidat.annees_exp || 0
    if (exp >= expRequise) {
      score += 4
    } else if (exp >= expRequise * 0.5) {
      score += 1
    } else if (exp < expRequise * 0.25) {
      score -= 3  // Pénalité allégée — Claude jugera mieux l'expérience réelle
    }
  }

  return score
}

export async function POST(request: NextRequest) {
  try {
    const { offre_id } = await request.json()
    if (!offre_id) {
      return NextResponse.json({ error: 'offre_id requis' }, { status: 400 })
    }

    const admin = createAdminClient()

    // 1. Charger l'offre
    const { data: offre, error: offreErr } = await admin
      .from('offres')
      .select('id, titre, competences, exp_requise, description, localisation')
      .eq('id', offre_id)
      .single()

    if (offreErr || !offre) {
      return NextResponse.json({ error: 'Offre introuvable' }, { status: 404 })
    }

    // 2. Extraire mots-clés de l'offre
    const offreCompetences: string[] = offre.competences || []
    const offreTitreKeywords = extractKeywords(offre.titre || '')
    const offreDescKeywords  = extractKeywords((offre.description || '').slice(0, 500))

    // Union : titre + description (dédupliqué, sans les compétences déjà traitées séparément)
    const offreKeywords = Array.from(new Set([...offreTitreKeywords, ...offreDescKeywords]))

    // 3. Charger TOUS les candidats (avec cv_texte_brut pour pré-sélection enrichie)
    const FIELDS = 'id, nom, prenom, titre_poste, competences, tags, annees_exp, localisation, resume_ia, photo_url, formation, cv_texte_brut, telephone, email'
    const PAGE_SIZE = 1000
    const allCandidats: any[] = []
    let offset = 0

    while (true) {
      const { data, error } = await admin
        .from('candidats')
        .select(FIELDS)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!data || data.length === 0) break
      allCandidats.push(...data)
      if (data.length < PAGE_SIZE) break
      offset += PAGE_SIZE
    }

    const totalBase = allCandidats.length

    // 4. Scorer et filtrer
    const scored = allCandidats
      .map(c => ({ candidat: c, preScore: scoreCandidat(c, offreKeywords, offreCompetences, offre.exp_requise || 0) }))
      .filter(x => x.preScore >= MIN_SCORE)
      .sort((a, b) => b.preScore - a.preScore)
      .slice(0, MAX_AI_CANDIDATES)

    const candidats = scored.map(x => x.candidat)

    return NextResponse.json({
      candidats,
      total_base: totalBase,
      total_preselect: candidats.length,
      keywords: offreKeywords,
      competences: offreCompetences,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
