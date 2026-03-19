// src/app/api/cv/parse/route.ts
// Route Handler : Upload CV → Supabase Storage → Extraction texte → Claude → Candidat en base
// POST /api/cv/parse

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractTextFromCV, validateCVFile } from '@/lib/cv-parser'
import { analyserCV, analyserCVDepuisPDF } from '@/lib/claude'
import type { CandidatInsert } from '@/types/database'

export const runtime = 'nodejs'   // pdf-parse nécessite Node.js runtime (pas Edge)
export const maxDuration = 60     // 60 secondes max (analyse IA peut être lente)

export async function POST(request: NextRequest) {
  try {
    // 1. Initialiser Supabase (mode admin, pas besoin d'utilisateur connecté)
    const supabase = createAdminClient()

    // 2. Récupérer le fichier depuis le FormData
    const formData = await request.formData()
    const file = formData.get('cv') as File | null
    const statutPipeline = (formData.get('statut') as string) || 'nouveau'
    const offreId = formData.get('offre_id') as string | null

    if (!file) {
      return NextResponse.json(
        { error: 'Aucun fichier fourni. Utilisez le champ "cv".' },
        { status: 400 }
      )
    }

    // 3. Valider le fichier
    const validation = validateCVFile(file)
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    console.log(`[CV Parse] Début traitement : ${file.name} (${(file.size / 1024).toFixed(0)} KB)`)

    // 4. Convertir en Buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // 5. Extraire le texte brut du CV
    console.log('[CV Parse] Extraction du texte...')
    const texteCV = await extractTextFromCV(buffer, file.name, file.type)

    const isPDF = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'
    const isScanned = !texteCV || texteCV.trim().length < 50

    // 6. Analyser le CV avec Claude
    console.log('[CV Parse] Analyse Claude IA...')
    let analyse

    if (isScanned && isPDF) {
      // PDF scanné : envoyer le PDF directement à Claude (OCR natif)
      console.log('[CV Parse] PDF scanné détecté → analyse vision Claude...')
      analyse = await analyserCVDepuisPDF(buffer)
    } else if (isScanned) {
      return NextResponse.json(
        { error: 'Le fichier semble vide ou illisible. Vérifiez que le CV contient du texte.' },
        { status: 422 }
      )
    } else {
      console.log(`[CV Parse] Texte extrait : ${texteCV.length} caractères`)
      analyse = await analyserCV(texteCV)
    }

    console.log(`[CV Parse] Analyse terminée : ${analyse.nom} ${analyse.prenom}`)

    // 7. Upload du fichier vers Supabase Storage
    const adminClient = createAdminClient()
    const timestamp = Date.now()
    const nomFichierStorage = `${timestamp}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

    console.log('[CV Parse] Upload Supabase Storage...')
    const { data: storageData, error: storageError } = await adminClient.storage
      .from('cvs')
      .upload(nomFichierStorage, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })

    if (storageError) {
      console.error('[CV Parse] Erreur storage:', storageError)
      // On continue même si le storage échoue (pas bloquant)
    }

    // Obtenir l'URL signée (valide 10 ans)
    let cvUrl: string | null = null
    if (storageData?.path) {
      const { data: urlData } = await adminClient.storage
        .from('cvs')
        .createSignedUrl(storageData.path, 60 * 60 * 24 * 365 * 10)
      cvUrl = urlData?.signedUrl || null
    }

    // 8. Créer le candidat en base
    console.log('[CV Parse] Création du candidat en base...')
    const nouveauCandidat: CandidatInsert = {
      nom: analyse.nom || 'Candidat',
      prenom: analyse.prenom || null,
      email: analyse.email || null,
      telephone: analyse.telephone || null,
      localisation: analyse.localisation || null,
      titre_poste: analyse.titre_poste || null,
      annees_exp: analyse.annees_exp || 0,
      competences: analyse.competences || [],
      formation: analyse.formation || null,
      cv_url: cvUrl,
      cv_nom_fichier: file.name,
      resume_ia: analyse.resume || null,
      cv_texte_brut: texteCV.slice(0, 10000),
      statut_pipeline: statutPipeline as any,
      tags: [],
      notes: null,
      source: 'upload',
      langues: analyse.langues?.length ? analyse.langues : null,
      linkedin: analyse.linkedin || null,
      permis_conduire: analyse.permis_conduire ?? null,
      date_naissance: analyse.date_naissance || null,
      experiences: analyse.experiences?.length ? analyse.experiences : null,
      formations_details: analyse.formations_details?.length ? analyse.formations_details : null,
    }

    const { data: candidatRaw, error: dbError } = await adminClient
      .from('candidats')
      .insert(nouveauCandidat)
      .select()
      .single()

    const candidat = candidatRaw as import('@/types/database').Candidat | null

    if (dbError) {
      console.error('[CV Parse] Erreur base de données:', dbError)
      return NextResponse.json(
        { error: `Erreur création candidat : ${dbError.message}` },
        { status: 500 }
      )
    }

    // 9. Si une offre est spécifiée, créer l'entrée pipeline
    if (offreId && candidat) {
      await adminClient
        .from('pipeline')
        .insert({
          candidat_id: candidat.id,
          offre_id: offreId,
          etape: statutPipeline as any,
          score_ia: null,
        })
        .select()
    }

    console.log(`[CV Parse] Succès ! Candidat créé : ${candidat?.id}`)

    return NextResponse.json({
      success: true,
      candidat,
      analyse,
      cv_url: cvUrl,
      message: `Candidat ${analyse.prenom || ''} ${analyse.nom} créé avec succès`,
    })

  } catch (error) {
    console.error('[CV Parse] Erreur inattendue:', error)

    const message = error instanceof Error ? error.message : 'Erreur serveur inattendue'

    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}

// GET : tester que la route fonctionne
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    route: 'POST /api/cv/parse',
    description: 'Upload CV → Extraction → Analyse IA → Création candidat',
    champs_requis: ['cv (File)'],
    champs_optionnels: ['statut (string)', 'offre_id (uuid)'],
  })
}
