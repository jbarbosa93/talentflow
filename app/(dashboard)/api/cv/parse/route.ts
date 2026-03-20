// src/app/api/cv/parse/route.ts
// Route Handler : Upload CV → Supabase Storage → Extraction texte → Claude → Candidat en base
// POST /api/cv/parse

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractTextFromCV, validateCVFile } from '@/lib/cv-parser'
import { analyserCV, analyserCVDepuisPDF, analyserCVDepuisImage } from '@/lib/claude'
import type { CandidatInsert } from '@/types/database'
import { logActivity } from '@/lib/activity-log'

export const runtime = 'nodejs'        // pdf-parse nécessite Node.js runtime (pas Edge)
export const maxDuration = 60          // 60s max (Vercel Hobby)
export const preferredRegion = 'dub1'  // Dublin — aligné avec Supabase eu-west-1 (Ireland)

// ─── Timeout utilitaire ───────────────────────────────────────────────────────
// Garantit qu'on répond TOUJOURS avant que Vercel coupe la connexion TCP à 60s.
// Sans ça, certains PDFs lourds font raccrocher Vercel silencieusement → "Failed to fetch"
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout ${label} (${ms / 1000}s)`)), ms)
    ),
  ])
}

export async function POST(request: NextRequest) {
  // Enveloppe globale : répond toujours en < 55s même si pdf-parse ou Claude bloque
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Timeout global 55s — réessayez')), 55_000)
  )

  try {
    return await Promise.race([handlePOST(request), timeout])
  } catch (error) {
    console.error('[CV Parse] Erreur ou timeout:', error)
    const message = error instanceof Error ? error.message : 'Erreur serveur inattendue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  // 1. Initialiser Supabase
  const supabase = createAdminClient()

  // 2. Récupérer le fichier — FormData (petit) ou JSON storage_path (gros)
  const ct = request.headers.get('content-type') || ''
  let file: File | null = null
  let statutPipeline = 'nouveau'
  let offreId: string | null = null
  let forceInsert = false
  let replaceId: string | null = null
  let storagePathInput: string | null = null

  let categorie: string | null = null

  if (ct.includes('application/json')) {
    const body = await request.json()
    storagePathInput = body.storage_path
    statutPipeline   = body.statut || 'nouveau'
    forceInsert      = body.force_insert === true
    replaceId        = body.replace_id || null
    offreId          = body.offre_id || null
    categorie        = body.categorie || null
  } else {
    const formData = await request.formData()
    file            = formData.get('cv') as File | null
    statutPipeline  = (formData.get('statut') as string) || 'nouveau'
    offreId         = formData.get('offre_id') as string | null
    forceInsert     = formData.get('force_insert') === 'true'
    replaceId       = formData.get('replace_id') as string | null
    storagePathInput = formData.get('storage_path') as string | null
    categorie        = formData.get('categorie') as string | null
  }

  // Si storage_path fourni → télécharger depuis Supabase
  if (!file && storagePathInput) {
    const adminDl = createAdminClient()
    const { data: blob, error: dlErr } = await withTimeout(
      adminDl.storage.from('cvs').download(storagePathInput),
      10_000, 'téléchargement storage'
    )
    if (dlErr || !blob) {
      return NextResponse.json({ error: `Fichier introuvable en storage : ${dlErr?.message}` }, { status: 404 })
    }
    const arrBuf = await blob.arrayBuffer()
    const fileName = storagePathInput.split('/').pop() || 'cv'
    file = new File([arrBuf], fileName, { type: blob.type })
  }

  if (!file) {
    return NextResponse.json(
      { error: 'Aucun fichier fourni. Utilisez le champ "cv" ou "storage_path".' },
      { status: 400 }
    )
  }

  // 3. Valider
  const validation = validateCVFile(file)
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  console.log(`[CV Parse] Début : ${file.name} (${(file.size / 1024).toFixed(0)} KB)`)

  // 3b. Vérification rapide : fichier déjà importé ? (par nom de fichier)
  //     Évite de consommer l'API Claude pour des CVs déjà en base
  if (!forceInsert && !replaceId) {
    const { data: existingByFile } = await supabase
      .from('candidats')
      .select('id, prenom, nom, email, titre_poste, created_at')
      .eq('cv_nom_fichier', file.name)
      .maybeSingle()

    if (existingByFile) {
      console.log(`[CV Parse] Fichier déjà importé : ${file.name} → skip analyse IA`)
      await logActivity({ action: 'cv_doublon', details: { fichier: file.name, dossier: categorie || '—', candidat: `${existingByFile.prenom || ''} ${existingByFile.nom}`.trim(), raison: 'fichier_existant' } })
      return NextResponse.json({
        isDuplicate: true,
        candidatExistant: existingByFile,
        analyse: { prenom: existingByFile.prenom, nom: existingByFile.nom, email: existingByFile.email, titre_poste: existingByFile.titre_poste },
        message: `Déjà importé : ${existingByFile.prenom} ${existingByFile.nom}`,
      })
    }
  }

  // 4. Convertir en Buffer
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // 5. Extraire le texte — timeout 10s (pdf-parse peut bloquer sur des PDFs corrompus)
  console.log('[CV Parse] Extraction texte...')
  const texteCV = await withTimeout(
    extractTextFromCV(buffer, file.name, file.type),
    10_000, 'extraction texte'
  ).catch(() => '')  // si extraction timeout → traiter comme PDF scanné

  const ext      = file.name.toLowerCase().split('.').pop() || ''
  const isPDF    = ext === 'pdf' || file.type === 'application/pdf'
  const isDoc    = ext === 'doc' || file.type === 'application/msword'
  const isImage  = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) || file.type.startsWith('image/')
  const isScanned = !texteCV || texteCV.trim().length < 50

  // 6. Analyse Claude — timeout 45s
  console.log('[CV Parse] Analyse Claude IA...')
  let analyse

  try {
    if (isImage) {
      console.log(`[CV Parse] Image (${ext}) → vision Claude...`)
      const mimeType = (file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`) as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
      analyse = await withTimeout(analyserCVDepuisImage(buffer, mimeType), 50_000, 'analyse image')
    } else if (isScanned && isPDF) {
      console.log('[CV Parse] PDF scanné détecté → envoi direct à Claude...')
      analyse = await withTimeout(analyserCVDepuisPDF(buffer), 40_000, 'analyse PDF scanné')
    } else if (isScanned && isDoc) {
      // .doc (Word 97-2003) : si word-extractor n'a pas pu extraire le texte,
      // on ne peut pas envoyer un .doc à Claude (format binaire non supporté)
      return NextResponse.json(
        { error: 'Fichier .doc illisible. Convertissez-le en PDF ou DOCX avant de l\'importer.' },
        { status: 422 }
      )
    } else if (isScanned) {
      return NextResponse.json(
        { error: 'Le fichier semble vide ou illisible. Vérifiez que le CV contient du texte.' },
        { status: 422 }
      )
    } else {
      console.log(`[CV Parse] Texte : ${texteCV.length} chars`)
      analyse = await withTimeout(analyserCV(texteCV), 50_000, 'analyse texte')
    }
  } catch (analyseErr: any) {
    const errMsg = analyseErr?.message || 'Erreur analyse IA'
    console.error('[CV Parse] Erreur analyse Claude:', errMsg)
    await logActivity({ action: 'cv_erreur', details: { fichier: file.name, dossier: categorie || '—', erreur: errMsg } })
    throw analyseErr
  }

  console.log(`[CV Parse] Analyse OK : ${analyse.nom} ${analyse.prenom}`)

  // 7. Upload Supabase Storage — timeout 15s
  const adminClient = createAdminClient()
  const timestamp = Date.now()
  const nomFichierStorage = `${timestamp}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  console.log('[CV Parse] Upload storage...')
  const { data: storageData, error: storageError } = await withTimeout(
    adminClient.storage.from('cvs').upload(nomFichierStorage, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    }),
    15_000, 'upload storage'
  ).catch(err => {
    console.error('[CV Parse] Storage timeout/erreur (non bloquant):', err.message)
    return { data: null, error: err }
  })

  if (storageError && !storageData) {
    console.error('[CV Parse] Erreur storage:', storageError)
  }

  let cvUrl: string | null = null
  if (storageData?.path) {
    const { data: urlData } = await adminClient.storage
      .from('cvs')
      .createSignedUrl(storageData.path, 60 * 60 * 24 * 365 * 10)
    cvUrl = urlData?.signedUrl || null
  }

  // 8. Supprimer l'existant si "remplacer"
  if (replaceId) {
    await adminClient.from('candidats').delete().eq('id', replaceId)
  }

  // 8b. Vérifier les doublons (email → téléphone → nom+prénom)
  let candidatExistant: any = null
  if (!forceInsert && !replaceId && analyse.email) {
    const { data: byEmail } = await adminClient
      .from('candidats').select('id, prenom, nom, email, titre_poste, created_at')
      .eq('email', analyse.email).maybeSingle()
    candidatExistant = byEmail
  }
  if (!forceInsert && !replaceId && !candidatExistant && analyse.telephone) {
    // Normaliser le téléphone : garder uniquement les chiffres pour comparaison
    const telNormalise = analyse.telephone.replace(/\D/g, '')
    if (telNormalise.length >= 8) {
      const { data: byPhone } = await adminClient
        .from('candidats').select('id, prenom, nom, email, titre_poste, created_at')
        .ilike('telephone', `%${telNormalise.slice(-9)}%`).maybeSingle()
      candidatExistant = byPhone
    }
  }
  if (!forceInsert && !replaceId && !candidatExistant && analyse.nom && analyse.prenom) {
    const { data: byName } = await adminClient
      .from('candidats').select('id, prenom, nom, email, titre_poste, created_at')
      .ilike('nom', analyse.nom).ilike('prenom', analyse.prenom).maybeSingle()
    candidatExistant = byName
  }
  if (candidatExistant) {
    console.log(`[CV Parse] Doublon : ${candidatExistant.prenom} ${candidatExistant.nom}`)
    await logActivity({ action: 'cv_doublon', details: { fichier: file.name, dossier: categorie || '—', candidat: `${analyse.prenom || ''} ${analyse.nom}`.trim(), raison: 'candidat_existant' } })
    return NextResponse.json({
      isDuplicate: true,
      candidatExistant,
      analyse,
      message: `Doublon : ${analyse.prenom} ${analyse.nom} existe déjà`,
    })
  }

  // 9. Créer le candidat en base
  console.log('[CV Parse] Insertion en base...')
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

  let { data: candidatRaw, error: dbError } = await adminClient
    .from('candidats')
    .insert(nouveauCandidat)
    .select()
    .single()

  // Si erreur de colonne inconnue (migration non exécutée), réessayer sans les colonnes optionnelles
  if (dbError && (dbError.code === '42703' || dbError.message?.includes('column'))) {
    console.warn('[CV Parse] Colonnes optionnelles absentes, retry sans:', dbError.message)
    const { langues, linkedin, permis_conduire, date_naissance, experiences, formations_details, ...baseCandidat } = nouveauCandidat as any
    const retry = await adminClient.from('candidats').insert(baseCandidat).select().single()
    candidatRaw = retry.data
    dbError = retry.error
  }

  const candidat = candidatRaw as import('@/types/database').Candidat | null

  if (dbError) {
    console.error('[CV Parse] Erreur BDD:', dbError)
    await logActivity({ action: 'cv_erreur', details: { fichier: file.name, dossier: categorie || '—', erreur: dbError.message } })
    return NextResponse.json({ error: `Erreur création candidat : ${dbError.message}` }, { status: 500 })
  }

  // 10. Pipeline si offre spécifiée
  if (offreId && candidat) {
    await adminClient.from('pipeline').insert({
      candidat_id: candidat.id,
      offre_id: offreId,
      etape: statutPipeline as any,
      score_ia: null,
    }).select()
  }

  console.log(`[CV Parse] Succès ! Candidat : ${candidat?.id}`)
  await logActivity({ action: 'cv_importe', details: { fichier: file.name, dossier: categorie || '—', candidat: `${analyse.prenom || ''} ${analyse.nom}`.trim(), email: analyse.email || '—' } })

  return NextResponse.json({
    success: true,
    candidat,
    analyse,
    cv_url: cvUrl,
    message: `Candidat ${analyse.prenom || ''} ${analyse.nom} créé avec succès`,
  })
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
