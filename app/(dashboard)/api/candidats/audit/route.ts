// app/(dashboard)/api/candidats/audit/route.ts
// GET /api/candidats/audit — scans ALL candidates and returns audit results
// Fast data-only checks (no AI calls)

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 300

const AUDIT_COLUMNS = [
  'id', 'nom', 'prenom', 'email', 'telephone',
  'titre_poste', 'competences', 'experiences',
  'cv_url', 'cv_nom_fichier', 'photo_url', 'documents',
].join(', ')

// Filename patterns that suggest a document is NOT a CV
const CV_SUSPECT_PATTERNS = [
  'certificat', 'attestation', 'diplome', 'diplôme',
  'formation', 'lettre', 'motivation', 'recommandation',
  'permis', 'passeport', 'carte', 'licence', 'brevet',
]

// Filename patterns that suggest a photo is suspicious
const PHOTO_SUSPECT_PATTERNS = [
  'attestation', 'certificat', 'logo', 'diplome', 'diplôme',
  'document', 'scan', 'formulaire', 'facture',
]

interface PhotoSuspecte {
  id: string
  nom: string
  prenom: string | null
  photo_url: string
  reason: string
}

interface CvMalClasse {
  id: string
  nom: string
  prenom: string | null
  cv_url: string
  cv_nom_fichier: string
  suspected_type: string
}

interface FicheIncomplete {
  id: string
  nom: string
  prenom: string | null
  missing_fields: string[]
}

interface SansCv {
  id: string
  nom: string
  prenom: string | null
  has_documents: boolean
}

