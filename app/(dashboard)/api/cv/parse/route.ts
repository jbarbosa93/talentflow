// src/app/api/cv/parse/route.ts
// Route Handler : Upload CV → Supabase Storage → Extraction texte → Claude → Candidat en base
// POST /api/cv/parse

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractTextFromCV, validateCVFile } from '@/lib/cv-parser'
import { analyserCV, analyserCVDepuisPDF, analyserCVDepuisImage } from '@/lib/claude'
import type { CandidatInsert, DocumentType } from '@/types/database'
import { logActivity } from '@/lib/activity-log'
import { logActivityServer, getRouteUser } from '@/lib/logActivity'
import { analyserDocumentMultiType } from '@/lib/document-splitter'
import { normaliserGenre } from '@/lib/normaliser-genre'

export const runtime = 'nodejs'        // pdf-parse nécessite Node.js runtime (pas Edge)
export const maxDuration = 300         // 300s max (Vercel Pro)
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

function mapDocumentType(type: string): DocumentType {
  const mapping: Record<string, DocumentType> = {
    'certificat': 'certificat',
    'diplome': 'diplome',
    'lettre_motivation': 'lettre_motivation',
    'formation': 'formation',
    'permis': 'permis',
    'attestation': 'certificat', // attestation → certificat category
  }
  return mapping[type] || 'autre'
}

/**
 * Extrait une date au format D.M.YYYY ou DD.MM.YYYY du nom de fichier.
 * Retourne une chaîne ISO 8601 (midi UTC) ou null si non trouvée / invalide.
 * Exemples :
 *   "Jean Dupont 15.03.2024.pdf"  → "2024-03-15T12:00:00.000Z"
 *   "BOYA 1.10.2024.pdf"          → "2024-10-01T12:00:00.000Z"
 */
