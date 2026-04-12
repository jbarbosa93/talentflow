// app/(dashboard)/api/cv/bulk/route.ts
// Upload ZIP → extraction → analyse IA de chaque CV → base de données
// POST /api/cv/bulk

import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivityServer, getRouteUser } from '@/lib/logActivity'
import { extractTextFromCV } from '@/lib/cv-parser'
import { analyserCV, analyserCVDepuisPDF, analyserCVDepuisImage } from '@/lib/claude'
import type { CandidatInsert, DocumentType } from '@/types/database'
import { analyserDocumentMultiType } from '@/lib/document-splitter'
import { normaliserGenre } from '@/lib/normaliser-genre'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes pour traiter un gros ZIP

const FORMATS_SUPPORTES = ['pdf', 'docx', 'doc', 'txt', 'jpg', 'jpeg', 'png']
const FORMATS_IMAGES = ['jpg', 'jpeg', 'png']
const TAILLE_MAX_ZIP = 200 * 1024 * 1024 // 200 MB

const dbg = (...args: Parameters<typeof console.log>) => { if (process.env.DEBUG_MODE === 'true') console.log(...args) }

function getExtension(filename: string): string {
  return filename.toLowerCase().split('.').pop() || ''
}

function isCVFile(filename: string): boolean {
  const ext = getExtension(filename)
  if (filename.startsWith('__MACOSX') || filename.startsWith('.')) return false
  return FORMATS_SUPPORTES.includes(ext)
}

function getMimeTypeForImage(ext: string): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' {
  if (ext === 'png') return 'image/png'
  return 'image/jpeg'
}

// Fix 8 — types complets (aligné avec import normal)
function mapDocumentTypeBulk(type: string): DocumentType {
  const mapping: Record<string, DocumentType> = {
    'certificat': 'certificat',
    'diplome': 'diplome',
    'lettre_motivation': 'lettre_motivation',
    'formation': 'formation',
    'permis': 'permis',
    'reference': 'reference',
    'contrat': 'contrat',
    'bulletin_salaire': 'bulletin_salaire',
    'attestation': 'certificat',
  }
  return mapping[type] || 'autre'
}

// Fix 3 — second avis non-CV (aligné avec import normal et OneDrive)
function detectDocCategoryBulk(filename: string, texte: string): string | null {
  const check = (source: string) => {
    const s = source.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    if (/certificat|certificate|attestation|\bct\b/.test(s)) return 'certificat'
    if (/lettre|motivation|\blm\b/.test(s)) return 'lettre_motivation'
    if (/diplome|diplôme|cfc|afp|formation|brevet/.test(s)) return 'diplome'
    if (/permis|licence/.test(s)) return 'permis'
    if (/reference|recommandation/.test(s)) return 'reference'
    if (/contrat|avenant/.test(s)) return 'contrat'
    if (/bulletin|salaire|fiche de paie/.test(s)) return 'bulletin_salaire'
    return null
  }
  const fnWithoutExt = filename.replace(/\.[^.]+$/, '')
  return check(fnWithoutExt) ?? check(texte.slice(0, 200)) ?? null
}

// Fix 1 — nomsSimilaires (aligné avec import normal)
function nomsSimilaires(analyse: any, existant: any): boolean {
  if (!analyse.nom || !existant.nom) return true
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  const pNom = norm(analyse.nom), eNom = norm(existant.nom)
  const nomOk = pNom.includes(eNom) || eNom.includes(pNom) ||
    pNom.split(/\s+/).some((p: string) => p.length >= 3 && eNom.split(/\s+/).some((e: string) => e.includes(p) || p.includes(e)))
  if (nomOk) return true
  const pPrenom = norm(analyse.prenom || ''), ePrenom = norm(existant.prenom || '')
  return !!pPrenom && !!ePrenom && pPrenom.slice(0, 3) === ePrenom.slice(0, 3)
}

