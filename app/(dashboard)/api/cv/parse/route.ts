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
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'        // pdf-parse nécessite Node.js runtime (pas Edge)
export const maxDuration = 300         // 300s max (Vercel Pro)
export const preferredRegion = 'dub1'  // Dublin — aligné avec Supabase eu-west-1 (Ireland)

const dbg = (...args: Parameters<typeof console.log>) => { if (process.env.DEBUG_MODE === 'true') console.log(...args) }

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
    'reference': 'reference',
    'contrat': 'contrat',
    'bulletin_salaire': 'bulletin_salaire',
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
  function toISO(d: number, m: number, y: number): string | null {
    if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1950 || y > 2099) return null
    if (d > new Date(y, m, 0).getDate()) return null
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T12:00:00.000Z`
  }
  // DD.MM.YYYY
  let match = filename.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (match) return toISO(parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10))
  // DD/MM/YYYY
  match = filename.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (match) return toISO(parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10))
  // YYYY-MM-DD
  match = filename.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (match) return toISO(parseInt(match[3], 10), parseInt(match[2], 10), parseInt(match[1], 10))
  return null
}

// ─── Rate limiter (in-memory, 10 req/min par IP) ─────────────────────────────
const rateLimitMap = new Map<string, { count: number; windowStart: number }>()
const RATE_LIMIT = 10
const RATE_WINDOW_MS = 60_000

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

export async function POST(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Trop de requêtes — réessayez dans une minute' }, { status: 429 })
  }

  // Enveloppe globale : répond toujours en < 55s même si pdf-parse ou Claude bloque
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Timeout global 55s — réessayez')), 55_000)
  )

  try {
    return await Promise.race([handlePOST(request), timeout])
  } catch (error) {
    console.error('[CV Parse] Erreur ou timeout:', error)
    return NextResponse.json({ error: 'Erreur serveur inattendue' }, { status: 500 })
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
  let cvRotationHint = 0 // rotation appliquée dans le viewer (0/90/180/270) — à appliquer au PDF

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
    cvRotationHint   = typeof body.cv_rotation === 'number' ? body.cv_rotation : 0
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

  dbg(`[CV Parse] Début : ${file.name} (${(file.size / 1024).toFixed(0)} KB)`)

  // 3b. Vérification rapide : fichier déjà importé ? (par nom de fichier)
  //     Évite de consommer l'API Claude pour des CVs déjà en base
  //     Note : on utilise file.name ici (avant split) pour détecter le doublon du fichier source
  if (!forceInsert && !replaceId && !updateId) {
    let existingByFile = null
    const { data: exactMatch } = await supabase
      .from('candidats')
      .select('id, prenom, nom, email, titre_poste, created_at')
      .eq('cv_nom_fichier', file.name)
      .maybeSingle()
    existingByFile = exactMatch

    // Fix v1.8.28 — fallback : file.name vient du storage path (timestamp + underscores)
    // Convertir "1776xxx_BENCHAAR_salim_20.10.2025.pdf" → "BENCHAAR salim 20.10.2025.pdf"
    if (!existingByFile) {
      const cleanName = file.name.replace(/^\d+_/, '').replace(/_/g, ' ')
      if (cleanName !== file.name) {
        const { data: fuzzy } = await supabase
          .from('candidats')
          .select('id, prenom, nom, email, titre_poste, created_at')
          .eq('cv_nom_fichier', cleanName)
          .maybeSingle()
        existingByFile = fuzzy
      }
    }

    if (existingByFile) {
      const dateToUse = fileDate || new Date().toISOString()
      // Bug 1 fix — comparer la date : si même date (±1 min) → SKIP complet (0 write)
      const existingDate = existingByFile.created_at ? new Date(existingByFile.created_at).getTime() : 0
      const importDate = new Date(dateToUse).getTime()
      const memeDate = Math.abs(existingDate - importDate) <= 60_000

      if (memeDate) {
        // SKIP COMPLET — même fichier, même date → aucune écriture DB
        dbg(`[CV Parse] Skip complet (même fichier + même date) : ${file.name}`)
        await logActivity({ action: 'cv_doublon', details: { fichier: file.name, dossier: categorie || '—', candidat: `${existingByFile.prenom || ''} ${existingByFile.nom}`.trim(), raison: 'skip_meme_fichier' } })
        return NextResponse.json({
          isDuplicate: true,
          sameFile: true,
          skipped: true,
          candidatExistant: existingByFile,
          analyse: { prenom: existingByFile.prenom, nom: existingByFile.nom, email: existingByFile.email, titre_poste: existingByFile.titre_poste },
          message: `Déjà importé : ${existingByFile.prenom || ''} ${existingByFile.nom}`.trim(),
        })
      }

      // Bug 2 fix — ne jamais écraser created_at par une date plus ancienne
      const importedIsNewer = importDate > existingDate
      dbg(`[CV Parse] Fichier déjà importé : ${file.name} → ${importedIsNewer ? 'mise à jour date' : 'date conservée'}`)
      await supabase.from('candidats').update({
        ...(importedIsNewer ? { created_at: dateToUse } : {}),
        updated_at: new Date().toISOString(),
        has_update: true,
      } as any).eq('id', existingByFile.id)
      // Supprimer de candidats_vus pour faire réapparaître le badge
      try { await (supabase as any).from('candidats_vus').delete().eq('candidat_id', existingByFile.id) } catch {}
      await logActivity({ action: 'cv_doublon', details: { fichier: file.name, dossier: categorie || '—', candidat: `${existingByFile.prenom || ''} ${existingByFile.nom}`.trim(), raison: 'fichier_existant_date_differente' } })
      return NextResponse.json({
        isDuplicate: true,
        sameFile: true,
        reactivated: true,
        candidatExistant: existingByFile,
        analyse: { prenom: existingByFile.prenom, nom: existingByFile.nom, email: existingByFile.email, titre_poste: existingByFile.titre_poste },
        message: `Déjà importé : ${existingByFile.prenom || ''} ${existingByFile.nom}`.trim(),
      })
    }
  }

  // 4. Convertir en Buffer
  const arrayBuffer = await file.arrayBuffer()
  let buffer: Buffer = Buffer.from(arrayBuffer)

  // 4c. Appliquer la rotation du viewer si fournie (cv_rotation) — pour les PDFs physiquement tournés
  // Le viewer stocke la rotation en localStorage (cosmétique uniquement). Ici on l'inscrit dans les
  // métadonnées du PDF pour que limitPDFPages (claude.ts) la corrige avant envoi à Claude.
  const isPDF0pre = (file.name.toLowerCase().split('.').pop() || '') === 'pdf' || file.type === 'application/pdf'
  if (cvRotationHint !== 0 && isPDF0pre) {
    try {
      const { PDFDocument, degrees } = await import('pdf-lib')
      const srcDoc = await PDFDocument.load(buffer, { ignoreEncryption: true })
      for (let i = 0; i < srcDoc.getPageCount(); i++) {
        const page = srcDoc.getPage(i)
        const existing = page.getRotation().angle
        const total = (existing + cvRotationHint) % 360
        page.setRotation(degrees(total))
      }
      buffer = Buffer.from(await srcDoc.save())
      dbg(`[CV Parse] Rotation viewer ${cvRotationHint}° inscrite dans les métadonnées PDF`)
    } catch (rotErr) {
      console.warn('[CV Parse] Impossible d\'appliquer la rotation viewer:', (rotErr as Error).message)
    }
  }

  // 4b. Détection multi-documents (PDFs uniquement, > 100 KB pour éviter les PDFs vides)
  const ext0    = file.name.toLowerCase().split('.').pop() || ''
  const isPDF0  = ext0 === 'pdf' || file.type === 'application/pdf'
  let autresDocumentsMultiType: Awaited<ReturnType<typeof analyserDocumentMultiType>>['autresDocuments'] = []
  let filenameEffectif = file.name

  if (isPDF0 && file.size > 100 * 1024) {
    try {
      const multiDocResult = await analyserDocumentMultiType(buffer, file.name)
      if (multiDocResult.estMultiDocument) {
        dbg(`[Multi-Doc] PDF multi-type détecté dans ${file.name} → ${multiDocResult.autresDocuments.length} document(s) séparé(s)`)
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
  dbg('[CV Parse] Extraction texte...')
  let texteCV = ''
  try {
    texteCV = await withTimeout(extractTextFromCV(buffer, filenameEffectif, file.type), 10_000, 'extraction texte')
  } catch (err: any) {
    if (err?.message === 'PDF_ENCRYPTED') {
      return NextResponse.json({ error: 'Ce PDF est protégé par mot de passe. Ouvrez-le, enregistrez-le sans protection, puis réimportez-le.' }, { status: 422 })
    }
    // timeout ou autre erreur → traiter comme PDF scanné
  }

  const ext      = filenameEffectif.toLowerCase().split('.').pop() || ''
  const isPDF    = ext === 'pdf' || file.type === 'application/pdf'
  const isDoc    = ext === 'doc' || file.type === 'application/msword'
  const isImage  = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) || file.type.startsWith('image/')
  const isScanned = !texteCV || texteCV.trim().length < 50

  // 6. Analyse Claude — timeout 45s
  dbg('[CV Parse] Analyse Claude IA...')
  let analyse

  try {
    if (isImage) {
      dbg(`[CV Parse] Image (${ext}) → vision Claude...`)
      const mimeType = (file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`) as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
      analyse = await withTimeout(analyserCVDepuisImage(buffer, mimeType), 50_000, 'analyse image')
    } else if (isScanned && isPDF) {
      dbg('[CV Parse] PDF scanné détecté → envoi direct à Claude...')
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
      dbg(`[CV Parse] Texte : ${texteCV.length} chars`)
      analyse = await withTimeout(analyserCV(texteCV), 50_000, 'analyse texte')
    }
  } catch (analyseErr: any) {
    const errMsg = analyseErr?.message || 'Erreur analyse IA'
    console.error('[CV Parse] Erreur analyse Claude:', errMsg)
    await logActivity({ action: 'cv_erreur', details: { fichier: file.name, dossier: categorie || '—', erreur: errMsg } })
    throw analyseErr
  }

  dbg(`[CV Parse] Analyse OK : ${analyse.nom} ${analyse.prenom}`)

  // 6a-pre. Détection diplôme/certificat : si le fichier a un nom mais aucun contenu CV typique
  // (pas d'expériences, pas de compétences, pas de contact, pas de titre)
  // → c'est probablement un diplôme ou certificat, pas un CV → on refuse l'import
  // SAUF si l'IA a déjà classifié comme non-CV → laisser le flux non-CV gérer (auto-attach à un candidat existant)
  if (!updateId && !replaceId && !mode) {
    const isAlreadyNonCV = analyse.document_type && analyse.document_type !== 'cv'
    if (!isAlreadyNonCV) {
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
    } else {
      dbg(`[CV Parse] IA a classifié comme "${analyse.document_type}" → skip détection diplôme, flux non-CV prendra le relais`)
    }
  }

  // 6a. Fallback : si l'analyse retourne un résultat quasi-vide OU un document non-CV sur un import frais,
  // le CV est peut-être à l'envers → essayer avec le PDF retourné à 180°
  if (isPDF && analyse) {
    const hasName = analyse.nom && analyse.nom !== 'Candidat' && analyse.nom.length > 1
    const hasAnyInfo = analyse.email || analyse.telephone || (analyse.competences && analyse.competences.length > 0)
    // Déclencher aussi si Claude classifie comme non-CV sur un import frais MAIS seulement si l'analyse est vide
    // (pas de nom → probablement un PDF à l'envers). Si l'IA a trouvé un nom ET classifié comme non-CV,
    // c'est un vrai certificat/diplôme → pas besoin de rotation (évite un 2ème appel vision + timeout 55s)
    const isNonCV = analyse.document_type && analyse.document_type !== 'cv'
    const isFreshImport = !updateId && !replaceId && mode !== 'reanalyse'
    const shouldTry180 = (!hasName && !hasAnyInfo) || (isNonCV && isFreshImport && !hasName)
    if (shouldTry180) {
      dbg(`[CV Parse] ${isNonCV ? `Classifié non-CV (${analyse.document_type}) sur import frais` : 'Analyse quasi-vide'} → tentative avec PDF retourné à 180°...`)
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
        const retryIsCV = !retryAnalyse.document_type || retryAnalyse.document_type === 'cv'
        if ((retryHasName || retryHasInfo) && retryIsCV) {
          dbg(`[CV Parse] Fallback 180° réussi : ${retryAnalyse.nom} ${retryAnalyse.prenom}`)
          analyse = retryAnalyse
        } else if (retryHasName || retryHasInfo) {
          dbg(`[CV Parse] Fallback 180° retourne infos mais type=${retryAnalyse.document_type}`)
          analyse = retryAnalyse // On prend quand même le résultat amélioré
        } else {
          dbg('[CV Parse] Fallback 180° aussi quasi-vide')
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
    dbg('[CV Parse] Nom "Candidat" avec infos → fallback Claude Vision pour trouver le nom...')
    try {
      const visionResult = await withTimeout(analyserCVDepuisPDF(buffer), 50_000, 'vision nom fallback')
      if (visionResult.nom && visionResult.nom !== 'Candidat' && visionResult.nom.length > 1) {
        dbg(`[CV Parse] Vision a trouvé le nom : ${visionResult.prenom} ${visionResult.nom}`)
        analyse.nom = visionResult.nom
        analyse.prenom = visionResult.prenom || analyse.prenom
        // Aussi récupérer email/tel si manquants
        if (!analyse.email && visionResult.email) analyse.email = visionResult.email
        if (!analyse.telephone && visionResult.telephone) analyse.telephone = visionResult.telephone
      } else {
        dbg('[CV Parse] Vision n\'a pas trouvé le nom non plus')
      }
    } catch (visionErr) {
      console.warn('[CV Parse] Fallback Vision échoué:', (visionErr as Error).message)
    }
  }

  // 6a-ter. Second avis : si l'IA dit "cv", vérifier via filename + patterns contenu stricts
  // Rattrape les scans avec nom générique ("Scanné 6 janv...") où l'IA rate le type.
  let docType: string = analyse?.document_type || 'cv'
  if (docType === 'cv') {
    const detectDocCategoryParse = (fn: string, txt: string): string | null => {
      const check = (source: string) => {
        const s = source.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        if (/certificat|certificate|attestation|\bct\b/.test(s)) return 'certificat'
        if (/lettre|motivation|\blm\b/.test(s)) return 'lettre_motivation'
        if (/diplome|diplome|cfc|afp|formation|brevet/.test(s)) return 'diplome'
        if (/permis|licence/.test(s)) return 'permis'
        if (/reference|recommandation/.test(s)) return 'reference'
        if (/contrat|avenant/.test(s)) return 'contrat'
        if (/bulletin|salaire|fiche de paie/.test(s)) return 'bulletin_salaire'
        return null
      }
      return check(fn.replace(/\.[^.]+$/, '')) ?? check(txt.slice(0, 200)) ?? null
    }
    const filenameType = detectDocCategoryParse(file.name, '')
    if (filenameType) {
      docType = filenameType
      ;(analyse as any).document_type = filenameType
      dbg(`[CV Parse] Second avis filename → ${filenameType}`)
    } else {
      // Check contenu strict — uniquement des formulations de TITRE de document
      const contentLower = texteCV.slice(0, 500).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      const strictContentType =
        /certificat de travail|certificat d'emploi|arbeitszeugnis/.test(contentLower) ? 'certificat' :
        /lettre de motivation|bewerbungsschreiben/.test(contentLower) ? 'lettre_motivation' :
        /bulletin de salaire|fiche de paie|lohnabrechnung/.test(contentLower) ? 'bulletin_salaire' :
        /permis de travail|permis de sejour|autorisation de travail|aufenthaltsbewilligung/.test(contentLower) ? 'permis' :
        /lettre de recommandation|lettre de reference|referenzschreiben/.test(contentLower) ? 'reference' :
        /contrat de travail|avenant au contrat|arbeitsvertrag/.test(contentLower) ? 'contrat' :
        null
      if (strictContentType) {
        docType = strictContentType
        ;(analyse as any).document_type = strictContentType
        dbg(`[CV Parse] Second avis contenu → ${strictContentType}`)
      }
    }
  }
  dbg(`[CV Parse] Document type: ${docType}, isPDF: ${isPDF}, file.type: ${file.type}, ext: ${ext}`)

  // 6b. Extraction photo candidat (PDFs CV uniquement — pas pour attestations/certificats)
  let photoUrl: string | null = null
  if (isPDF && analyse && docType === 'cv') {
    try {
      const { extractPhotoFromPDF } = await import('@/lib/cv-photo')
      dbg('[CV Parse] Extraction photo en cours...')
      const photoBuffer = await extractPhotoFromPDF(buffer)
      dbg(`[CV Parse] Photo buffer: ${photoBuffer ? `${photoBuffer.length} bytes` : 'null'}`)
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
          if (photoUrl) dbg('[CV Parse] Photo extraite et stockée')
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
      dbg('[CV Parse] Extraction photo DOCX en cours...')
      const photoBuffer = await extractPhotoFromDOCX(buffer)
      dbg(`[CV Parse] Photo DOCX buffer: ${photoBuffer ? `${photoBuffer.length} bytes` : 'null'}`)
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
          if (photoUrl) dbg('[CV Parse] Photo DOCX extraite et stockée')
        }
      }
    } catch (photoErr) {
      console.warn('[CV Parse] DOCX photo extraction skipped:', (photoErr as Error).message)
    }
  }

  // 6d. Extraction photo DOC (Word 97-2003) — si c'est un CV et pas encore de photo
  if (isDoc && !photoUrl && analyse && docType === 'cv') {
    try {
      const { extractPhotoFromDOC } = await import('@/lib/cv-photo')
      dbg('[CV Parse] Extraction photo DOC en cours...')
      const photoBuffer = await extractPhotoFromDOC(buffer)
      dbg(`[CV Parse] Photo DOC buffer: ${photoBuffer ? `${photoBuffer.length} bytes` : 'null'}`)
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
          if (photoUrl) dbg('[CV Parse] Photo DOC extraite et stockée')
        }
      }
    } catch (photoErr) {
      console.warn('[CV Parse] DOC photo extraction skipped:', (photoErr as Error).message)
    }
  }

  // 7_pre. Détection doublons AVANT upload Storage — évite gaspillage pour doublons "même CV"
  const adminClient = createAdminClient()

  const filenameDate = extractDateFromFilename(file.name)
  const resolvedCreatedAt = fileDate || filenameDate || new Date().toISOString()
  const isNotCV = docType !== 'cv'

  let candidatExistant: any = null
  let existingFullPre: any = null

  const nomsSimilaires = (a: any, e: any): boolean => {
    if (!a.nom || !e.nom) return true
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
    const pNom = norm(a.nom), eNom = norm(e.nom)
    const nomOk = pNom.includes(eNom) || eNom.includes(pNom) ||
      pNom.split(/\s+/).some((p: string) => p.length >= 3 && eNom.split(/\s+/).some((ex: string) => ex.includes(p) || p.includes(ex)))
    if (nomOk) return true
    const pPrenom = norm(a.prenom || ''), ePrenom = norm(e.prenom || '')
    return !!pPrenom && !!ePrenom && pPrenom.slice(0, 3) === ePrenom.slice(0, 3)
  }

  if (!forceInsert && !replaceId && !updateId) {
    // — Email —
    if (analyse.email) {
      const { data: byEmail } = await adminClient
        .from('candidats').select('id, prenom, nom, email, titre_poste, created_at')
        .eq('email', analyse.email).maybeSingle()
      if (byEmail) {
        if (!nomsSimilaires(analyse, byEmail)) {
          return NextResponse.json({ isDuplicate: true, multipleMatches: true, candidatsMatches: [byEmail], analyse, cv_url: null, message: `L'email est déjà utilisé par ${byEmail.prenom} ${byEmail.nom} — est-ce la même personne ?` })
        }
        candidatExistant = byEmail
      }
    }
    // — Téléphone —
    if (!candidatExistant && analyse.telephone) {
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
          if (telMatch) {
            if (!nomsSimilaires(analyse, telMatch)) {
              return NextResponse.json({ isDuplicate: true, multipleMatches: true, candidatsMatches: [telMatch], analyse, cv_url: null, message: `Le téléphone est déjà utilisé par ${telMatch.prenom} ${telMatch.nom} — est-ce la même personne ?` })
            }
            candidatExistant = telMatch
          }
        }
      }
    }
    // — Nom + prénom —
    if (!candidatExistant && analyse.nom && analyse.prenom) {
      const { data: byName } = await adminClient
        .from('candidats').select('id, prenom, nom, email, titre_poste, created_at')
        .ilike('nom', analyse.nom).ilike('prenom', analyse.prenom).maybeSingle()
      candidatExistant = byName

      if (!candidatExistant) {
        const nomParts = analyse.nom.split(/\s+/).filter((w: string) => w.length >= 3)
        let byPartialName: any[] | null = null
        if (nomParts.length === 1) {
          const { data } = await adminClient.from('candidats').select('id, prenom, nom, email, telephone, titre_poste, created_at').ilike('nom', `%${nomParts[0]}%`).limit(20)
          byPartialName = data
        } else if (nomParts.length > 1) {
          const orClauses = nomParts.map((p: string) => `nom.ilike.%${p}%`).join(',')
          const { data } = await adminClient.from('candidats').select('id, prenom, nom, email, telephone, titre_poste, created_at').or(orClauses).limit(20)
          byPartialName = data
        }
        if (byPartialName && byPartialName.length > 0) {
          const prenomWords = analyse.prenom.split(/\s+/).map((w: string) => w.toLowerCase()).filter((w: string) => w.length >= 2)
          const matches = byPartialName.filter((c: any) => {
            const cPrenom = (c.prenom || '').toLowerCase()
            const cPrenomFirst = cPrenom.split(/\s+/)[0]
            return prenomWords.some((pw: string) => cPrenom.includes(pw) || pw.includes(cPrenomFirst))
          })
          if (matches.length >= 1) {
            if (isNotCV && matches.length === 1) {
              dbg(`[CV Parse] Non-CV "${analyse.document_type}" — match unique: ${matches[0].prenom} ${matches[0].nom} → auto-attach`)
              candidatExistant = matches[0]
            } else {
              dbg(`[CV Parse] Match(es) partiel(s): ${matches.map((m: any) => `${m.prenom} ${m.nom}`).join(', ')} — confirmation requise`)
              return NextResponse.json({ isDuplicate: true, multipleMatches: true, candidatsMatches: matches, analyse, cv_url: null, message: matches.length === 1 ? `Un candidat similaire trouvé pour "${analyse.prenom} ${analyse.nom}" — est-ce la même personne ?` : `Plusieurs candidats trouvés pour "${analyse.prenom} ${analyse.nom}" — choisissez le bon` })
            }
          }
        }
      }
    }

    // — Si doublon CV : décider si upload nécessaire —
    if (candidatExistant && !isNotCV) {
      const { data: ef } = await adminClient.from('candidats')
        .select('id, titre_poste, competences, langues, experiences, formations_details, formation, resume_ia, permis_conduire, linkedin, cv_url, cv_nom_fichier, documents, created_at, cv_texte_brut')
        .eq('id', candidatExistant.id).single()
      existingFullPre = ef

      // Fix 2 — GARDE PRIMAIRE : comparer le texte OU le nom de fichier de base AVANT hasNewContent
      // Empêche le re-upload quand l'IA extrait des données légèrement différentes du même CV
      // Fix v1.8.28 — normalisation : strip timestamp + espaces/underscores + lowercase
      // Storage encode "BENCHAAR salim.pdf" → "1776xxx_BENCHAAR_salim.pdf" (espaces→underscores)
      const normFn = (n: string) => n.replace(/^\d+_/, '').replace(/[_\s]+/g, '_').toLowerCase()
      const memeNomBase = !!(ef?.cv_nom_fichier &&
        normFn(ef.cv_nom_fichier as string) === normFn(file.name))
      const memeContenu = memeNomBase || !!(ef?.cv_texte_brut && texteCV &&
        (ef.cv_texte_brut as string).slice(0, 500).trim() === texteCV.slice(0, 500).trim())

      // Fix 4 — debug skip (activer localement si besoin, ne pas déployer)
      // console.log('[SKIP DEBUG]', { memeContenu, extrait500Length: texteCV.slice(0,500).trim().length, stocke500Length: (ef?.cv_texte_brut||'').slice(0,500).trim().length, resolvedCreatedAt, ef_created_at: ef?.created_at })

      if (memeContenu) {
        // memeDate : tolérance ±1 minute
        const memeDate = ef ? Math.abs(
          new Date(resolvedCreatedAt).getTime() - new Date(ef.created_at as string).getTime()
        ) <= 60_000 : false

        if (memeDate) {
          // SKIP COMPLET — 0 upload, 0 DB write
          dbg(`[CV Parse] Skip : ${candidatExistant.prenom} ${candidatExistant.nom} (même contenu + même date)`)
          await logActivity({ action: 'cv_doublon', details: { fichier: file.name, candidat: `${candidatExistant.prenom} ${candidatExistant.nom}`, raison: 'skip_meme_contenu' } })
          return NextResponse.json({ isDuplicate: true, sameFile: true, skipped: true, candidatExistant, candidat: candidatExistant, analyse, message: `Déjà importé : ${candidatExistant.prenom} ${candidatExistant.nom}` })
        } else {
          // Même contenu, date différente → update dates + import_status, 0 upload, jamais archiver
          // Fix 5 — ne rétrograder que si la date importée est plus récente
          const importedIsNewer = ef ? new Date(resolvedCreatedAt).getTime() > new Date(ef.created_at as string).getTime() : true
          dbg(`[CV Parse] Même contenu, date différente : ${candidatExistant.prenom} ${candidatExistant.nom} (importedIsNewer=${importedIsNewer})`)
          await adminClient.from('candidats').update({
            ...(importedIsNewer ? { created_at: resolvedCreatedAt } : {}),
            updated_at: new Date().toISOString(),
            has_update: true,
          } as any).eq('id', candidatExistant.id)
          // Fix 3 — supprimer de candidats_vus pour faire réapparaître le badge
          await (adminClient as any).from('candidats_vus').delete().eq('candidat_id', candidatExistant.id)
          await logActivity({ action: 'cv_doublon', details: { fichier: file.name, candidat: `${candidatExistant.prenom} ${candidatExistant.nom}`, raison: 'meme_contenu_date_differente' } })
          return NextResponse.json({ isDuplicate: true, sameFile: true, reactivated: true, candidatExistant, candidat: candidatExistant, analyse, message: `Déjà importé : ${candidatExistant.prenom} ${candidatExistant.nom}` })
        }
      }

      // memeContenu = false → vérifier les données structurées pour décider du type de mise à jour
      const hasNewContent = (() => {
        if (!ef) return true
        if ((analyse.experiences || []).length > (ef.experiences || []).length) return true
        if (analyse.titre_poste && ef.titre_poste && analyse.titre_poste.toLowerCase() !== ef.titre_poste.toLowerCase()) return true
        const oldComp = new Set((ef.competences || []).map((s: string) => s.toLowerCase()))
        if ((analyse.competences || []).filter((s: string) => !oldComp.has(s.toLowerCase())).length >= 3) return true
        if ((analyse.formations_details || []).length > (ef.formations_details || []).length) return true
        return false
      })()

      if (!hasNewContent) {
        dbg(`[CV Parse] Texte différent malgré structure similaire : ${candidatExistant.prenom} ${candidatExistant.nom} → upload`)
      }
      // memeContenu = false → on continue vers l'upload (hasNewContent ou texte légèrement différent)
    }
  }

  // 7. Upload Supabase Storage — timeout 15s
  const timestamp = Date.now()
  const nomFichierStorage = `${timestamp}_${filenameEffectif.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  dbg('[CV Parse] Upload storage...')
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
      dbg(`[CV Parse] Ré-analyse (écrasement) : ${file.name}`)
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
        // Fix v1.8.28 — normalisation espaces/underscores/timestamp pour comparaison noms fichiers
        const normFnUpd = (n: string) => n.replace(/^\d+_/, '').replace(/[_\s]+/g, '_').toLowerCase()
        const isSameBaseUpd = normFnUpd(oldName) === normFnUpd(file.name)
        // Ne pas archiver si déjà présent (par URL ou par nom — signed URLs ont des tokens différents)
        const isAlreadyArchived = isSameBaseUpd || existingDocs.some((d: any) =>
          d.url === existing.cv_url || d.name === oldName || d.name === `[Ancien] ${oldName}`
        )
        if (!isAlreadyArchived) {
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
          dbg('[CV Parse] Photo ajoutée (candidat sans photo)')
        } else {
          dbg('[CV Parse] Photo existante conservée')
        }
      }
      dbg(`[CV Parse] Actualisation CV: ${file.name}`)
    } else if (!isCV && mode !== 'reanalyse') {
      // Ce n'est PAS un CV et ce n'est PAS une ré-analyse → ajouter aux documents
      // En mode ré-analyse, on ne crée JAMAIS de documents "Autre" (c'est le CV principal)
      dbg(`[CV Parse] Document classifié comme: ${analyse.document_type}`)
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
    // Ne jamais toucher created_at en mode update — cela déplacerait le candidat dans la liste

    const { data: updated, error: updateError } = await adminClient
      .from('candidats')
      .update(updateData)
      .eq('id', updateId)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: `Erreur mise à jour : ${updateError.message}` }, { status: 500 })
    }

    // Fix 3 — supprimer de candidats_vus pour faire réapparaître le badge
    await (adminClient as any).from('candidats_vus').delete().eq('candidat_id', updateId)
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

  // 8c. Doublon trouvé avec nouveau contenu OU document non-CV → traitement post-upload
  if (candidatExistant) {
    dbg(`[CV Parse] Doublon post-upload : ${candidatExistant.prenom} ${candidatExistant.nom}`)

    // Document non-CV → auto-ajouter au candidat existant
    if (isNotCV && cvUrl) {
      const mappedType = mapDocumentType(analyse.document_type)
      const { data: existDoc } = await adminClient.from('candidats').select('documents').eq('id', candidatExistant.id).single()
      const docs = (existDoc?.documents as any[]) || []
      const alreadyExists = docs.some((d: any) => d.url === cvUrl || d.name === file.name)
      if (!alreadyExists) {
        docs.push({ name: file.name, url: cvUrl, type: mappedType, uploaded_at: new Date().toISOString() })
      } else {
        dbg(`[CV Parse] Document déjà présent: ${file.name}, skip`)
      }
      await adminClient.from('candidats').update({ documents: docs, updated_at: new Date().toISOString() }).eq('id', candidatExistant.id)
      dbg(`[CV Parse] Document ${analyse.document_type} ajouté à ${candidatExistant.prenom} ${candidatExistant.nom}`)
      await logActivity({ action: 'cv_importe', details: { fichier: file.name, dossier: categorie || '—', candidat: `${candidatExistant.prenom} ${candidatExistant.nom}`, type: 'document_ajouté' } })
      return NextResponse.json({ isDuplicate: true, candidatExistant, analyse, updated: true, candidat: candidatExistant, message: `Document ajouté à ${candidatExistant.prenom} ${candidatExistant.nom}` })
    }

    // CV avec nouveau contenu → update complet + archiver ancien CV
    // existingFullPre disponible si détecté en 7_pre, sinon re-fetch
    const existingFull = existingFullPre || (await adminClient.from('candidats')
      .select('id, titre_poste, competences, langues, experiences, formations_details, formation, resume_ia, permis_conduire, linkedin, cv_url, cv_nom_fichier, documents, created_at')
      .eq('id', candidatExistant.id).single()).data

    if (existingFull) {
      // Fix 5 — ne jamais rétrograder : si le CV importé est plus ancien, archiver dans documents[]
      const existingCreatedAt = (existingFull as any).created_at as string | null
      const importedIsOlder = !!(existingCreatedAt && new Date(resolvedCreatedAt).getTime() < new Date(existingCreatedAt).getTime())

      if (importedIsOlder && existingFull.cv_url) {
        // CV plus ancien → archiver dans documents[], ne pas écraser cv_url ni created_at
        // Fix v1.8.28 — normalisation espaces/underscores/timestamp
        const normFnOld = (n: string) => n.replace(/^\d+_/, '').replace(/[_\s]+/g, '_').toLowerCase()
        const isSameBaseOld = normFnOld(existingFull.cv_nom_fichier || '') === normFnOld(file.name)
        const existingDocs = (existingFull.documents as any[]) || []
        if (cvUrl && !isSameBaseOld && !existingDocs.some((d: any) => d.url === cvUrl || d.name === file.name)) {
          existingDocs.push({ name: `[Archive] ${file.name}`, url: cvUrl, type: 'cv', uploaded_at: new Date().toISOString() })
        }
        await adminClient.from('candidats').update({
          documents: existingDocs,
          updated_at: new Date().toISOString(),
          has_update: true,
        } as any).eq('id', candidatExistant.id)
        // Fix 3 — supprimer de candidats_vus pour faire réapparaître le badge
        await (adminClient as any).from('candidats_vus').delete().eq('candidat_id', candidatExistant.id)
        dbg(`[CV Parse] CV plus ancien archivé : ${candidatExistant.prenom} ${candidatExistant.nom}`)
        await logActivity({ action: 'cv_actualise', details: { fichier: file.name, candidat: `${candidatExistant.prenom} ${candidatExistant.nom}`, raison: 'cv_plus_ancien_archive' } })
        return NextResponse.json({ isDuplicate: true, updated: true, olderCV: true, candidatExistant, candidat: candidatExistant, analyse, message: `CV plus ancien archivé : ${candidatExistant.prenom} ${candidatExistant.nom}` })
      }

      const existingDocs = (existingFull.documents as any[]) || []
      const oldCvName = existingFull.cv_nom_fichier || 'Ancien CV'
      // Fix v1.8.28 — normalisation espaces/underscores/timestamp
      const normFnPost = (n: string) => n.replace(/^\d+_/, '').replace(/[_\s]+/g, '_').toLowerCase()
      const isSameBaseFile = normFnPost(oldCvName) === normFnPost(file.name)
      const isOldCvArchived = !existingFull.cv_url || isSameBaseFile || existingDocs.some((d: any) =>
        d.url === existingFull.cv_url || d.name === oldCvName || d.name === `[Ancien] ${oldCvName}`
      )
      if (existingFull.cv_url && !isOldCvArchived) {
        existingDocs.push({ name: `[Ancien] ${oldCvName}`, url: existingFull.cv_url, type: 'cv', uploaded_at: new Date().toISOString() })
      }
      // Bug 2 fix — ne jamais rétrograder created_at : utiliser resolvedCreatedAt seulement si plus récent
      const importedIsNewer = !existingCreatedAt || new Date(resolvedCreatedAt).getTime() > new Date(existingCreatedAt).getTime()
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
        ...(importedIsNewer ? { created_at: resolvedCreatedAt } : {}),
        updated_at: new Date().toISOString(),
        has_update: true,
      } as any).eq('id', candidatExistant.id)
      // Fix 3 — supprimer de candidats_vus pour faire réapparaître le badge
      await (adminClient as any).from('candidats_vus').delete().eq('candidat_id', candidatExistant.id)
      dbg(`[CV Parse] CV mis à jour : ${candidatExistant.prenom} ${candidatExistant.nom}`)
      await logActivity({ action: 'cv_actualise', details: { fichier: file.name, candidat: `${candidatExistant.prenom} ${candidatExistant.nom}`, raison: 'cv_mis_a_jour' } })
      return NextResponse.json({ isDuplicate: true, updated: true, cvUpdated: true, candidatExistant, candidat: candidatExistant, analyse, message: `CV mis à jour : ${candidatExistant.prenom} ${candidatExistant.nom}` })
    }
  }

  // 8d. Document non-CV sans candidat existant → ne PAS créer de nouveau candidat
  if (isNotCV) {
    dbg(`[CV Parse] Document ${analyse.document_type} sans candidat existant — ignoré`)
    return NextResponse.json({
      error: `Document classifié comme "${analyse.document_type}" mais aucun candidat correspondant trouvé. Importez d'abord le CV du candidat.`,
      document_type: analyse.document_type,
    }, { status: 422 })
  }

  // 9. Créer le candidat en base (CV uniquement)
  dbg('[CV Parse] Insertion en base...')

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
    statut_pipeline: null, // JAMAIS d'ajout auto en pipeline — uniquement via action manuelle
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
    dbg(`[CV Parse] created_at défini sur INSERT : ${file.name} → ${insertDate}`)
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
    // Nettoyer le fichier uploadé en storage pour éviter les orphelins
    if (storageData?.path) {
      await adminClient.storage.from('cvs').remove([storageData.path]).catch(e =>
        console.warn('[CV Parse] Échec nettoyage storage orphelin:', e instanceof Error ? e.message : String(e))
      )
    }
    await logActivity({ action: 'cv_erreur', details: { fichier: file.name, dossier: categorie || '—', erreur: dbError.message } })
    return NextResponse.json({ error: 'Erreur lors de la création du candidat' }, { status: 500 })
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
      dbg(`[CV Parse] Race condition doublon détecté — suppression ${candidat.id}`)
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
      dbg(`[CV Parse] INSERT n'a pas pris created_at (got ${dbCreatedAt}), fallback UPDATE...`)
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
        dbg(`[CV Parse] Fallback OK : ${file.name} → ${(candidat as any).created_at}`)
      }
    } else {
      dbg(`[CV Parse] Date fichier appliquée via INSERT : ${file.name} → ${dbCreatedAt}`)
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
            dbg(`[Multi-Doc] Document ${autreDoc.type} uploadé : ${autreDoc.filename}`)
          }
        } catch (docErr) {
          console.warn(`[Multi-Doc] Erreur upload document ${autreDoc.type}:`, (docErr as Error).message)
        }
      }
      if (docsAjoutes.length > 0) {
        await adminClient.from('candidats').update({ documents: docsAjoutes, updated_at: new Date().toISOString() }).eq('id', candidat.id)
        dbg(`[Multi-Doc] ${docsAjoutes.length} document(s) attaché(s) au candidat ${candidat.id}`)
      }
    } catch (attachErr) {
      console.warn('[Multi-Doc] Erreur attachement documents (non bloquant):', (attachErr as Error).message)
    }
  }

  dbg(`[CV Parse] Succès ! Candidat : ${candidat?.id}`)
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
  } catch (err) { console.warn('[cv/parse] logActivity failed:', (err as Error).message) }

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
