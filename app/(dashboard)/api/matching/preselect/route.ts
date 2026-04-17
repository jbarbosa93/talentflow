// app/(dashboard)/api/matching/preselect/route.ts
// Pré-sélection rapide côté serveur avant l'analyse IA Claude
// POST /api/matching/preselect { offre_id }
// Retourne les candidats pré-filtrés triés par score de pertinence textuelle

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'
export const maxDuration = 30

// Mots vides français à ignorer pour l'extraction de mots-clés
// Note : "chef", "poste", "responsable" retirés volontairement — pertinents dans les titres
const STOP_WORDS = new Set([
  'le','la','les','de','du','des','un','une','et','en','au','aux',
  'avec','pour','par','sur','dans','qui','que','ou','à','d','l',
  'je','tu','il','elle','nous','vous','ils','elles','ce','cet','cette',
  'mon','ton','son','ma','ta','sa','nos','vos','leurs','est','sont',
  'avoir','être','faire','plus','très','bien','aussi','mais',
  'chargé','agent','technicien',
])

// Max candidats envoyés à Claude pour analyse IA
const MAX_AI_CANDIDATES = 60
// Score minimum pour être retenu (au moins 1 match)
const MIN_SCORE = 1

// Cantons suisses — codes (2 lettres) + noms + principales villes → canton
const CANTON_MAP: Record<string, string> = {
  // Codes courts
  vs: 'vs', vd: 'vd', ge: 'ge', fr: 'fr', ne: 'ne', ju: 'ju', be: 'be',
  ti: 'ti', zh: 'zh', lu: 'lu', bs: 'bs', bl: 'bl', ar: 'ar', ai: 'ai',
  sg: 'sg', gr: 'gr', ag: 'ag', tg: 'tg', so: 'so', sh: 'sh', gl: 'gl',
  zg: 'zg', ow: 'ow', nw: 'nw', sz: 'sz', ur: 'ur',
  // Noms cantons
  valais: 'vs', vaud: 'vd', geneve: 'ge', fribourg: 'fr', neuchatel: 'ne',
  jura: 'ju', berne: 'be', bern: 'be', tessin: 'ti', zurich: 'zh',
  // Villes principales romandes → canton
  sion: 'vs', martigny: 'vs', monthey: 'vs', sierre: 'vs', brigue: 'vs',
  visp: 'vs', viege: 'vs',
  lausanne: 'vd', yverdon: 'vd', vevey: 'vd', montreux: 'vd', morges: 'vd',
  nyon: 'vd', gland: 'vd', aigle: 'vd', renens: 'vd', payerne: 'vd',
  carouge: 'ge', meyrin: 'ge', versoix: 'ge',
  bulle: 'fr', romont: 'fr',
  delemont: 'ju', porrentruy: 'ju',
  biel: 'be', bienne: 'be', moutier: 'be',
}

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

function extractCantonCode(loc: string): string | null {
  if (!loc) return null
  const tokens = normalize(loc).split(/[\s,\/\-]+/).filter(Boolean)
  for (const t of tokens) {
    if (CANTON_MAP[t]) return CANTON_MAP[t]
  }
  return null
}

function anciennetePenalite(createdAt: string | null | undefined): number {
  if (!createdAt) return 0
  const ts = new Date(createdAt).getTime()
  if (!Number.isFinite(ts)) return 0
  const mois = (Date.now() - ts) / (1000 * 60 * 60 * 24 * 30)
  if (mois < 6) return 0
  if (mois < 12) return -3
  if (mois < 24) return -6
  return -10
}

function localisationBonus(candLoc: string, offreLoc: string): number {
  if (!candLoc || !offreLoc) return 0
  const c = normalize(candLoc)
  const o = normalize(offreLoc)
  if (!c || !o) return 0
  // Même ville (match exact ou inclusion bidirectionnelle)
  if (c === o || c.includes(o) || o.includes(c)) return 6
  // Même canton
  const cc = extractCantonCode(candLoc)
  const oc = extractCantonCode(offreLoc)
  if (cc && oc && cc === oc) return 4
  return 0
}