async function traiterUnFichier(
  filename: string,
  buffer: Buffer,
  supabase: ReturnType<typeof createAdminClient>,
  offreId: string | null,
  statut: string
): Promise<{ candidat: any; analyse: any; action: 'created' | 'updated' | 'doc_added' }> {
  const ext = getExtension(filename)
  const isImage = FORMATS_IMAGES.includes(ext)
  const isPDF = ext === 'pdf'
  const isDOCX = ext === 'docx'
  const isDoc = ext === 'doc'

  // ── Détection multi-documents pour les PDFs > 100 KB ──
  let bufferEffectif = buffer
  let filenameEffectif = filename
  let autresDocumentsMultiType: Awaited<ReturnType<typeof analyserDocumentMultiType>>['autresDocuments'] = []

  if (isPDF && buffer.length > 100 * 1024) {
    try {
      const multiDocResult = await analyserDocumentMultiType(buffer, filename)
      if (multiDocResult.estMultiDocument) {
        dbg(`[Multi-Doc] Détecté ${multiDocResult.autresDocuments.length + 1} types dans ${filename}`)
        bufferEffectif = multiDocResult.cvBuffer
        filenameEffectif = multiDocResult.cvFilename
        autresDocumentsMultiType = multiDocResult.autresDocuments
      }
    } catch (multiDocErr) {
      console.warn(`[Multi-Doc] Erreur détection pour ${filename} (fallback):`, (multiDocErr as Error).message)
    }
  }

  // ── Extraction texte ──
  let texteCV = ''
  let analyse: any

  if (isImage) {
    const mimeType = getMimeTypeForImage(ext)
    analyse = await analyserCVDepuisImage(bufferEffectif, mimeType)
  } else {
    texteCV = await extractTextFromCV(bufferEffectif, filenameEffectif)
    const isScanned = !texteCV || texteCV.trim().length < 50

    if (isScanned && isPDF) {
      analyse = await analyserCVDepuisPDF(bufferEffectif)
    } else if (isScanned) {
      throw new Error('Fichier vide ou illisible')
    } else {
      analyse = await analyserCV(texteCV)
    }
  }

  // ── Fix 3 : Second avis non-CV ──
  // Si l'IA dit "cv", vérifier via filename + patterns stricts
  let docType: string = analyse?.document_type || 'cv'
  if (docType === 'cv') {
    const filenameType = detectDocCategoryBulk(filename, '')
    if (filenameType) {
      docType = filenameType
    } else {
      // Patterns stricts sur contenu (titres de documents uniquement)
      const contentLower = texteCV.slice(0, 500).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      const strictContentType =
        /certificat de travail|certificat d.emploi|arbeitszeugnis/.test(contentLower) ? 'certificat' :
        /lettre de motivation|bewerbungsschreiben/.test(contentLower) ? 'lettre_motivation' :
        /bulletin de salaire|fiche de paie|lohnabrechnung/.test(contentLower) ? 'bulletin_salaire' :
        /permis de travail|permis de sejour|autorisation de travail|aufenthaltsbewilligung/.test(contentLower) ? 'permis' :
        /lettre de recommandation|lettre de reference|referenzschreiben/.test(contentLower) ? 'reference' :
        /contrat de travail|avenant au contrat|arbeitsvertrag/.test(contentLower) ? 'contrat' :
        null
      if (strictContentType) docType = strictContentType
    }
  }
  const isNotCV = docType !== 'cv'

  // ── Fix 4 : Détection diplôme/certificat (cvScore = 0) ──
  // Uniquement si l'IA dit "cv" ET le fichier a un nom mais aucun contenu CV
  if (!isNotCV) {
    const hasExperiences = Array.isArray(analyse.experiences) && analyse.experiences.length > 0
    const hasCompetences = Array.isArray(analyse.competences) && analyse.competences.length >= 2
    const hasContact     = !!(analyse.email || analyse.telephone)
    const hasTitle       = !!(analyse.titre_poste && analyse.titre_poste !== 'Candidat' && analyse.titre_poste.length > 1)
    const cvScore        = [hasExperiences, hasCompetences, hasContact, hasTitle].filter(Boolean).length
    const hasName        = !!(analyse.nom && analyse.nom !== 'Candidat' && analyse.nom.length > 1)

    if (hasName && cvScore === 0) {
      const nomComplet = [analyse.prenom, analyse.nom].filter(Boolean).join(' ')
      throw new Error(`Diplôme/certificat détecté pour ${nomComplet} — aucune expérience, compétence ni coordonnée. Importez d'abord le CV, puis ajoutez ce document depuis la fiche candidat.`)
    }
  }

  // ── Upload vers Supabase Storage ──
  const timestamp = Date.now()
  const nomStorage = `${timestamp}_${filenameEffectif.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  let cvUrl: string | null = null
  const { data: storageData } = await supabase.storage
    .from('cvs')
    .upload(nomStorage, bufferEffectif, {
      contentType: isImage ? getMimeTypeForImage(ext) : 'application/octet-stream',
      upsert: false,
    })

  if (storageData?.path) {
    const { data: urlData } = await supabase.storage
      .from('cvs')
      .createSignedUrl(storageData.path, 60 * 60 * 24 * 365 * 10)
    cvUrl = urlData?.signedUrl || null
  }

  // ── Fix 7 : Extraction photo (PDF + DOCX + DOC, uniquement si CV) ──
  let photoUrl: string | null = null
  if (!isNotCV) {
    if (isPDF) {
      try {
        const { extractPhotoFromPDF } = await import('@/lib/cv-photo')
        const photoBuffer = await extractPhotoFromPDF(bufferEffectif)
        if (photoBuffer) {
          const photoTimestamp = Date.now()
          const photoFileName = `photos/${photoTimestamp}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}.jpg`
          const { data: photoData } = await supabase.storage.from('cvs').upload(photoFileName, photoBuffer, { contentType: 'image/jpeg', upsert: false })
          if (photoData?.path) {
            const { data: photoUrlData } = await supabase.storage.from('cvs').createSignedUrl(photoData.path, 60 * 60 * 24 * 365 * 10)
            photoUrl = photoUrlData?.signedUrl || null
            if (photoUrl) dbg(`[CV Bulk] Photo PDF extraite pour ${filename}`)
          }
        }
      } catch (photoErr) {
        console.warn(`[CV Bulk] Photo PDF skipped for ${filename}:`, (photoErr as Error).message)
      }
    }
    if (isDOCX && !photoUrl) {
      try {
        const { extractPhotoFromDOCX } = await import('@/lib/cv-photo')
        const photoBuffer = await extractPhotoFromDOCX(bufferEffectif)
        if (photoBuffer) {
          const photoTimestamp = Date.now()
          const photoFileName = `photos/${photoTimestamp}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}.jpg`
          const { data: photoData } = await supabase.storage.from('cvs').upload(photoFileName, photoBuffer, { contentType: 'image/jpeg', upsert: false })
          if (photoData?.path) {
            const { data: photoUrlData } = await supabase.storage.from('cvs').createSignedUrl(photoData.path, 60 * 60 * 24 * 365 * 10)
            photoUrl = photoUrlData?.signedUrl || null
            if (photoUrl) dbg(`[CV Bulk] Photo DOCX extraite pour ${filename}`)
          }
        }
      } catch (photoErr) {
        console.warn(`[CV Bulk] Photo DOCX skipped for ${filename}:`, (photoErr as Error).message)
      }
    }
    if (isDoc && !photoUrl) {
      try {
        const { extractPhotoFromDOC } = await import('@/lib/cv-photo')
        const photoBuffer = await extractPhotoFromDOC(bufferEffectif)
        if (photoBuffer) {
          const photoTimestamp = Date.now()
          const photoFileName = `photos/${photoTimestamp}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}.jpg`
          const { data: photoData } = await supabase.storage.from('cvs').upload(photoFileName, photoBuffer, { contentType: 'image/jpeg', upsert: false })
          if (photoData?.path) {
            const { data: photoUrlData } = await supabase.storage.from('cvs').createSignedUrl(photoData.path, 60 * 60 * 24 * 365 * 10)
            photoUrl = photoUrlData?.signedUrl || null
            if (photoUrl) dbg(`[CV Bulk] Photo DOC extraite pour ${filename}`)
          }
        }
      } catch (photoErr) {
        console.warn(`[CV Bulk] Photo DOC skipped for ${filename}:`, (photoErr as Error).message)
      }
    }
  }

  // ── Fix 1 : Détection doublons (email → téléphone → nom+prénom) ──
  let candidatExistant: any = null

  // Méthode 1 : email
  if (!candidatExistant && analyse.email) {
    const { data: byEmail } = await supabase.from('candidats')
      .select('id, prenom, nom, email, titre_poste, competences, langues, experiences, formations_details, formation, resume_ia, cv_url, cv_nom_fichier, documents, photo_url')
      .eq('email', analyse.email).maybeSingle()
    if (byEmail && nomsSimilaires(analyse, byEmail)) candidatExistant = byEmail
  }

  // Méthode 2 : téléphone
  if (!candidatExistant && analyse.telephone) {
    const telNorm = analyse.telephone.replace(/\D/g, '')
    if (telNorm.length >= 8) {
      const tel9 = telNorm.slice(-9)
      const { data: telCandidats } = await supabase.from('candidats')
        .select('id, prenom, nom, email, titre_poste, competences, langues, experiences, formations_details, formation, resume_ia, cv_url, cv_nom_fichier, documents, photo_url, telephone')
        .not('telephone', 'is', null).limit(150)
      if (telCandidats) {
        const telMatch = telCandidats.find((c: any) => {
          const stored = (c.telephone || '').replace(/\D/g, '')
          return stored.length >= 8 && stored.slice(-9) === tel9
        })
        if (telMatch && nomsSimilaires(analyse, telMatch)) candidatExistant = telMatch
      }
    }
  }

  // Méthode 3 : nom + prénom (OR sur tous les mots — même pattern que import normal)
  if (!candidatExistant && analyse.nom && analyse.prenom) {
    // Essai 1 exact
    const { data: byName } = await supabase.from('candidats')
      .select('id, prenom, nom, email, titre_poste, competences, langues, experiences, formations_details, formation, resume_ia, cv_url, cv_nom_fichier, documents, photo_url')
      .ilike('nom', analyse.nom).ilike('prenom', analyse.prenom).maybeSingle()
    if (byName) candidatExistant = byName

    // Essai 2 : OR sur tous les mots du nom composé
    if (!candidatExistant) {
      const nomParts = analyse.nom.split(/\s+/).filter((w: string) => w.length >= 3)
      let byPartialName: any[] | null = null
      if (nomParts.length === 1) {
        const { data } = await supabase.from('candidats')
          .select('id, prenom, nom, email, titre_poste, competences, langues, experiences, formations_details, formation, resume_ia, cv_url, cv_nom_fichier, documents, photo_url')
          .ilike('nom', `%${nomParts[0]}%`).limit(20)
        byPartialName = data
      } else if (nomParts.length > 1) {
        const orClauses = nomParts.map((p: string) => `nom.ilike.%${p}%`).join(',')
        const { data } = await supabase.from('candidats')
          .select('id, prenom, nom, email, titre_poste, competences, langues, experiences, formations_details, formation, resume_ia, cv_url, cv_nom_fichier, documents, photo_url')
          .or(orClauses).limit(20)
        byPartialName = data
      }
      if (byPartialName && byPartialName.length > 0) {
        const prenomWords = analyse.prenom.split(/\s+/).map((w: string) => w.toLowerCase()).filter((w: string) => w.length >= 2)
        const matches = byPartialName.filter((c: any) => {
          const cPrenom = (c.prenom || '').toLowerCase()
          const cPrenomFirst = cPrenom.split(/\s+/)[0]
          return prenomWords.some((pw: string) => cPrenom.includes(pw) || pw.includes(cPrenomFirst))
        })
        // Pour les non-CV : 1 match → auto-attach. Pour les CV : 1 match → on le prend aussi (import masse, confirmation non demandée)
        if (matches.length === 1) candidatExistant = matches[0]
      }
    }
  }

  // ── Fix 3 (suite) : document non-CV ──
  if (isNotCV) {
    if (!candidatExistant) {
      // Pas de candidat trouvé → refus (comme import normal)
      const nameStr = [analyse.prenom, analyse.nom].filter(Boolean).join(' ') || 'inconnu'
      throw new Error(`${docType} — candidat "${nameStr}" introuvable. Importez d'abord le CV, puis ce fichier sera rattaché automatiquement.`)
    }
    // Candidat trouvé → ajouter dans documents[]
    if (cvUrl) {
      const mappedType = mapDocumentTypeBulk(docType)
      const { data: existDoc } = await supabase.from('candidats').select('documents').eq('id', candidatExistant.id).single()
      const docs = (existDoc?.documents as any[]) || []
      if (!docs.some((d: any) => d.url === cvUrl || d.name === filename)) {
        docs.push({ name: filename, url: cvUrl, type: mappedType, uploaded_at: new Date().toISOString() })
        // Ne pas toucher created_at pour un document non-CV
        await supabase.from('candidats').update({ documents: docs, updated_at: new Date().toISOString() }).eq('id', candidatExistant.id)
        dbg(`[CV Bulk] Document "${docType}" ajouté à ${candidatExistant.prenom} ${candidatExistant.nom}`)
      }
    }
    return { candidat: candidatExistant, analyse, action: 'doc_added' }
  }

  // ── Doublon CV : smart update ──
  if (candidatExistant) {
    dbg(`[CV Bulk] Doublon CV détecté : ${candidatExistant.prenom} ${candidatExistant.nom}`)
    // Archiver l'ancien CV si différent
    const existingDocs = (candidatExistant.documents as any[]) || []
    if (candidatExistant.cv_url && cvUrl && candidatExistant.cv_url !== cvUrl &&
        !existingDocs.some((d: any) => d.url === candidatExistant.cv_url)) {
      existingDocs.push({ name: `[Ancien] ${candidatExistant.cv_nom_fichier || 'CV'}`, url: candidatExistant.cv_url, type: 'cv', uploaded_at: new Date().toISOString() })
    }
    const updateData: Record<string, any> = {
      titre_poste: analyse.titre_poste || candidatExistant.titre_poste,
      competences: analyse.competences?.length ? analyse.competences : candidatExistant.competences,
      langues: analyse.langues?.length ? analyse.langues : candidatExistant.langues,
      experiences: analyse.experiences?.length ? analyse.experiences : candidatExistant.experiences,
      formations_details: analyse.formations_details?.length ? analyse.formations_details : candidatExistant.formations_details,
      formation: analyse.formation || candidatExistant.formation,
      resume_ia: analyse.resume || candidatExistant.resume_ia,
      cv_url: cvUrl || candidatExistant.cv_url,
      cv_nom_fichier: filename,
      documents: existingDocs,
      updated_at: new Date().toISOString(),
    }
    // Fix 2 : cv_texte_brut
    if (texteCV) updateData.cv_texte_brut = texteCV.slice(0, 10000)
    // Fix 6 : genre
    const genre = normaliserGenre((analyse as any).genre)
    if (genre) updateData.genre = genre
    // Photo : seulement si manquante
    if (photoUrl && !candidatExistant.photo_url) updateData.photo_url = photoUrl

    await supabase.from('candidats').update(updateData).eq('id', candidatExistant.id)
    return { candidat: candidatExistant, analyse, action: 'updated' }
  }

  // ── Nouveau candidat ──
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
    cv_nom_fichier: filename,
    photo_url: photoUrl,
    resume_ia: analyse.resume || null,
    cv_texte_brut: texteCV ? texteCV.slice(0, 10000) : null, // Fix 2
    statut_pipeline: null, // JAMAIS d'ajout auto en pipeline — uniquement via action manuelle
    tags: [],
    notes: null,
    source: 'upload_bulk',
    langues: analyse.langues?.length ? analyse.langues : null,
    linkedin: analyse.linkedin || null,
    permis_conduire: analyse.permis_conduire ?? null,
    date_naissance: analyse.date_naissance || null,
    experiences: analyse.experiences?.length ? analyse.experiences : null,
    formations_details: analyse.formations_details?.length ? analyse.formations_details : null,
    import_status: 'a_traiter', // Fix 5
  }

  // Fix 6 : genre
  ;(nouveauCandidat as any).genre = normaliserGenre((analyse as any).genre)

  const { data: candidatRaw, error: dbError } = await supabase
    .from('candidats')
    .insert(nouveauCandidat)
    .select()
    .single()

  if (dbError) throw new Error(`Erreur BDD : ${dbError.message}`)

  const candidat = candidatRaw as import('@/types/database').Candidat

  // Pipeline si offre spécifiée
  if (offreId && candidat) {
    await supabase.from('pipeline').insert({
      candidat_id: candidat.id,
      offre_id: offreId,
      etape: statut as any,
      score_ia: null,
    })
  }

  // Attacher les autres documents issus du split multi-type
  if (candidat && autresDocumentsMultiType.length > 0) {
    try {
      const docsAjoutes: import('@/types/database').CandidatDocument[] = []
      for (const autreDoc of autresDocumentsMultiType) {
        try {
          const docTimestamp = Date.now()
          const docStorageName = `${docTimestamp}_${autreDoc.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`
          const { data: docStorageData } = await supabase.storage.from('cvs').upload(docStorageName, autreDoc.buffer, { contentType: 'application/pdf', upsert: false })
          if (docStorageData?.path) {
            const { data: docUrlData } = await supabase.storage.from('cvs').createSignedUrl(docStorageData.path, 60 * 60 * 24 * 365 * 10)
            if (docUrlData?.signedUrl) {
              const mappedDocType = mapDocumentTypeBulk(autreDoc.type)
              docsAjoutes.push({ name: autreDoc.filename, url: docUrlData.signedUrl, type: mappedDocType, uploaded_at: new Date().toISOString() })
            }
          }
        } catch (docErr) {
          console.warn(`[Multi-Doc] Bulk: erreur upload document ${autreDoc.type}:`, (docErr as Error).message)
        }
      }
      if (docsAjoutes.length > 0) {
        await supabase.from('candidats').update({ documents: docsAjoutes, updated_at: new Date().toISOString() }).eq('id', candidat.id)
      }
    } catch (attachErr) {
      console.warn(`[Multi-Doc] Bulk: erreur attachement documents pour ${filename}:`, (attachErr as Error).message)
    }
  }

  return { candidat, analyse, action: 'created' }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const formData = await request.formData()

    const zipFile = formData.get('zip') as File | null
    const offreId = formData.get('offre_id') as string | null
    const statut = (formData.get('statut') as string) || 'nouveau'

    if (!zipFile) {
      return NextResponse.json({ error: 'Aucun fichier ZIP fourni. Utilisez le champ "zip".' }, { status: 400 })
    }

    if (getExtension(zipFile.name) !== 'zip') {
      return NextResponse.json({ error: 'Le fichier doit être un ZIP (.zip).' }, { status: 400 })
    }

    if (zipFile.size > TAILLE_MAX_ZIP) {
      return NextResponse.json({ error: 'Le ZIP dépasse la limite de 200 MB.' }, { status: 400 })
    }

    dbg(`[CV Bulk] Réception ZIP : ${zipFile.name} (${(zipFile.size / 1024 / 1024).toFixed(1)} MB)`)

    const arrayBuffer = await zipFile.arrayBuffer()
    const zipData = await JSZip.loadAsync(arrayBuffer)

    const fichiersCVs: { name: string; relativeName: string }[] = []
    zipData.forEach((relativePath, zipEntry) => {
      if (!zipEntry.dir && isCVFile(relativePath)) {
        fichiersCVs.push({ name: zipEntry.name, relativeName: relativePath })
      }
    })

    if (fichiersCVs.length === 0) {
      return NextResponse.json(
        { error: `Aucun CV trouvé dans le ZIP. Formats supportés : ${FORMATS_SUPPORTES.join(', ')}.` },
        { status: 422 }
      )
    }

    dbg(`[CV Bulk] ${fichiersCVs.length} CV(s) trouvé(s) dans le ZIP`)

    const resultats: Array<{
      fichier: string
      succes: boolean
      action?: string
      candidat_nom?: string
      candidat_id?: string
      erreur?: string
    }> = []

    let traites = 0
    let mis_a_jour = 0
    let docs_ajoutes = 0
    let erreurs = 0

    for (const fichier of fichiersCVs) {
      const nomCourt = fichier.name.split('/').pop() || fichier.name
      dbg(`[CV Bulk] Traitement (${traites + mis_a_jour + docs_ajoutes + erreurs + 1}/${fichiersCVs.length}) : ${nomCourt}`)

      try {
        const zipEntry = zipData.file(fichier.relativeName)
        if (!zipEntry) throw new Error('Entrée ZIP introuvable')

        const buffer = Buffer.from(await zipEntry.async('arraybuffer'))
        const { candidat, analyse, action } = await traiterUnFichier(nomCourt, buffer, supabase, offreId, statut)

        resultats.push({
          fichier: nomCourt,
          succes: true,
          action,
          candidat_nom: `${analyse.prenom || ''} ${analyse.nom}`.trim(),
          candidat_id: candidat.id,
        })
        if (action === 'created') traites++
        else if (action === 'updated') mis_a_jour++
        else if (action === 'doc_added') docs_ajoutes++
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erreur inconnue'
        console.error(`[CV Bulk] Erreur sur ${nomCourt} :`, message)
        resultats.push({ fichier: nomCourt, succes: false, erreur: message })
        erreurs++
      }
    }

    dbg(`[CV Bulk] Terminé : ${traites} créés, ${mis_a_jour} mis à jour, ${docs_ajoutes} docs ajoutés, ${erreurs} erreurs`)

    const totalSucces = traites + mis_a_jour + docs_ajoutes
    if (totalSucces > 0) {
      try {
        const routeUser = await getRouteUser()
        await logActivityServer({
          ...routeUser,
          type: 'candidat_importe',
          titre: `Import en masse — ${totalSucces} traité(s)`,
          description: `${traites} créé(s), ${mis_a_jour} mis à jour, ${docs_ajoutes} doc(s) ajouté(s), ${erreurs} erreur(s) sur ${fichiersCVs.length} fichier(s)`,
          metadata: { total: fichiersCVs.length, traites, mis_a_jour, docs_ajoutes, erreurs, zip: zipFile.name },
        })
      } catch (err) { console.warn('[cv/bulk] logActivity failed:', (err as Error).message) }
    }

    return NextResponse.json({
      success: true,
      total: fichiersCVs.length,
      traites,
      mis_a_jour,
      docs_ajoutes,
      erreurs,
      resultats,
      message: `${traites} créé(s), ${mis_a_jour} mis à jour, ${docs_ajoutes} doc(s) ajouté(s) sur ${fichiersCVs.length} fichier(s)`,
    })
  } catch (error) {
    console.error('[CV Bulk] Erreur inattendue:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur inattendue' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    route: 'POST /api/cv/bulk',
    description: 'Upload ZIP de CVs → Analyse IA → Création candidats en masse',
    champs_requis: ['zip (File ZIP)'],
    champs_optionnels: ['offre_id (uuid)', 'statut (string)'],
    formats_supportes: FORMATS_SUPPORTES,
    taille_max: '200 MB',
  })
}