function normalise(s: string): string {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function detectSuspectPhoto(c: any): PhotoSuspecte | null {
  if (!c.photo_url) return null

  const photoUrl = normalise(c.photo_url)

  // Check filename patterns in photo URL
  for (const pattern of PHOTO_SUSPECT_PATTERNS) {
    if (photoUrl.includes(pattern)) {
      return {
        id: c.id,
        nom: c.nom,
        prenom: c.prenom,
        photo_url: c.photo_url,
        reason: `Le nom du fichier contient "${pattern}"`,
      }
    }
  }

  // Check if photo URL contains the CV filename (photo extracted from a non-CV document)
  if (c.cv_nom_fichier) {
    const cvName = normalise(c.cv_nom_fichier)
    for (const pattern of CV_SUSPECT_PATTERNS) {
      if (cvName.startsWith(pattern)) {
        return {
          id: c.id,
          nom: c.nom,
          prenom: c.prenom,
          photo_url: c.photo_url,
          reason: `Photo extraite d'un document "${c.cv_nom_fichier}" (probablement pas un CV)`,
        }
      }
    }
  }

  // Photo URL contains "photos/" but also contains suspect patterns from original filename
  const photoFileName = photoUrl.split('/').pop() || ''
  for (const pattern of [...PHOTO_SUSPECT_PATTERNS, 'candidature', 'recue', 'recu', 'dossier']) {
    if (photoFileName.includes(pattern)) {
      return {
        id: c.id,
        nom: c.nom,
        prenom: c.prenom,
        photo_url: c.photo_url,
        reason: `Fichier photo suspect : "${pattern}" dans le nom`,
      }
    }
  }

  // Has photo but no CV → photo likely came from a non-CV document
  if (!c.cv_url && c.photo_url) {
    return {
      id: c.id,
      nom: c.nom,
      prenom: c.prenom,
      photo_url: c.photo_url,
      reason: 'Photo présente mais aucun CV associé — source suspecte',
    }
  }

  return null
}

function detectCvMalClasse(c: any): CvMalClasse | null {
  if (!c.cv_url || !c.cv_nom_fichier) return null

  const filename = normalise(c.cv_nom_fichier)
  const nameOnly = (filename.split('/').pop() || filename).replace(/[_\-\.]/g, ' ')

  // Check if any suspect keyword appears as a word in the filename
  for (const pattern of CV_SUSPECT_PATTERNS) {
    // Match as whole word or at start of name
    const regex = new RegExp(`(^|\\s|_|-)${pattern}`, 'i')
    if (regex.test(nameOnly)) {
      // But if filename ALSO contains "cv" as a word, it might still be a CV
      // Only skip if "cv" appears AND no suspect keyword appears before it
      const cvPos = nameOnly.indexOf('cv')
      const patternPos = nameOnly.indexOf(pattern)
      if (cvPos >= 0 && cvPos < patternPos) continue // "cv" appears first → probably a CV

      return {
        id: c.id,
        nom: c.nom,
        prenom: c.prenom,
        cv_url: c.cv_url,
        cv_nom_fichier: c.cv_nom_fichier,
        suspected_type: pattern.charAt(0).toUpperCase() + pattern.slice(1),
      }
    }
  }

  return null
}

function detectFicheIncomplete(c: any): FicheIncomplete | null {
  const missing: string[] = []

  if (!c.nom || c.nom === 'Candidat') missing.push('nom')
  if (!c.email && !c.telephone) missing.push('email ou telephone')
  if (!c.competences || (Array.isArray(c.competences) && c.competences.length === 0)) missing.push('competences')
  if (!c.experiences || (Array.isArray(c.experiences) && c.experiences.length === 0)) missing.push('experiences')
  if (!c.titre_poste) missing.push('titre_poste')

  if (missing.length === 0) return null

  return {
    id: c.id,
    nom: c.nom,
    prenom: c.prenom,
    missing_fields: missing,
  }
}

function detectSansCv(c: any): SansCv | null {
  // Pas de cv_url du tout
  if (!c.cv_url) {
    const docs = c.documents || []
    return {
      id: c.id,
      nom: c.nom,
      prenom: c.prenom,
      has_documents: Array.isArray(docs) && docs.length > 0,
    }
  }

  // A un cv_url mais c'est peut-être pas un vrai CV — vérifier via le nom du fichier
  if (c.cv_nom_fichier) {
    const nameOnly = normalise(c.cv_nom_fichier).split('/').pop() || ''
    // Si le nom ne contient PAS "cv" ou "curriculum" mais contient un mot suspect → pas un vrai CV
    const hasCvWord = nameOnly.includes('cv') || nameOnly.includes('curriculum') || nameOnly.includes('resume')
    if (!hasCvWord) {
      for (const pattern of CV_SUSPECT_PATTERNS) {
        const regex = new RegExp(`(^|\\s|_|-)${pattern}`, 'i')
        if (regex.test(nameOnly)) {
          return {
            id: c.id,
            nom: c.nom,
            prenom: c.prenom,
            has_documents: true,
          }
        }
      }
    }
  }

  return null
}

export async function GET() {
  try {
    const supabase = createAdminClient()

    // Fetch ALL candidates in batches
    const PAGE_SIZE = 1000
    const allData: any[] = []
    let offset = 0

    while (true) {
      const { data, error } = await supabase
        .from('candidats')
        .select(AUDIT_COLUMNS)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      if (!data || data.length === 0) break
      allData.push(...data)
      if (data.length < PAGE_SIZE) break
      offset += PAGE_SIZE
    }

    // Run all checks
    const photos_suspectes: PhotoSuspecte[] = []
    const cvs_mal_classes: CvMalClasse[] = []
    const fiches_incompletes: FicheIncomplete[] = []
    const sans_cv: SansCv[] = []

    for (const c of allData) {
      const photo = detectSuspectPhoto(c)
      if (photo) photos_suspectes.push(photo)

      const cv = detectCvMalClasse(c)
      if (cv) cvs_mal_classes.push(cv)

      const fiche = detectFicheIncomplete(c)
      if (fiche) fiches_incompletes.push(fiche)

      const noCv = detectSansCv(c)
      if (noCv) sans_cv.push(noCv)
    }

    // Compute health score: % of candidates with zero issues
    const candidatsWithIssues = new Set([
      ...photos_suspectes.map(p => p.id),
      ...cvs_mal_classes.map(c => c.id),
      ...fiches_incompletes.map(f => f.id),
      ...sans_cv.map(s => s.id),
    ])
    const healthyCount = allData.length - candidatsWithIssues.size
    const score_sante = allData.length > 0
      ? Math.round((healthyCount / allData.length) * 100)
      : 100

    return NextResponse.json({
      summary: {
        total_candidats: allData.length,
        photos_suspectes: photos_suspectes.length,
        cvs_mal_classes: cvs_mal_classes.length,
        fiches_incompletes: fiches_incompletes.length,
        sans_cv: sans_cv.length,
        score_sante,
      },
      photos_suspectes,
      cvs_mal_classes,
      fiches_incompletes,
      sans_cv,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