function extractDateFromFilename(filename: string): string | null {
  const match = filename.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (!match) return null
  const [, ddRaw, mmRaw, yyyy] = match
  const d = parseInt(ddRaw, 10), m = parseInt(mmRaw, 10), y = parseInt(yyyy, 10)
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1950 || y > 2099) return null
  const daysInMonth = new Date(y, m, 0).getDate()
  if (d > daysInMonth) return null
  const dd = String(d).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T12:00:00.000Z`
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
  let statutPipeline: string | null = null // JAMAIS d'ajout auto en pipeline
  let offreId: string | null = null
  let forceInsert = false
  let replaceId: string | null = null
  let storagePathInput: string | null = null

  let categorie: string | null = null

  let updateId: string | null = null
  let useFilenameDate = false
  let mode: string | null = null // 'reanalyse' = écrasement total sauf nom/prénom/photo
  let fileDate: string | null = null // date de dernière modification du fichier (lastModified)

  if (ct.includes('application/json')) {
    const body = await request.json()
    storagePathInput = body.storage_path
    statutPipeline   = body.statut || null
    forceInsert      = body.force_insert === true
    replaceId        = body.replace_id || null
    updateId         = body.update_id || null
    offreId          = body.offre_id || null
    categorie        = body.categorie || null
    useFilenameDate  = body.use_filename_date === true
    mode             = body.mode || null
    fileDate         = body.file_date || null
  } else {
    const formData = await request.formData()
    file            = formData.get('cv') as File | null
    statutPipeline  = (formData.get('statut') as string) || null
    offreId         = formData.get('offre_id') as string | null
    forceInsert     = formData.get('force_insert') === 'true'
    replaceId       = formData.get('replace_id') as string | null
    updateId        = formData.get('update_id') as string | null
    storagePathInput = formData.get('storage_path') as string | null
    categorie        = formData.get('categorie') as string | null
    useFilenameDate  = formData.get('use_filename_date') === 'true'
    mode             = formData.get('mode') as string | null
    fileDate         = formData.get('file_date') as string | null
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
  //     Note : on utilise file.name ici (avant split) pour détecter le doublon du fichier source
  if (!forceInsert && !replaceId && !updateId) {
    const { data: existingByFile } = await supabase
      .from('candidats')
      .select('id, prenom, nom, email, titre_poste, created_at')
      .eq('cv_nom_fichier', file.name)
      .maybeSingle()

    if (existingByFile) {
      console.log(`[CV Parse] Fichier déjà importé : ${file.name} → mise à jour date`)
      // Mettre à jour created_at (date d'ajout) avec lastModified du fichier
      const dateToUse = fileDate || new Date().toISOString()
      await supabase.from('candidats').update({ created_at: dateToUse, updated_at: new Date().toISOString() } as any).eq('id', existingByFile.id)
      await logActivity({ action: 'cv_doublon', details: { fichier: file.name, dossier: categorie || '—', candidat: `${existingByFile.prenom || ''} ${existingByFile.nom}`.trim(), raison: 'fichier_existant' } })
      return NextResponse.json({
        isDuplicate: true,
        sameFile: true,
        candidatExistant: existingByFile,
        analyse: { prenom: existingByFile.prenom, nom: existingByFile.nom, email: existingByFile.email, titre_poste: existingByFile.titre_poste },
        message: `Déjà importé : ${existingByFile.prenom} ${existingByFile.nom}`,
      })
    }
  }

  // 4. Convertir en Buffer
  const arrayBuffer = await file.arrayBuffer()
  let buffer: Buffer = Buffer.from(arrayBuffer)

  // 4b. Détection multi-documents (PDFs uniquement, > 100 KB pour éviter les PDFs vides)
  const ext0    = file.name.toLowerCase().split('.').pop() || ''
  const isPDF0  = ext0 === 'pdf' || file.type === 'application/pdf'
  let autresDocumentsMultiType: Awaited<ReturnType<typeof analyserDocumentMultiType>>['autresDocuments'] = []
  let filenameEffectif = file.name

  if (isPDF0 && file.size > 100 * 1024) {
    try {
      const multiDocResult = await analyserDocumentMultiType(buffer, file.name)
      if (multiDocResult.estMultiDocument) {
        console.log(`[Multi-Doc] PDF multi-type détecté dans ${file.name} → ${multiDocResult.autresDocuments.length} document(s) séparé(s)`)
        buffer = multiDocResult.cvBuffer
        filenameEffectif = multiDocResult.cvFilename
        autresDocumentsMultiType = multiDocResult.autresDocuments
      }
    } catch (multiDocErr) {
      console.warn('[Multi-Doc] Erreur détection multi-type (fallback logique normale):', (multiDocErr as Error).message)
      // Fallback : on continue avec le buffer original sans split
    }
  }

  // 5. Extraire le texte — timeout 10s (pdf-parse peut bloquer sur des PDFs corrompus)
  console.log('[CV Parse] Extraction texte...')
  const texteCV = await withTimeout(
    extractTextFromCV(buffer, filenameEffectif, file.type),
    10_000, 'extraction texte'
  ).catch(() => '')  // si extraction timeout → traiter comme PDF scanné

  const ext      = filenameEffectif.toLowerCase().split('.').pop() || ''
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
      analyse = await withTimeout(analyserCVDepuisPDF(buffer), 55_000, 'analyse PDF scanné')
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

  // 6a-pre. Détection diplôme/certificat : si le fichier a un nom mais aucun contenu CV typique
  // (pas d'expériences, pas de compétences, pas de contact, pas de titre)
  // → c'est probablement un diplôme ou certificat, pas un CV → on refuse l'import
  if (!updateId && !replaceId && !mode) {
    const hasExperiences = Array.isArray(analyse.experiences) && analyse.experiences.length > 0
    const hasCompetences = Array.isArray(analyse.competences) && analyse.competences.length >= 2
    const hasContact     = !!(analyse.email || analyse.telephone)
    const hasTitle       = !!(analyse.titre_poste && analyse.titre_poste !== 'Candidat' && analyse.titre_poste.length > 1)
    const cvScore        = [hasExperiences, hasCompetences, hasContact, hasTitle].filter(Boolean).length
    const hasName        = !!(analyse.nom && analyse.nom !== 'Candidat' && analyse.nom.length > 1)

    if (hasName && cvScore === 0) {
      const nomComplet = [analyse.prenom, analyse.nom].filter(Boolean).join(' ')
      console.warn(`[CV Parse] Diplôme/certificat détecté pour ${nomComplet} — aucun contenu CV`)
      await logActivity({ action: 'cv_erreur', details: { fichier: file.name, dossier: categorie || '—', erreur: 'diplome_detecte', candidat: nomComplet } })
      return NextResponse.json({
        isDiplome: true,
        error: `Ce fichier ressemble à un diplôme ou certificat (pas à un CV) : aucune expérience, compétence ni coordonnée trouvée pour ${nomComplet}. Importez d'abord le CV, puis ajoutez ce document depuis la fiche candidat.`,
        nom: analyse.nom,
        prenom: analyse.prenom,
      }, { status: 422 })
    }
  }

  // 6a. Fallback : si l'analyse retourne un résultat quasi-vide sur un PDF,
  // le CV est peut-être à l'envers → essayer avec le PDF retourné à 180°
  if (isPDF && analyse) {
    const hasName = analyse.nom && analyse.nom !== 'Candidat' && analyse.nom.length > 1
    const hasAnyInfo = analyse.email || analyse.telephone || (analyse.competences && analyse.competences.length > 0)
    if (!hasName && !hasAnyInfo) {
      console.log('[CV Parse] Analyse quasi-vide → tentative avec PDF retourné à 180°...')
      try {
        // Retourner le PDF à 180° avec pdf-lib
        const { PDFDocument, degrees: pdfDegrees } = await import('pdf-lib')
        const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true })
        for (let p = 0; p < pdfDoc.getPageCount(); p++) {
          const page = pdfDoc.getPage(p)
          const curr = page.getRotation().angle
          page.setRotation(pdfDegrees((curr + 180) % 360))
        }
        const rotatedBuffer = Buffer.from(await pdfDoc.save())
        const retryAnalyse = await withTimeout(analyserCVDepuisPDF(rotatedBuffer), 55_000, 'analyse PDF 180° fallback')
        const retryHasName = retryAnalyse.nom && retryAnalyse.nom !== 'Candidat' && retryAnalyse.nom.length > 1
        const retryHasInfo = retryAnalyse.email || retryAnalyse.telephone || (retryAnalyse.competences && retryAnalyse.competences.length > 0)
        if (retryHasName || retryHasInfo) {
          console.log(`[CV Parse] Fallback 180° réussi : ${retryAnalyse.nom} ${retryAnalyse.prenom}`)
          analyse = retryAnalyse
        } else {
          console.log('[CV Parse] Fallback 180° aussi quasi-vide')
        }
      } catch (fallbackErr) {
        console.warn('[CV Parse] Fallback 180° échoué:', (fallbackErr as Error).message)
      }
    }
  }

  // 6a-bis. Fallback Vision : si le nom est "Candidat" mais il y a des infos,
  // le nom est probablement dans un bandeau graphique → envoyer à Claude Vision
  if (isPDF && analyse && (!analyse.nom || analyse.nom === 'Candidat') &&
      (analyse.competences?.length > 0 || analyse.experiences?.length > 0)) {
    console.log('[CV Parse] Nom "Candidat" avec infos → fallback Claude Vision pour trouver le nom...')
    try {
      const visionResult = await withTimeout(analyserCVDepuisPDF(buffer), 50_000, 'vision nom fallback')
      if (visionResult.nom && visionResult.nom !== 'Candidat' && visionResult.nom.length > 1) {
        console.log(`[CV Parse] Vision a trouvé le nom : ${visionResult.prenom} ${visionResult.nom}`)
        analyse.nom = visionResult.nom
        analyse.prenom = visionResult.prenom || analyse.prenom
        // Aussi récupérer email/tel si manquants
        if (!analyse.email && visionResult.email) analyse.email = visionResult.email
        if (!analyse.telephone && visionResult.telephone) analyse.telephone = visionResult.telephone
      } else {
        console.log('[CV Parse] Vision n\'a pas trouvé le nom non plus')
      }
    } catch (visionErr) {
      console.warn('[CV Parse] Fallback Vision échoué:', (visionErr as Error).message)
    }
  }

  // 6b. Extraction photo candidat (PDFs CV uniquement — pas pour attestations/certificats)
  let photoUrl: string | null = null
  const docType = analyse?.document_type || 'cv'
  console.log(`[CV Parse] Document type: ${docType}, isPDF: ${isPDF}, file.type: ${file.type}, ext: ${ext}`)
  if (isPDF && analyse && docType === 'cv') {
    try {
      const { extractPhotoFromPDF } = await import('@/lib/cv-photo')
      console.log('[CV Parse] Extraction photo en cours...')
      const photoBuffer = await extractPhotoFromPDF(buffer)
      console.log(`[CV Parse] Photo buffer: ${photoBuffer ? `${photoBuffer.length} bytes` : 'null'}`)
      if (photoBuffer) {
        const photoTimestamp = Date.now()
        const photoFileName = `photos/${photoTimestamp}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}.jpg`
        const { data: photoData } = await (createAdminClient()).storage.from('cvs').upload(photoFileName, photoBuffer, {
          contentType: 'image/jpeg',
          upsert: false,
        })
        if (photoData?.path) {
          const { data: photoUrlData } = await (createAdminClient()).storage.from('cvs').createSignedUrl(photoData.path, 60 * 60 * 24 * 365 * 10)
          photoUrl = photoUrlData?.signedUrl || null
          if (photoUrl) console.log('[CV Parse] Photo extraite et stockée')
        }
      }
    } catch (photoErr) {
      console.warn('[CV Parse] Photo extraction skipped:', (photoErr as Error).message)
    }
  }

  // 6c. Extraction photo DOCX (Word) — si c'est un CV et pas un PDF
  const isDOCX = ext === 'docx' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (isDOCX && !photoUrl && analyse && docType === 'cv') {
    try {
      const { extractPhotoFromDOCX } = await import('@/lib/cv-photo')
      console.log('[CV Parse] Extraction photo DOCX en cours...')
      const photoBuffer = await extractPhotoFromDOCX(buffer)
      console.log(`[CV Parse] Photo DOCX buffer: ${photoBuffer ? `${photoBuffer.length} bytes` : 'null'}`)
      if (photoBuffer) {
        const photoTimestamp = Date.now()
        const photoFileName = `photos/${photoTimestamp}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}.jpg`
        const { data: photoData } = await (createAdminClient()).storage.from('cvs').upload(photoFileName, photoBuffer, {
          contentType: 'image/jpeg',
          upsert: false,
        })
        if (photoData?.path) {
          const { data: photoUrlData } = await (createAdminClient()).storage.from('cvs').createSignedUrl(photoData.path, 60 * 60 * 24 * 365 * 10)
          photoUrl = photoUrlData?.signedUrl || null
          if (photoUrl) console.log('[CV Parse] Photo DOCX extraite et stockée')
        }
      }
    } catch (photoErr) {
      console.warn('[CV Parse] DOCX photo extraction skipped:', (photoErr as Error).message)
    }
  }

  // 7. Upload Supabase Storage — timeout 15s
  const adminClient = createAdminClient()
  const timestamp = Date.now()
  const nomFichierStorage = `${timestamp}_${filenameEffectif.replace(/[^a-zA-Z0-9._-]/g, '_')}`

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

  // 8a. Actualiser l'existant si "actualiser"
  if (updateId) {
    // Récupérer le candidat existant (inclure cv_url pour archivage)
    const { data: existing } = await adminClient
      .from('candidats')
      .select('nom, prenom, email, telephone, localisation, competences, langues, experiences, formations_details, photo_url, documents, cv_url, cv_nom_fichier')
      .eq('id', updateId)
      .single()

    const updateData: Record<string, any> = {}

    if (mode === 'reanalyse') {
      // ═══ MODE REANALYSE : écrasement total sauf nom/prénom/photo ═══
      // Nom/prénom : conserver ceux existants (ne pas écraser)
      // Photo : conserver celle existante (ne pas écraser)

      // Écraser TOUT le reste avec les nouvelles données du CV
      updateData.email = analyse.email || null
      updateData.telephone = analyse.telephone || null
      updateData.localisation = analyse.localisation || null
      updateData.titre_poste = analyse.titre_poste || null
      updateData.competences = analyse.competences || []
      updateData.langues = analyse.langues || []
      updateData.experiences = analyse.experiences || []
      updateData.formations_details = analyse.formations_details || []
      updateData.formation = analyse.formation || null
      updateData.linkedin = analyse.linkedin || null
      updateData.permis_conduire = analyse.permis_conduire ?? null
      updateData.date_naissance = analyse.date_naissance || null
      updateData.resume_ia = analyse.resume || null
      updateData.genre = normaliserGenre((analyse as any).genre)
      if (texteCV) updateData.cv_texte_brut = texteCV.slice(0, 10000)
      if (cvUrl) updateData.cv_url = cvUrl
      updateData.cv_nom_fichier = file.name
      // Photo : ne PAS écraser si existante
      if (photoUrl && !existing?.photo_url) {
        updateData.photo_url = photoUrl
      }
      console.log(`[CV Parse] Ré-analyse (écrasement) : ${file.name}`)
    } else {
      // ═══ MODE MERGE : ajouter sans remplacer (import normal) ═══
      // Nom/prénom : mettre à jour seulement si le nom actuel est "Candidat" ou vide
      if (analyse.nom && (!existing?.nom || existing.nom === 'Candidat')) {
        updateData.nom = analyse.nom
      }
      if (analyse.prenom && !existing?.prenom) {
        updateData.prenom = analyse.prenom
      }
      // Email, téléphone, lieu : toujours remplacer
      if (analyse.email) updateData.email = analyse.email
      if (analyse.telephone) updateData.telephone = analyse.telephone
      if (analyse.localisation) updateData.localisation = analyse.localisation
      // Titre poste : toujours mettre à jour (peut évoluer)
      if (analyse.titre_poste) updateData.titre_poste = analyse.titre_poste
      // Compétences : fusionner (ajouter les nouvelles)
      if (analyse.competences?.length) {
        const existingComp = (existing?.competences as string[]) || []
        const merged = [...new Set([...existingComp, ...analyse.competences])]
        updateData.competences = merged
      }
      if (analyse.formation) updateData.formation = analyse.formation
      // Langues : fusionner
      if (analyse.langues?.length) {
        const existingLang = (existing?.langues as string[]) || []
        const merged = [...new Set([...existingLang, ...analyse.langues])]
        updateData.langues = merged
      }
      if (analyse.linkedin) updateData.linkedin = analyse.linkedin
      if (analyse.permis_conduire !== undefined) updateData.permis_conduire = analyse.permis_conduire
      if (analyse.date_naissance) updateData.date_naissance = analyse.date_naissance
      // Expériences : fusionner (ajouter celles qui n'existent pas encore)
      if (analyse.experiences?.length) {
        const existingExp = (existing?.experiences as any[]) || []
        const existingKeys = new Set(existingExp.map((e: any) => `${e.titre || ''}_${e.entreprise || ''}_${e.debut || ''}`))
        const newExp = analyse.experiences.filter((e: any) => !existingKeys.has(`${e.titre || ''}_${e.entreprise || ''}_${e.debut || ''}`))
        if (newExp.length > 0) updateData.experiences = [...existingExp, ...newExp]
      }
      // Formations : fusionner
      if (analyse.formations_details?.length) {
        const existingForm = (existing?.formations_details as any[]) || []
        const existingKeys = new Set(existingForm.map((f: any) => `${f.titre || ''}_${f.etablissement || ''}`))
        const newForm = analyse.formations_details.filter((f: any) => !existingKeys.has(`${f.titre || ''}_${f.etablissement || ''}`))
        if (newForm.length > 0) updateData.formations_details = [...existingForm, ...newForm]
      }
      if (analyse.resume) updateData.resume_ia = analyse.resume
      if (texteCV) updateData.cv_texte_brut = texteCV.slice(0, 10000)
    }

    // Classification du document (commun aux deux modes)
    const isCV = !analyse.document_type || analyse.document_type === 'cv'
    if (isCV && mode !== 'reanalyse') {
      // C'est un CV → archiver l'ancien CV dans les documents, mettre à jour cv_url
      if (cvUrl && existing?.cv_url && existing.cv_url !== cvUrl) {
        const existingDocs = (existing.documents as any[]) || []
        const oldName = existing.cv_nom_fichier || 'Ancien CV'
        // Ne pas archiver si déjà présent (éviter les doublons d'archive)
        if (!existingDocs.some((d: any) => d.url === existing.cv_url)) {
          existingDocs.push({
            name: `[Ancien] ${oldName}`,
            url: existing.cv_url,
            type: 'cv',
            uploaded_at: new Date().toISOString(),
          })
          updateData.documents = existingDocs
        }
      }
      if (cvUrl) updateData.cv_url = cvUrl
      updateData.cv_nom_fichier = file.name
      // Photo : seulement si le candidat n'en a PAS déjà une
      if (photoUrl) {
        const { data: photoCheck } = await adminClient.from('candidats').select('photo_url').eq('id', updateId).single()
        if (!photoCheck?.photo_url) {
          updateData.photo_url = photoUrl
          console.log('[CV Parse] Photo ajoutée (candidat sans photo)')
        } else {
          console.log('[CV Parse] Photo existante conservée')
        }
      }
      console.log(`[CV Parse] Actualisation CV: ${file.name}`)
    } else if (!isCV && mode !== 'reanalyse') {
      // Ce n'est PAS un CV et ce n'est PAS une ré-analyse → ajouter aux documents
      // En mode ré-analyse, on ne crée JAMAIS de documents "Autre" (c'est le CV principal)
      console.log(`[CV Parse] Document classifié comme: ${analyse.document_type}`)
      const mappedType = mapDocumentType(analyse.document_type)
      const existingDocs = (existing?.documents as any[]) || []
      // Éviter les doublons par nom de fichier
      if (!existingDocs.some((d: any) => d.name === file.name)) {
        existingDocs.push({ name: file.name, url: cvUrl, type: mappedType, uploaded_at: new Date().toISOString() })
        updateData.documents = existingDocs
      }
    }

    const now = new Date().toISOString()
    updateData.updated_at = now
    // created_at = lastModified du fichier (date la plus fiable)
    updateData.created_at = fileDate || now

    const { data: updated, error: updateError } = await adminClient
      .from('candidats')
      .update(updateData)
      .eq('id', updateId)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: `Erreur mise à jour : ${updateError.message}` }, { status: 500 })
    }

    await logActivity({ action: 'cv_actualise', details: { fichier: file.name, candidat: `${analyse.prenom || ''} ${analyse.nom}`.trim() } })
    return NextResponse.json({
      success: true,
      candidat: updated,
      analyse,
      cv_url: cvUrl,
      message: `Candidat ${analyse.prenom} ${analyse.nom} actualisé`,
      updated: true,
    })
  }

  // 8b. Vérifier les doublons (email → téléphone → nom+prénom)
  let candidatExistant: any = null
  if (!forceInsert && !replaceId && !updateId && analyse.email) {
    const { data: byEmail } = await adminClient
      .from('candidats').select('id, prenom, nom, email, titre_poste, created_at')
      .eq('email', analyse.email).maybeSingle()
    candidatExistant = byEmail
  }
  if (!forceInsert && !replaceId && !updateId && !candidatExistant && analyse.telephone) {
    // Normaliser le téléphone des deux côtés — ilike('%digits%') échoue sur "+41 77 423 99 95" (espaces)
    const telNormalise = analyse.telephone.replace(/\D/g, '')
    if (telNormalise.length >= 8) {
      const tel9 = telNormalise.slice(-9)
      const prenomFilter = analyse.prenom ? analyse.prenom.split(/\s+/)[0] : null
      let telQuery = adminClient.from('candidats').select('id, prenom, nom, email, titre_poste, created_at, telephone').not('telephone', 'is', null)
      if (prenomFilter) telQuery = telQuery.ilike('prenom', `%${prenomFilter}%`)
      const { data: telCandidats } = await telQuery.limit(150)
      if (telCandidats) {
        const telMatch = telCandidats.find((c: any) => {
          const stored = (c.telephone || '').replace(/\D/g, '')
          return stored.length >= 8 && stored.slice(-9) === tel9
        })
        if (telMatch) candidatExistant = telMatch
      }
    }
  }
  if (!forceInsert && !replaceId && !updateId && !candidatExistant && analyse.nom && analyse.prenom) {
    // Essai 1 : match exact nom + prénom
    const { data: byName } = await adminClient
      .from('candidats').select('id, prenom, nom, email, titre_poste, created_at')
      .ilike('nom', analyse.nom).ilike('prenom', analyse.prenom).maybeSingle()
    candidatExistant = byName

    // Essai 2 : match flexible — le nom parsé contient le nom en base ou vice versa
    // Utile pour les certificats où le nom est "FERREIRA GONÇALVES" mais en base c'est "Gonçalves"
    // IMPORTANT : ce match partiel demande TOUJOURS confirmation à l'utilisateur (même 1 seul résultat)
    // car il peut faire des faux positifs (ex: 2 personnes différentes nommées "José Gonçalves")
    if (!candidatExistant) {
      const lastNamePart = analyse.nom.split(/\s+/).pop() || analyse.nom
      if (lastNamePart.length >= 3) {
        const { data: byPartialName } = await adminClient
          .from('candidats').select('id, prenom, nom, email, telephone, titre_poste, created_at')
          .ilike('nom', `%${lastNamePart}%`)
          .limit(20)
        if (byPartialName && byPartialName.length > 0) {
          const firstPrenom = analyse.prenom.split(/\s+/)[0].toLowerCase()
          const matches = byPartialName.filter((c: any) => {
            const cPrenom = (c.prenom || '').toLowerCase()
            return cPrenom.includes(firstPrenom) || firstPrenom.includes(cPrenom.split(/\s+/)[0])
          })
          if (matches.length >= 1) {
            // Match partiel (1 ou plusieurs) → toujours demander confirmation à l'utilisateur
            // On ne confirme JAMAIS automatiquement un match partiel de nom
            console.log(`[CV Parse] Match(es) partiel(s) de nom: ${matches.map((m: any) => `${m.prenom} ${m.nom}`).join(', ')} — confirmation requise`)
            return NextResponse.json({
              isDuplicate: true,
              multipleMatches: true,
              candidatsMatches: matches,
              analyse,
              cv_url: cvUrl,
              message: matches.length === 1
                ? `Un candidat similaire trouvé pour "${analyse.prenom} ${analyse.nom}" — est-ce la même personne ?`
                : `Plusieurs candidats trouvés pour "${analyse.prenom} ${analyse.nom}" — choisissez le bon`,
            })
          }
        }
      }
    }
  }
  // Classification document
  const isNotCV = analyse.document_type && analyse.document_type !== 'cv'

  // 8c. Doublon trouvé
  if (candidatExistant) {
    console.log(`[CV Parse] Doublon : ${candidatExistant.prenom} ${candidatExistant.nom}`)

    // Pour les documents non-CV, auto-ajouter au candidat existant (pas demander)
    if (isNotCV && cvUrl) {
      const mappedType = mapDocumentType(analyse.document_type)
      const { data: existDoc } = await adminClient.from('candidats').select('documents').eq('id', candidatExistant.id).single()
      const docs = (existDoc?.documents as any[]) || []
      // Vérifier si ce fichier exact existe déjà (par URL ou nom de fichier)
      const alreadyExists = docs.some((d: any) => d.url === cvUrl || d.name === file.name)
      if (!alreadyExists) {
        docs.push({ name: file.name, url: cvUrl, type: mappedType, uploaded_at: new Date().toISOString() })
      } else {
        console.log(`[CV Parse] Document déjà présent: ${file.name}, skip`)
      }
      const docDateToUse = fileDate || new Date().toISOString()
      await adminClient.from('candidats').update({ documents: docs, created_at: docDateToUse, updated_at: new Date().toISOString() }).eq('id', candidatExistant.id)
      console.log(`[CV Parse] Document ${analyse.document_type} ajouté à ${candidatExistant.prenom} ${candidatExistant.nom}`)
      await logActivity({ action: 'cv_importe', details: { fichier: file.name, dossier: categorie || '—', candidat: `${candidatExistant.prenom} ${candidatExistant.nom}`, type: 'document_ajouté' } })
      return NextResponse.json({
        isDuplicate: true,
        candidatExistant,
        analyse,
        updated: true,
        candidat: candidatExistant,
        message: `Document ajouté à ${candidatExistant.prenom} ${candidatExistant.nom}`,
      })
    }

    // ── Smart update : comparer ancien vs nouveau CV ──
    // Récupérer les données complètes du candidat existant
    const { data: existingFull } = await adminClient.from('candidats')
      .select('id, titre_poste, competences, langues, experiences, formations_details, formation, resume_ia, permis_conduire, linkedin, cv_url, cv_nom_fichier, documents')
      .eq('id', candidatExistant.id).single()

    // Vérifier si le CV a du nouveau contenu
    const hasNewContent = (() => {
      if (!existingFull) return true
      const oldExpCount = (existingFull.experiences || []).length
      const newExpCount = (analyse.experiences || []).length
      if (newExpCount > oldExpCount) return true
      if (analyse.titre_poste && existingFull.titre_poste &&
        analyse.titre_poste.toLowerCase() !== existingFull.titre_poste.toLowerCase()) return true
      const oldComp = new Set((existingFull.competences || []).map((s: string) => s.toLowerCase()))
      const newComp = (analyse.competences || []).filter((s: string) => !oldComp.has(s.toLowerCase()))
      if (newComp.length >= 3) return true
      const oldFormCount = (existingFull.formations_details || []).length
      const newFormCount = (analyse.formations_details || []).length
      if (newFormCount > oldFormCount) return true
      return false
    })()

    // Date d'ajout : lastModified du fichier > date dans le nom > maintenant
    const filenameDate = extractDateFromFilename(file.name)
    const resolvedCreatedAt = fileDate || filenameDate || new Date().toISOString()

    if (hasNewContent && existingFull) {
      // CV mis à jour — mettre à jour la fiche + archiver l'ancien CV
      const existingDocs = (existingFull.documents as any[]) || []
      if (existingFull.cv_url && !existingDocs.some((d: any) => d.url === existingFull.cv_url)) {
        const oldName = existingFull.cv_nom_fichier || 'Ancien CV'
        existingDocs.push({
          name: `[Ancien] ${oldName}`,
          url: existingFull.cv_url,
          type: 'cv',
          uploaded_at: new Date().toISOString(),
        })
      }

      await adminClient.from('candidats').update({
        titre_poste: analyse.titre_poste || existingFull.titre_poste,
        competences: analyse.competences || existingFull.competences,
        langues: analyse.langues || existingFull.langues,
        experiences: analyse.experiences || existingFull.experiences,
        formations_details: analyse.formations_details || existingFull.formations_details,
        formation: analyse.formation || existingFull.formation,
        resume_ia: analyse.resume || existingFull.resume_ia,
        permis_conduire: analyse.permis_conduire ?? existingFull.permis_conduire,
        linkedin: analyse.linkedin || existingFull.linkedin,
        cv_url: cvUrl || existingFull.cv_url,
        cv_nom_fichier: file.name,
        documents: existingDocs,
        created_at: resolvedCreatedAt,
        updated_at: new Date().toISOString(),
      } as any).eq('id', candidatExistant.id)

      console.log(`[CV Parse] CV mis à jour : ${candidatExistant.prenom} ${candidatExistant.nom}`)
      await logActivity({ action: 'cv_actualise', details: { fichier: file.name, candidat: `${candidatExistant.prenom} ${candidatExistant.nom}`, raison: 'cv_mis_a_jour' } })
      return NextResponse.json({
        isDuplicate: true,
        updated: true,
        cvUpdated: true,
        candidatExistant,
        candidat: candidatExistant,
        analyse,
        message: `CV mis à jour : ${candidatExistant.prenom} ${candidatExistant.nom}`,
      })
    } else {
      // Même CV — mettre à jour la date d'ajout
      await adminClient.from('candidats').update({
        created_at: resolvedCreatedAt,
        updated_at: new Date().toISOString(),
      } as any).eq('id', candidatExistant.id)
      console.log(`[CV Parse] Même CV, date mise à jour : ${candidatExistant.prenom} ${candidatExistant.nom}`)
      return NextResponse.json({
        isDuplicate: true,
        sameFile: true,
        candidatExistant,
        candidat: candidatExistant,
        analyse,
        message: `Déjà importé : ${candidatExistant.prenom} ${candidatExistant.nom}`,
      })
    }
  }

  // 8d. Document non-CV sans candidat existant → ne PAS créer de nouveau candidat
  if (isNotCV) {
    console.log(`[CV Parse] Document ${analyse.document_type} sans candidat existant — ignoré`)
    return NextResponse.json({
      error: `Document classifié comme "${analyse.document_type}" mais aucun candidat correspondant trouvé. Importez d'abord le CV du candidat.`,
      document_type: analyse.document_type,
    }, { status: 422 })
  }

  // 9. Créer le candidat en base (CV uniquement)
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
    cv_nom_fichier: file.name, // On garde le nom du fichier source pour la détection doublon
    photo_url: photoUrl,
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
    import_status: 'a_traiter',
  }

  // Genre (pas dans le type mais dans la table)
  ;(nouveauCandidat as any).genre = normaliserGenre((analyse as any).genre)

  // Date d'ajout : lastModified > date dans le nom de fichier > maintenant
  const insertDate = fileDate || extractDateFromFilename(file.name)
  if (insertDate) {
    ;(nouveauCandidat as any).created_at = insertDate
    console.log(`[CV Parse] created_at défini sur INSERT : ${file.name} → ${insertDate}`)
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

  // 9b. Post-insert duplicate check (race condition protection)
  if (candidat && !forceInsert && !replaceId) {
    let duplicateOf: any = null

    if (candidat.email) {
      const { data: dupes } = await adminClient
        .from('candidats')
        .select('id, created_at')
        .eq('email', candidat.email)
        .order('created_at', { ascending: true })
        .limit(2)
      if (dupes && dupes.length > 1 && dupes[0].id !== candidat.id) {
        duplicateOf = dupes[0]
      }
    }

    if (!duplicateOf && candidat.nom && candidat.prenom) {
      const { data: dupes } = await adminClient
        .from('candidats')
        .select('id, created_at')
        .ilike('nom', candidat.nom)
        .ilike('prenom', candidat.prenom || '')
        .order('created_at', { ascending: true })
        .limit(2)
      if (dupes && dupes.length > 1 && dupes[0].id !== candidat.id) {
        duplicateOf = dupes[0]
      }
    }

    if (duplicateOf) {
      // This candidate was inserted as a duplicate due to race condition — delete it
      console.log(`[CV Parse] Race condition doublon détecté — suppression ${candidat.id}`)
      await adminClient.from('candidats').delete().eq('id', candidat.id)
      await logActivity({ action: 'cv_doublon', details: { fichier: file.name, dossier: categorie || '—', candidat: `${analyse.prenom || ''} ${analyse.nom}`.trim(), raison: 'race_condition' } })
      return NextResponse.json({
        isDuplicate: true,
        candidatExistant: duplicateOf,
        analyse,
        message: `Doublon : ${analyse.prenom} ${analyse.nom} existe déjà`,
      })
    }
  }

  // 9c. Fallback : si l'INSERT n'a pas pris le created_at, forcer via UPDATE
  if (candidat && insertDate) {
    const dbCreatedAt = (candidat as any).created_at
    // Vérifier si l'INSERT a bien appliqué la date (compare juste la date, pas l'heure)
    if (!dbCreatedAt || !dbCreatedAt.startsWith(insertDate.slice(0, 10))) {
      console.log(`[CV Parse] INSERT n'a pas pris created_at (got ${dbCreatedAt}), fallback UPDATE...`)
      const { data: upData, error: upErr } = await adminClient
        .from('candidats')
        .update({ created_at: insertDate } as any)
        .eq('id', candidat.id)
        .select('id, created_at')
        .single()
      if (upErr) {
        console.error(`[CV Parse] ERREUR fallback update created_at : ${upErr.message}`)
      } else {
        ;(candidat as any).created_at = (upData as any)?.created_at ?? insertDate
        console.log(`[CV Parse] Fallback OK : ${file.name} → ${(candidat as any).created_at}`)
      }
    } else {
      console.log(`[CV Parse] Date fichier appliquée via INSERT : ${file.name} → ${dbCreatedAt}`)
    }
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

  // 11. Attacher les autres documents issus du split multi-type
  if (candidat && autresDocumentsMultiType.length > 0) {
    try {
      const docsAjoutes: import('@/types/database').CandidatDocument[] = []
      for (const autreDoc of autresDocumentsMultiType) {
        try {
          const docTimestamp = Date.now()
          const docStorageName = `${docTimestamp}_${autreDoc.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`
          const { data: docStorageData } = await adminClient.storage.from('cvs').upload(docStorageName, autreDoc.buffer, {
            contentType: 'application/pdf',
            upsert: false,
          })
          let docUrl: string | null = null
          if (docStorageData?.path) {
            const { data: docUrlData } = await adminClient.storage.from('cvs').createSignedUrl(docStorageData.path, 60 * 60 * 24 * 365 * 10)
            docUrl = docUrlData?.signedUrl || null
          }
          if (docUrl) {
            const mappedDocType = mapDocumentType(autreDoc.type)
            docsAjoutes.push({ name: autreDoc.filename, url: docUrl, type: mappedDocType, uploaded_at: new Date().toISOString() })
            console.log(`[Multi-Doc] Document ${autreDoc.type} uploadé : ${autreDoc.filename}`)
          }
        } catch (docErr) {
          console.warn(`[Multi-Doc] Erreur upload document ${autreDoc.type}:`, (docErr as Error).message)
        }
      }
      if (docsAjoutes.length > 0) {
        await adminClient.from('candidats').update({ documents: docsAjoutes, updated_at: new Date().toISOString() }).eq('id', candidat.id)
        console.log(`[Multi-Doc] ${docsAjoutes.length} document(s) attaché(s) au candidat ${candidat.id}`)
      }
    } catch (attachErr) {
      console.warn('[Multi-Doc] Erreur attachement documents (non bloquant):', (attachErr as Error).message)
    }
  }

  console.log(`[CV Parse] Succès ! Candidat : ${candidat?.id}`)
  await logActivity({ action: 'cv_importe', details: { fichier: file.name, dossier: categorie || '—', candidat: `${analyse.prenom || ''} ${analyse.nom}`.trim(), email: analyse.email || '—' } })

  // Log activité équipe — première entrée dans l'historique du candidat
  try {
    const routeUser = await getRouteUser()
    const candidatNom = `${analyse.prenom || ''} ${analyse.nom}`.trim()
    const now = new Date()
    const dateStr = now.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const timeStr = now.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h')
    await logActivityServer({
      ...routeUser,
      type: 'candidat_importe',
      titre: `Candidat importé le ${dateStr} à ${timeStr}`,
      description: `${candidatNom} — ${analyse.titre_poste || 'Sans poste'} — importé depuis upload`,
      candidat_id: candidat?.id,
      candidat_nom: candidatNom,
      metadata: {
        source: 'import_cv',
        import_status: 'a_traiter',
        fichier: file.name,
        titre_poste: analyse.titre_poste || null,
        email: analyse.email || null,
      },
    })
  } catch {}

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
