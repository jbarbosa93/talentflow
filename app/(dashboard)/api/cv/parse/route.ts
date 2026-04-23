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
import { findExistingCandidat } from '@/lib/candidat-matching'
import { mergeCandidat, mergeReportToText } from '@/lib/merge-candidat'
import { getCachedAnalyse, setCachedAnalyse, invalidateCachedAnalyse } from '@/lib/analyse-cache'
import { normalizeCandidat } from '@/lib/normalize-candidat'
import { classifyDocument } from '@/lib/document-classification'
import { createHash } from 'crypto'

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
  let skipConfirmation = false // v1.9.21 — bypass la modale de confirmation (bulk/import-worker/re-appel après user confirm)

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
    skipConfirmation = body.skip_confirmation === true
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
    skipConfirmation = formData.get('skip_confirmation') === 'true'
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
      const cleanName = file.name.replace(/^(\d+_)+/, '').replace(/_/g, ' ')
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

      // v1.9.90 — created_at devient IMMUABLE (vraie date de 1er import).
      // Le tri liste utilise désormais last_import_at. Voir CLAUDE.md pattern sur created_at.
      dbg(`[CV Parse] Fichier déjà importé : ${file.name}`)
      await supabase.from('candidats').update({
        updated_at: new Date().toISOString(),
        last_import_at: new Date().toISOString(),
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

  // v1.9.21 — Cache short-circuit : si skip_confirmation + storage_path + cache hit,
  // on récupère l'analyse Claude + photoUrl + docType etc. de la 1ère passe (il y a <5min)
  // et on saute toute la phase d'analyse (Claude ~$0.01 économisé par CV).
  // Fallback transparent : cache miss → re-analyse normale.
  const cached = skipConfirmation && storagePathInput ? getCachedAnalyse(storagePathInput) : null

  // v1.9.21 — Variables d'analyse déclarées ici pour permettre le skip via cache.
  // Quand cached est présent, on saute tout le bloc 4c→6e (rotation, multi-doc, extraction texte,
  // Claude, fallbacks, second avis, extraction photo). Buffer reste tel quel pour l'upload final.
  let analyse: any
  let texteCV = ''
  let photoUrl: string | null = null
  let docType: string = 'cv'
  let filenameEffectif = file.name
  let autresDocumentsMultiType: Awaited<ReturnType<typeof analyserDocumentMultiType>>['autresDocuments'] = []
  const ext     = file.name.toLowerCase().split('.').pop() || ''
  const isPDF   = ext === 'pdf' || file.type === 'application/pdf'
  const isDoc   = ext === 'doc' || file.type === 'application/msword'
  const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) || file.type.startsWith('image/')

  if (cached) {
    dbg(`[CV Parse] ⚡ Cache hit — skip analyse Claude (storage_path=${storagePathInput?.slice(-50)})`)
    analyse = cached.analyse
    texteCV = cached.texteCV
    photoUrl = cached.photoUrl
    docType = cached.docType
    filenameEffectif = cached.filenameEffectif
    autresDocumentsMultiType = cached.autresDocumentsMultiType
  } else {
  // ════════════════ Bloc analyse (skipé si cache hit) ════════════════

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

  // 5. Extraire le texte — avec rotation automatique pour les PDFs
  dbg('[CV Parse] Extraction texte...')
  try {
    const { extractTextWithRotation } = await import('@/lib/cv-parser')
    const result = await withTimeout(extractTextWithRotation(buffer, filenameEffectif), 30_000, 'extraction texte + rotation')
    texteCV = result.text
    if (result.rotation !== 0) {
      dbg(`[CV Parse] Rotation ${result.rotation}° nécessaire pour "${filenameEffectif}"`)
      buffer = result.rotatedBuffer // utiliser le buffer tourné pour le reste du pipeline
    }
  } catch (err: any) {
    if (err?.message === 'PDF_ENCRYPTED') {
      return NextResponse.json({ error: 'Ce PDF est protégé par mot de passe. Ouvrez-le, enregistrez-le sans protection, puis réimportez-le.' }, { status: 422 })
    }
    // timeout ou autre erreur → traiter comme PDF scanné
  }

  const isScanned = !texteCV || texteCV.trim().length < 50

  // 6. Analyse Claude — timeout 45s
  dbg('[CV Parse] Analyse Claude IA...')

  try {
    if (isImage) {
      dbg(`[CV Parse] Image (${ext}) → vision Claude...`)
      const mimeType = (file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`) as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
      analyse = await withTimeout(analyserCVDepuisImage(buffer, mimeType), 50_000, 'analyse image')
      // Si Vision retourne quasi-vide → tenter rotations 90°, 180°, 270°
      const imgVide = !analyse?.nom && !analyse?.prenom && !analyse?.titre_poste && !(analyse?.competences?.length)
      if (imgVide) {
        const sharp = (await import('sharp')).default
        for (const angle of [90, 180, 270]) {
          try {
            const rotated = await sharp(buffer).rotate(angle).jpeg({ quality: 85 }).toBuffer()
            const retryAnalyse = await withTimeout(analyserCVDepuisImage(rotated, mimeType), 50_000, `analyse image ${angle}°`)
            const ok = retryAnalyse?.nom && retryAnalyse.nom !== 'Candidat' && retryAnalyse.nom.length > 1
            if (ok) {
              dbg(`[CV Parse] Image rotation ${angle}° réussie : ${retryAnalyse.nom}`)
              analyse = retryAnalyse
              buffer = rotated
              break
            }
          } catch { /* rotation failed */ }
        }
      }
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

  // 6a-ter. v1.9.33 — Classification unifiée via lib/document-classification.ts
  // Source unique partagée avec onedrive/sync et sync-test.
  {
    const classification = classifyDocument({ analyse, texteCV })
    docType = classification.docType
    if (classification.isNotCV) {
      ;(analyse as any).document_type = classification.docType
      dbg(`[CV Parse] Classification non-CV : ${classification.docType} (${classification.reason})`)
    }
  }
  dbg(`[CV Parse] Document type: ${docType}, isPDF: ${isPDF}, file.type: ${file.type}, ext: ${ext}`)

  // 6b. Extraction photo candidat (PDFs CV uniquement — pas pour attestations/certificats)
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

  // 6e. Extraction photo depuis image CV (JPG/PNG/WEBP) — Vision localise le portrait
  if (isImage && !photoUrl && analyse && docType === 'cv') {
    try {
      const { extractPhotoFromImage } = await import('@/lib/cv-photo')
      const photoBuffer = await extractPhotoFromImage(buffer)
      if (photoBuffer) {
        const photoTimestamp = Date.now()
        const photoFileName = `photos/${photoTimestamp}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}.jpg`
        const { data: photoData } = await (createAdminClient()).storage.from('cvs').upload(photoFileName, photoBuffer, { contentType: 'image/jpeg', upsert: false })
        if (photoData?.path) {
          const { data: photoUrlData } = await (createAdminClient()).storage.from('cvs').createSignedUrl(photoData.path, 60 * 60 * 24 * 365 * 10)
          photoUrl = photoUrlData?.signedUrl || null
          if (photoUrl) dbg('[CV Parse] Photo extraite depuis image CV via Vision')
        }
      }
    } catch (photoErr) {
      console.warn('[CV Parse] Image CV photo extraction skipped:', (photoErr as Error).message)
    }
  }

  } // ════════════════ Fin bloc analyse ════════════════

  // 7_pre. Normalisation identité (nom/prenom/email/tel/localisation) avant matching et stockage
  if (analyse) normalizeCandidat(analyse)

  // 7_pre. Détection doublons AVANT upload Storage — évite gaspillage pour doublons "même CV"
  const adminClient = createAdminClient()

  const filenameDate = extractDateFromFilename(file.name)
  const resolvedCreatedAt = fileDate || filenameDate || new Date().toISOString()
  const isNotCV = docType !== 'cv'

  let candidatExistant: any = null
  let existingFullPre: any = null
  // v1.9.21 — détails du match hoistés pour la branche confirmation_required
  let matchReasonDetail: string | null = null
  let matchDiffsDetail: any[] = []
  let matchScoreDetail: any = null

  if (!forceInsert && !replaceId && !updateId) {
    // ── Cascade unifiée identité-first (lib/candidat-matching.ts) ──
    // Identité (nom+prénom) en premier, email/tel/DDN pour désambiguïsation.
    // Aucune référence au nom de fichier — tout vient du contenu extrait par IA.
    const matchResult = await findExistingCandidat(adminClient as any, {
      nom: analyse.nom, prenom: analyse.prenom,
      email: analyse.email, telephone: analyse.telephone,
      date_naissance: analyse.date_naissance || null,
      localisation: analyse.localisation || null,
    }, {
      selectColumns: 'id, nom, prenom, email, telephone, date_naissance, titre_poste, localisation, created_at',
      // v1.9.32 — Bug 3 : import manuel d'un non-CV (certificat/lettre) doit pouvoir
      // matcher le candidat existant sur nom seul (un certificat n'a pas d'email/tel).
      // Symétrique au retry step 5b d'onedrive/sync qui utilise déjà attachmentMode.
      attachmentMode: isNotCV,
    })

    // v1.9.34 — Trace complète du matching (déboguage prod). console.error pour garantir
    // la visibilité dans les logs Vercel quel que soit le niveau de log configuré.
    console.error('[CV Parse MATCH TRACE]', JSON.stringify({
      fichier: file.name,
      input: {
        nom: analyse.nom, prenom: analyse.prenom,
        email: analyse.email, telephone: analyse.telephone,
        date_naissance: analyse.date_naissance, localisation: analyse.localisation,
      },
      result_kind: matchResult.kind,
      reason: (matchResult as any).reason,
      score: (matchResult as any).scoreBreakdown,
      diffs: (matchResult as any).diffs,
      candidat: (matchResult as any).candidat ? {
        id: (matchResult as any).candidat.id,
        nom: (matchResult as any).candidat.nom, prenom: (matchResult as any).candidat.prenom,
        email: (matchResult as any).candidat.email, telephone: (matchResult as any).candidat.telephone,
      } : null,
      isNotCV, storagePathInput, skipConfirmation, forceInsert, replaceId, updateId,
    }))

    // v1.9.31 — Import manuel : 'uncertain' traité comme 'match' → passe par la modale existante
    // de confirmation côté UI (confirmation_required). L'utilisateur décide Update/Create/View.
    // Le pending_validation automatique est réservé au cron OneDrive silencieux.
    if (matchResult.kind === 'match' || matchResult.kind === 'uncertain') {
      candidatExistant = matchResult.candidat
      matchReasonDetail = matchResult.reason
      matchDiffsDetail = matchResult.diffs
      matchScoreDetail = matchResult.scoreBreakdown
      // Log silencieux des diffs de coordonnées (homonymes parfaits avec coords différentes)
      if (matchResult.diffs && matchResult.diffs.length > 0) {
        try {
          const diffsText = matchResult.diffs
            .map(d => `${d.field}: "${d.from || ''}" → "${d.to || ''}"`).join(', ')
          await (adminClient as any).from('activites').insert({
            type: 'candidat_modifie',
            description: `Coordonnées mises à jour via import CV — ${diffsText}`,
            candidat_id: candidatExistant.id,
            metadata: { source: 'cv_import', filename: file.name, diffs: matchResult.diffs, reason: matchResult.reason },
            created_at: new Date().toISOString(),
          })
        } catch (err) { console.warn('[CV Parse] log diff coords échec:', err instanceof Error ? err.message : String(err)) }
      }
      dbg(`[CV Parse] Match ${matchResult.reason}: ${candidatExistant.prenom} ${candidatExistant.nom}`)
    } else if (matchResult.kind === 'insufficient' && isNotCV) {
      // Non-CV sans identité → erreur explicite gérée plus bas par le flow normal
      // (pas de candidatExistant → création refusée pour non-CV via le check isNotCV)
    }
    // v1.9.20 — kind:'ambiguous' supprimé. kind === 'none' OU 'insufficient' → candidatExistant
    // reste null → création nouveau candidat. Les doublons suspects sont détectés après coup
    // via /parametres/doublons (pas dans le pipeline d'import).


    // — Si doublon CV : décider si upload nécessaire —
    if (candidatExistant && !isNotCV) {
      const { data: ef } = await (adminClient as any).from('candidats')
        .select('id, titre_poste, competences, langues, experiences, formations_details, formation, resume_ia, permis_conduire, linkedin, cv_url, cv_nom_fichier, documents, created_at, cv_texte_brut, cv_sha256, cv_size_bytes')
        .eq('id', candidatExistant.id).single()
      existingFullPre = ef

      // v1.9.42 — Détection "même fichier" SANS filename (règle dure feedback João).
      // Hiérarchie : SHA256 > size > texte. Le filename n'est jamais utilisé.
      const currentSha256_p = createHash('sha256').update(buffer).digest('hex')
      const currentSize_p   = buffer.length
      const efSha256 = (ef as any)?.cv_sha256 || null
      const efSize   = (ef as any)?.cv_size_bytes || null

      const hashMatch_p = !!(efSha256 && currentSha256_p === efSha256)
      const sizeMatch_p = !hashMatch_p && !efSha256 && !!(efSize && currentSize_p === efSize)
      const memeTexte = !!(ef?.cv_texte_brut && texteCV &&
        (ef.cv_texte_brut as string).slice(0, 2000).trim() === texteCV.slice(0, 2000).trim())
      // Fix 20/04/2026 : textMatch activé même si hash/size présents (cas CV ré-encodé depuis
      // autre source — hash différent mais texte identique, typiquement re-upload manuel).
      // Ancien guard !efSha256 && !efSize rendait textMatch dead code post-backfill v1.9.43.
      const textMatch_p = memeTexte

      const memeContenu = hashMatch_p || sizeMatch_p || textMatch_p

      // v1.9.32 — Bug 2 : forcer la modale si les coordonnées du CV diffèrent de la DB,
      // même si memeTexte=true. Cas : CV re-uploadé avec nouveau email/tel/ville/DDN —
      // matchResult.diffs capture déjà ces divergences via lib/candidat-matching.ts.
      const hasCoordsDiff = Array.isArray(matchDiffsDetail) && matchDiffsDetail.length > 0

      // Fix 4 — debug skip (activer localement si besoin, ne pas déployer)
      // console.log('[SKIP DEBUG]', { memeContenu, extrait2000Length: texteCV.slice(0,2000).trim().length, stocke2000Length: (ef?.cv_texte_brut||'').slice(0,2000).trim().length, resolvedCreatedAt, ef_created_at: ef?.created_at, hasCoordsDiff })

      if (memeContenu && !hasCoordsDiff) {
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
          // v1.9.90 — Même contenu, date différente : MAJ last_import_at uniquement, created_at IMMUABLE.
          dbg(`[CV Parse] Même contenu, date différente : ${candidatExistant.prenom} ${candidatExistant.nom}`)
          await adminClient.from('candidats').update({
            // v1.9.42 — backfill opportuniste hash/size si absents (stock historique)
            ...(!efSha256 ? { cv_sha256: currentSha256_p } : {}),
            ...(!efSize ? { cv_size_bytes: currentSize_p } : {}),
            updated_at: new Date().toISOString(),
            last_import_at: new Date().toISOString(),
            // v1.9.77 — badge coloré persistant (Réactivé 🟡)
            onedrive_change_type: 'reactive',
            onedrive_change_at: new Date().toISOString(),
          } as any).eq('id', candidatExistant.id)
          // Fix 3 — supprimer de candidats_vus pour faire réapparaître le badge
          await (adminClient as any).from('candidats_vus').delete().eq('candidat_id', candidatExistant.id)
          await logActivity({ action: 'cv_doublon', details: { fichier: file.name, candidat: `${candidatExistant.prenom} ${candidatExistant.nom}`, raison: 'meme_contenu_date_differente' } })
          return NextResponse.json({ isDuplicate: true, sameFile: true, reactivated: true, candidatExistant, candidat: candidatExistant, analyse, message: `Réactivé — ${candidatExistant.prenom} ${candidatExistant.nom}` })
        }
      }

      // v1.9.21 — Confirmation requise côté UI (import manuel uniquement, pas bulk/worker/cron)
      // Match détecté + contenu différent → STOP avant upload+update. L'utilisateur choisira
      // dans la modale : Update / Create new / View existing. La 2e requête arrivera avec
      // skip_confirmation:true et soit update_id, soit force_insert.
      if (!skipConfirmation && storagePathInput) {
        // Cache l'analyse complète → 2e requête évite re-analyse Claude (~$0.01/CV, TTL 5min)
        setCachedAnalyse(storagePathInput, {
          analyse, texteCV, photoUrl, docType, filenameEffectif, autresDocumentsMultiType,
        })
        dbg(`[CV Parse] → confirmation_required : ${candidatExistant.prenom} ${candidatExistant.nom} (reason=${matchReasonDetail}, score=${matchScoreDetail?.score})`)
        return NextResponse.json({
          confirmation_required: true,
          candidat_existant: {
            id: candidatExistant.id,
            nom: candidatExistant.nom,
            prenom: candidatExistant.prenom,
            email: candidatExistant.email,
            telephone: candidatExistant.telephone,
            date_naissance: candidatExistant.date_naissance,
            titre_poste: candidatExistant.titre_poste,
            localisation: candidatExistant.localisation,
            created_at: candidatExistant.created_at,
          },
          analyse_preview: {
            nom: analyse.nom,
            prenom: analyse.prenom,
            email: analyse.email,
            telephone: analyse.telephone,
            date_naissance: analyse.date_naissance,
            titre_poste: analyse.titre_poste,
            localisation: analyse.localisation,
          },
          score: matchScoreDetail, // { score, ddnMatch, telMatch, emailMatch, strictExact, strictSubset, villeMatch }
          reason: matchReasonDetail,
          diffs: matchDiffsDetail,
          storage_path: storagePathInput,
          file_name: file.name,
          file_date: fileDate,
          categorie: categorie,
        })
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
    // v1.9.96 — Snapshot + log forensique avant DELETE
    const { data: replaceSnap } = await adminClient
      .from('candidats')
      .select('id, nom, prenom, email, telephone, cv_sha256, cv_url, cv_nom_fichier')
      .eq('id', replaceId)
      .single()
    await adminClient.from('candidats').delete().eq('id', replaceId)
    if (replaceSnap) {
      try {
        const { logActivityServer, getRouteUser } = await import('@/lib/logActivity')
        const routeUser = await getRouteUser()
        const nomComplet = `${(replaceSnap as any).prenom || ''} ${(replaceSnap as any).nom || ''}`.trim()
        await logActivityServer({
          ...routeUser,
          type: 'candidat_supprime',
          titre: `Candidat supprimé (remplacement) — ${nomComplet || 'sans nom'}`,
          description: `Suppression via cv/parse mode "replace" (nouveau CV importé en remplacement)`,
          candidat_id: replaceId,
          candidat_nom: nomComplet,
          metadata: {
            source: 'replace',
            email: (replaceSnap as any).email,
            telephone: (replaceSnap as any).telephone,
            cv_sha256: (replaceSnap as any).cv_sha256,
            cv_url: (replaceSnap as any).cv_url,
            cv_nom_fichier: (replaceSnap as any).cv_nom_fichier,
            deleted_at: new Date().toISOString(),
          },
        })
      } catch (err) { console.warn('[cv/parse replace] logActivity failed:', (err as Error).message) }
    }
  }

  // 8a. Actualiser l'existant si "actualiser"
  if (updateId) {
    // Récupérer le candidat existant (inclure cv_url pour archivage)
    const { data: existing } = await adminClient
      .from('candidats')
      .select('nom, prenom, email, telephone, localisation, competences, langues, experiences, formations_details, photo_url, documents, cv_url, cv_nom_fichier, created_at')
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
      // v1.9.46 — ne PAS toucher cv_url, cv_nom_fichier, cv_sha256, cv_size_bytes
      // en mode reanalyse (règle métier : la ré-extraction IA ne change pas le fichier source).
      // Photo : ne PAS écraser si existante
      if (photoUrl && !existing?.photo_url) {
        updateData.photo_url = photoUrl
      }
      dbg(`[CV Parse] Ré-analyse (écrasement contenu seulement) : ${file.name}`)
    } else {
      // ═══ MODE MERGE (v1.9.32) : logique centralisée via lib/merge-candidat.ts ═══
      // Règles implémentées :
      // - IMMUABLES (email/tel/DDN/loc) : remplis seulement si vide en DB
      // - MERGE (competences/langues/experiences/formations_details) : union + dédup
      // - ÉCRASÉS (titre_poste/resume_ia/annees_exp/permis_conduire) : nouvelle valeur
      // - IGNORÉS (statut_pipeline/rating/tags/notes) : non touchés
      //
      // Nom/prénom : logique spécifique pour gérer le placeholder "Candidat"
      if (analyse.nom && (!existing?.nom || existing.nom === 'Candidat')) {
        updateData.nom = analyse.nom
      }
      if (analyse.prenom && !existing?.prenom) {
        updateData.prenom = analyse.prenom
      }

      // Appel merge intelligent — retourne uniquement les champs modifiés
      const { payload: mergePayload, report: mergeReport } = mergeCandidat(
        existing as any,
        analyse as any,
      )
      Object.assign(updateData, mergePayload)

      if (texteCV) updateData.cv_texte_brut = texteCV.slice(0, 10000)

      // Log traçabilité du merge
      try {
        const reportText = mergeReportToText(mergeReport)
        if (mergeReport.kept.length > 0 || mergeReport.filledEmpty.length > 0 || mergeReport.merged.length > 0) {
          dbg(`[CV Parse] Merge intelligent : ${reportText}`)
        }
      } catch { /* ignore */ }
    }

    // Classification du document (commun aux deux modes)
    const isCV = !analyse.document_type || analyse.document_type === 'cv'
    if (isCV && mode !== 'reanalyse') {
      // C'est un CV → archiver l'ancien CV dans les documents, mettre à jour cv_url
      if (cvUrl && existing?.cv_url && existing.cv_url !== cvUrl) {
        const existingDocs = (existing.documents as any[]) || []
        const oldName = existing.cv_nom_fichier || 'Ancien CV'
        // Fix v1.8.28 — normalisation espaces/underscores/timestamp pour comparaison noms fichiers
        const normFnUpd = (n: string) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^(\d+_)+/, '').replace(/[_\s]+/g, '_').toLowerCase()
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
      // v1.9.42 — Hash + size du nouveau fichier (sans filename matching)
      updateData.cv_sha256 = createHash('sha256').update(buffer).digest('hex')
      updateData.cv_size_bytes = buffer.length
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
    // v1.9.22 — écrire last_import_at pour faire réapparaître le badge rouge + remonter
    // le candidat dans la liste triée. CLAUDE.md rule 7 (v1.9.16).
    // v1.9.46 — SAUF en mode reanalyse (bouton "Ré-analyser IA" ne fait que re-extraire
    // depuis le CV existant, pas un vrai ré-import → ne doit pas déclencher le badge).
    if (mode !== 'reanalyse') {
      updateData.last_import_at = now
      // v1.9.77 — badge coloré persistant (Actualisé 🔵)
      updateData.onedrive_change_type = 'mis_a_jour'
      updateData.onedrive_change_at = now
    }
    // v1.9.90 — created_at IMMUABLE : conserve la vraie date de 1er import.
    // Le tri liste utilise last_import_at (écrit plus haut). Fin du pattern "created_at = date du dernier CV".

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
    // v1.9.46 — SAUF en mode reanalyse (pas de badge pour une ré-extraction IA)
    if (mode !== 'reanalyse') {
      await (adminClient as any).from('candidats_vus').delete().eq('candidat_id', updateId)
    }
    await logActivity({ action: 'cv_actualise', details: { fichier: file.name, candidat: `${analyse.prenom || ''} ${analyse.nom}`.trim() } })
    return NextResponse.json({
      success: true,
      candidat: updated,
      analyse,
      cv_url: cvUrl,
      message: `Candidat ${analyse.prenom} ${analyse.nom} actualisé`,
      updated: true,
      cvUpdated: true, // v1.9.22 — signal à UploadCV pour afficher "CV actualisé" (pas "doc ajouté")
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
        const normFnOld = (n: string) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^(\d+_)+/, '').replace(/[_\s]+/g, '_').toLowerCase()
        const isSameBaseOld = normFnOld(existingFull.cv_nom_fichier || '') === normFnOld(file.name)
        const existingDocs = (existingFull.documents as any[]) || []
        if (cvUrl && !isSameBaseOld && !existingDocs.some((d: any) => d.url === cvUrl || d.name === file.name)) {
          existingDocs.push({ name: `[Archive] ${file.name}`, url: cvUrl, type: 'cv', uploaded_at: new Date().toISOString() })
        }
        await adminClient.from('candidats').update({
          documents: existingDocs,
          updated_at: new Date().toISOString(),
          last_import_at: new Date().toISOString(),
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
      const normFnPost = (n: string) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^(\d+_)+/, '').replace(/[_\s]+/g, '_').toLowerCase()
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
        cv_sha256: createHash('sha256').update(buffer).digest('hex'), // v1.9.42
        cv_size_bytes: buffer.length,                                  // v1.9.42
        documents: existingDocs,
        ...(importedIsNewer ? { created_at: resolvedCreatedAt } : {}),
        updated_at: new Date().toISOString(),
        last_import_at: new Date().toISOString(),
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

  // Champs hors type CandidatInsert (pas dans types/database.ts auto-généré)
  ;(nouveauCandidat as any).last_import_at = new Date().toISOString()
  ;(nouveauCandidat as any).genre = normaliserGenre((analyse as any).genre)
  // v1.9.42 — Hash + size pour détecter "même fichier" déterministiquement (sans filename)
  ;(nouveauCandidat as any).cv_sha256 = createHash('sha256').update(buffer).digest('hex')
  ;(nouveauCandidat as any).cv_size_bytes = buffer.length
  // v1.9.77 — badge coloré persistant pour import manuel (cohérence avec OneDrive sync)
  ;(nouveauCandidat as any).onedrive_change_type = 'nouveau'
  ;(nouveauCandidat as any).onedrive_change_at = new Date().toISOString()

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
      // v1.9.96 — Snapshot + log forensique avant DELETE (race condition = candidat néo-créé qu'on retire)
      const { data: raceSnap } = await adminClient
        .from('candidats')
        .select('id, nom, prenom, email, telephone, cv_sha256, cv_url, cv_nom_fichier')
        .eq('id', candidat.id)
        .single()
      await adminClient.from('candidats').delete().eq('id', candidat.id)
      if (raceSnap) {
        try {
          const { logActivityServer, getRouteUser } = await import('@/lib/logActivity')
          const routeUser = await getRouteUser()
          const nomComplet = `${(raceSnap as any).prenom || ''} ${(raceSnap as any).nom || ''}`.trim()
          await logActivityServer({
            ...routeUser,
            type: 'candidat_supprime',
            titre: `Candidat supprimé (race) — ${nomComplet || 'sans nom'}`,
            description: `Race condition lors de l'import : doublon détecté juste après INSERT, candidat néo-créé retiré pour conserver l'existant ${duplicateOf.id}`,
            candidat_id: candidat.id,
            candidat_nom: nomComplet,
            metadata: {
              source: 'race_condition',
              kept_candidat_id: duplicateOf.id,
              email: (raceSnap as any).email,
              telephone: (raceSnap as any).telephone,
              cv_sha256: (raceSnap as any).cv_sha256,
              cv_url: (raceSnap as any).cv_url,
              cv_nom_fichier: (raceSnap as any).cv_nom_fichier,
              deleted_at: new Date().toISOString(),
            },
          })
        } catch (err) { console.warn('[cv/parse race] logActivity failed:', (err as Error).message) }
      }
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
