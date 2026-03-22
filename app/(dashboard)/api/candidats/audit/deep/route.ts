// POST /api/candidats/audit/deep
// Analyse approfondie : télécharge les PDFs, extrait le texte,
// vérifie si c'est un vrai CV ou un autre document
// Traite par lots de 10 candidats à la fois

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 60

// Mots-clés typiques d'un CV / curriculum vitae
const CV_KEYWORDS = [
  'experience professionnelle', 'experiences professionnelles',
  'parcours professionnel', 'parcours professionnels',
  'competences', 'competences techniques', 'competences cles',
  'formation', 'formations',
  'langues', 'langue',
  'profil', 'profil professionnel', 'profil personnel',
  'objectif professionnel',
  'curriculum vitae', 'curriculum',
  'centres d\'interet', 'hobbies', 'loisirs',
  'references', 'referees',
  'informatique', 'softwares', 'logiciels',
  'contact', 'adresse', 'etat civil',
  'ne le', 'nee le', 'date de naissance',
  'permis de conduire', 'permis b',
]

// Mots-clés typiques de documents NON-CV
const NON_CV_KEYWORDS = [
  // Certificats de travail
  'certifions que', 'certifie que', 'nous certifions',
  'attestons que', 'atteste que', 'nous attestons',
  'certificat de travail',
  'a ete employe', 'a ete employee',
  'quitte notre entreprise', 'quitte notre societe',
  'libre de tout engagement',
  'a qui de droit',
  'par la presente', 'la presente atteste',
  // Attestations
  'attestation de travail', 'attestation de formation',
  'attestation de participation', 'attestation de stage',
  // Diplômes
  'diplome obtenu', 'titre obtenu',
  'delivre a', 'delivree a', 'remis a', 'remise a',
  'certificat federal', 'certificat de capacite',
  'brevet federal',
  // Formations / certificats de formation
  'certificat de formation',
  'a suivi avec succes', 'a participe a',
  'formation continue',
  'attestation de reussite',
  // Lettres de recommandation
  'lettre de recommandation', 'lettre de reference',
  'je recommande', 'nous recommandons',
  'je soussigne', 'nous soussignes',
  'c\'est avec plaisir que je recommande',
  'a fait preuve', 'excellente collaboratrice', 'excellent collaborateur',
]

function normalise(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

// Phrases très spécifiques qui prouvent que c'est PAS un CV (un seul suffit)
const STRONG_NON_CV = [
  'certifions que', 'certifie que', 'nous certifions',
  'attestons que', 'atteste que', 'nous attestons',
  'a qui de droit',
  'par la presente',
  'certificat de travail',
  'attestation de travail',
  'libre de tout engagement',
  'quitte notre entreprise', 'quitte notre societe',
  'lettre de recommandation', 'lettre de reference',
  'je soussigne', 'nous soussignes',
  'delivre a', 'delivree a',
  'a suivi avec succes',
  'attestation de participation',
  'attestation de formation',
  'certificat de formation',
  'attestation de reussite',
  'brevet federal',
]

function classifyDocument(text: string): { isCV: boolean; confidence: number; reason: string } {
  const normText = normalise(text)

  // Si aucun texte extrait → on ne peut pas classifier
  if (normText.length < 50) {
    return { isCV: true, confidence: 0, reason: 'Texte trop court pour classifier' }
  }

  // 1. Chercher les phrases FORTES non-CV — un seul match suffit
  const strongMatches: string[] = []
  for (const phrase of STRONG_NON_CV) {
    if (normText.includes(normalise(phrase))) {
      strongMatches.push(phrase)
    }
  }

  if (strongMatches.length > 0) {
    return {
      isCV: false,
      confidence: Math.min(95, 60 + strongMatches.length * 10),
      reason: `${strongMatches.slice(0, 2).join(', ')}`
    }
  }

  // 2. Compter les mots-clés CV
  let cvScore = 0
  for (const kw of CV_KEYWORDS) {
    if (normText.includes(normalise(kw))) cvScore++
  }

  // 3. Compter les mots-clés non-CV généraux
  let nonCvScore = 0
  const nonCvMatches: string[] = []
  for (const kw of NON_CV_KEYWORDS) {
    if (normText.includes(normalise(kw))) {
      nonCvScore++
      nonCvMatches.push(kw)
    }
  }

  // Si beaucoup de mots non-CV et peu de mots CV → probablement pas un CV
  if (nonCvScore >= 2 && cvScore <= 2) {
    return {
      isCV: false,
      confidence: Math.min(80, 40 + nonCvScore * 10),
      reason: `${nonCvMatches.slice(0, 2).join(', ')}`
    }
  }

  // CV confirmé ou incertain → considérer comme CV
  if (cvScore >= 3) {
    return { isCV: true, confidence: Math.min(90, 40 + cvScore * 8), reason: `CV (${cvScore} mots-clés)` }
  }

  return { isCV: true, confidence: 30, reason: 'Classification incertaine' }
}

// Vérifie si une image est probablement un visage (ratio, taille)
async function checkPhotoIsPortrait(url: string): Promise<{ suspect: boolean; reason: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return { suspect: false, reason: '' }

    const buffer = Buffer.from(await res.arrayBuffer())

    // Vérifier la taille du fichier
    if (buffer.length < 1000) return { suspect: true, reason: 'Fichier trop petit (< 1 Ko) — probablement un logo' }
    if (buffer.length > 2_000_000) return { suspect: true, reason: 'Fichier trop gros (> 2 Mo) — probablement un scan de document' }

    // Essayer de lire les dimensions JPEG/PNG
    const dims = getImageDimensions(buffer)
    if (!dims) return { suspect: false, reason: '' }

    const { width, height } = dims
    const ratio = height / width

    // Un visage : ratio portrait (1.1 - 1.7), taille 80-800px
    if (width > 1200 || height > 1600) return { suspect: true, reason: `Image trop grande (${width}x${height}) — probablement un document scanné` }
    if (width < 30 || height < 30) return { suspect: true, reason: `Image trop petite (${width}x${height}) — probablement un icône` }
    if (ratio < 0.7) return { suspect: true, reason: `Format paysage (${width}x${height}) — probablement pas un portrait` }
    if (ratio > 2.5) return { suspect: true, reason: `Format très allongé (${width}x${height}) — probablement pas un portrait` }

    return { suspect: false, reason: '' }
  } catch {
    return { suspect: false, reason: '' }
  }
}