function scoreCandidat(
  candidat: any,
  offreKeywords: string[],
  offreCompetences: string[],
  expRequise: number,
  offreLocalisation: string,
): number {
  let score = 0

  const normComp    = (candidat.competences || []).map((s: string) => normalize(s))
  const normTags    = (candidat.tags || []).map((s: string) => normalize(s))
  const normTitre   = normalize(candidat.titre_poste || '')
  const normResume  = normalize(candidat.resume_ia || '')
  const normFormation = normalize(candidat.formation || '')
  // CV brut tronqué pour la recherche (évite de traiter des MBs de texte)
  const normCvBrut  = normalize((candidat.cv_texte_brut || '').slice(0, 3000))

  // ── Correspondance compétences (normalisé par N pour ne pas écraser les offres courtes) ──
  let compScore = 0
  for (const comp of offreCompetences) {
    const nc = normalize(comp)
    if (!nc || nc.length < 2) continue
    if (normComp.some((c: string) => c === nc || c.includes(nc) || nc.includes(c))) {
      compScore += 5
    } else if (normTags.some((t: string) => t.includes(nc))) {
      compScore += 3
    } else if (normTitre.includes(nc) || normFormation.includes(nc)) {
      compScore += 3
    } else if (normResume.includes(nc) || normCvBrut.includes(nc)) {
      compScore += 2  // Bonus : trouvé dans le vrai CV
    }
  }
  // Normalisation : borne le bloc compétences à 0-5 en moyenne, quelle que soit N
  score += compScore / Math.max(1, offreCompetences.length)

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

  // ── Bonus localisation (même ville +6, même canton +4) ───────────────────
  score += localisationBonus(candidat.localisation || '', offreLocalisation)

  // ── Bonus CV texte brut disponible (profil plus complet pour Claude) ─────
  if ((candidat.cv_texte_brut || '').trim().length > 0) {
    score += 2
  }

  // ── Pénalité ancienneté du candidat (fraîcheur du profil) ────────────────
  score += anciennetePenalite(candidat.created_at)

  return score
}

export async function POST(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError
  try {
    const body = await request.json()
    const { offre_id, offre_externe_id } = body

    if (!offre_id && !offre_externe_id) {
      return NextResponse.json({ error: 'offre_id ou offre_externe_id requis' }, { status: 400 })
    }

    const admin = createAdminClient()

    // 1. Charger l'offre (interne ou externe)
    let offre: any = null

    if (offre_externe_id) {
      const { data, error } = await (admin as any)
        .from('offres_externes')
        .select('id, titre, competences, description, lieu, canton')
        .eq('id', offre_externe_id)
        .single()
      if (error || !data) {
        return NextResponse.json({ error: 'Offre externe introuvable' }, { status: 404 })
      }
      // Normaliser vers le même format que les offres internes
      offre = {
        titre: data.titre,
        competences: data.competences || [],
        exp_requise: 0, // pas de champ exp sur les offres externes
        description: data.description,
        localisation: data.lieu,
      }
    } else {
      const { data, error } = await admin
        .from('offres')
        .select('id, titre, competences, exp_requise, description, localisation')
        .eq('id', offre_id)
        .single()
      if (error || !data) {
        return NextResponse.json({ error: 'Offre introuvable' }, { status: 404 })
      }
      offre = data
    }

    // 2. Extraire mots-clés de l'offre
    const offreCompetences: string[] = offre.competences || []
    const offreTitreKeywords = extractKeywords(offre.titre || '')
    const offreDescKeywords  = extractKeywords((offre.description || '').slice(0, 500))

    // Union : titre + description (dédupliqué, sans les compétences déjà traitées séparément)
    const offreKeywords = Array.from(new Set([...offreTitreKeywords, ...offreDescKeywords]))

    // 3. Charger TOUS les candidats (avec cv_texte_brut pour pré-sélection enrichie)
    const FIELDS = 'id, nom, prenom, titre_poste, competences, tags, annees_exp, localisation, resume_ia, photo_url, formation, cv_texte_brut, telephone, email, created_at'
    const PAGE_SIZE = 1000
    const allCandidats: any[] = []
    let offset = 0

    while (true) {
      const { data, error } = await admin
        .from('candidats')
        .select(FIELDS)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)

      if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
      if (!data || data.length === 0) break
      allCandidats.push(...data)
      if (data.length < PAGE_SIZE) break
      offset += PAGE_SIZE
    }

    const totalBase = allCandidats.length

    // 4. Scorer et filtrer
    const offreLocalisation = offre.localisation || ''
    const scored = allCandidats
      .map(c => ({ candidat: c, preScore: scoreCandidat(c, offreKeywords, offreCompetences, offre.exp_requise || 0, offreLocalisation) }))
      .filter(x => x.preScore >= MIN_SCORE)
      .sort((a, b) => b.preScore - a.preScore || a.candidat.id.localeCompare(b.candidat.id))
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
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