// Lecture rapide des dimensions d'une image (JPEG/PNG header)
function getImageDimensions(buffer: Buffer): { width: number; height: number } | null {
  // JPEG
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
    let offset = 2
    while (offset < buffer.length - 8) {
      if (buffer[offset] !== 0xFF) break
      const marker = buffer[offset + 1]
      if (marker === 0xC0 || marker === 0xC2) {
        const height = buffer.readUInt16BE(offset + 5)
        const width = buffer.readUInt16BE(offset + 7)
        return { width, height }
      }
      const len = buffer.readUInt16BE(offset + 2)
      offset += 2 + len
    }
  }
  // PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    if (buffer.length > 24) {
      const width = buffer.readUInt32BE(16)
      const height = buffer.readUInt32BE(20)
      return { width, height }
    }
  }
  return null
}

export async function POST(request: NextRequest) {
  try {
    const { offset = 0, limit = 10, mode = 'cv' } = await request.json()
    const supabase = createAdminClient()

    // Mode photo : vérifier les photos
    if (mode === 'photo') {
      const { data: candidats, error, count } = await supabase
        .from('candidats')
        .select('id, nom, prenom, photo_url', { count: 'exact' })
        .not('photo_url', 'is', null)
        .not('photo_url', 'eq', '')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      const photoProblems: Array<{ id: string; nom: string; prenom: string | null; photo_url: string; reason: string }> = []

      for (const c of (candidats || [])) {
        if (!c.photo_url) continue
        const check = await checkPhotoIsPortrait(c.photo_url)
        if (check.suspect) {
          photoProblems.push({ id: c.id, nom: c.nom, prenom: c.prenom, photo_url: c.photo_url!, reason: check.reason })
        }
      }

      return NextResponse.json({ scanned: (candidats || []).length, total: count || 0, offset, problems: photoProblems })
    }

    // Mode CV (par défaut)
    // Récupérer les candidats avec cv_url
    const { data: candidats, error, count } = await supabase
      .from('candidats')
      .select('id, nom, prenom, cv_url, cv_nom_fichier', { count: 'exact' })
      .not('cv_url', 'is', null)
      .not('cv_url', 'eq', '')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const results: Array<{
      id: string
      nom: string
      prenom: string | null
      cv_nom_fichier: string | null
      isCV: boolean
      confidence: number
      reason: string
    }> = []

    for (const c of (candidats || [])) {
      try {
        // Télécharger le PDF
        const res = await fetch(c.cv_url!, { signal: AbortSignal.timeout(10000) })
        if (!res.ok) {
          results.push({ id: c.id, nom: c.nom, prenom: c.prenom, cv_nom_fichier: c.cv_nom_fichier, isCV: true, confidence: 0, reason: 'Impossible de télécharger le fichier' })
          continue
        }

        const buffer = Buffer.from(await res.arrayBuffer())
        const ext = (c.cv_nom_fichier || '').toLowerCase().split('.').pop() || ''
        let text = ''

        // 1. PDFs — extraire texte, OCR si scanné
        if (ext === 'pdf') {
          try {
            const { extractTextFromPDF } = await import('@/lib/cv-parser')
            text = await extractTextFromPDF(buffer)

            // Si pas de texte → PDF scanné → on ne peut pas classifier sans IA
          } catch {
            // PDF extraction failed
          }
        }
        // 2. Images (jpg, jpeg, png) → pas de classification possible sans OCR
        else if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
          // Skip — images cannot be classified without OCR/AI
        }
        // 3. Word docs → extraire texte
        else if (['doc', 'docx'].includes(ext)) {
          try {
            const { extractTextFromCV } = await import('@/lib/cv-parser')
            text = await extractTextFromCV(buffer, c.cv_nom_fichier || `file.${ext}`)
          } catch {
            // Extraction failed
          }
        }

        // Classifier le document
        if (text && text.trim().length >= 30) {
          const classification = classifyDocument(text)
          results.push({
            id: c.id, nom: c.nom, prenom: c.prenom,
            cv_nom_fichier: c.cv_nom_fichier,
            ...classification,
          })
        } else {
          results.push({ id: c.id, nom: c.nom, prenom: c.prenom, cv_nom_fichier: c.cv_nom_fichier, isCV: true, confidence: 0, reason: 'Texte non extractible' })
        }
      } catch {
        results.push({ id: c.id, nom: c.nom, prenom: c.prenom, cv_nom_fichier: c.cv_nom_fichier, isCV: true, confidence: 0, reason: 'Erreur de traitement' })
      }
    }

    // Filtrer : ne retourner que les non-CV (les problèmes)
    const problems = results.filter(r => !r.isCV)
    const scanned = results.length

    return NextResponse.json({
      scanned,
      total: count || 0,
      offset,
      problems,
      all_results: results,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur serveur'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
