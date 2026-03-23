// app/(dashboard)/api/cv/bulk/route.ts
// Upload ZIP → extraction → analyse IA de chaque CV → base de données
// POST /api/cv/bulk

import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractTextFromCV } from '@/lib/cv-parser'
import { analyserCV, analyserCVDepuisPDF, analyserCVDepuisImage } from '@/lib/claude'
import type { CandidatInsert, DocumentType } from '@/types/database'
import { analyserDocumentMultiType } from '@/lib/document-splitter'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes pour traiter un gros ZIP

const FORMATS_SUPPORTES = ['pdf', 'docx', 'doc', 'txt', 'jpg', 'jpeg', 'png']
const FORMATS_IMAGES = ['jpg', 'jpeg', 'png']
const TAILLE_MAX_ZIP = 200 * 1024 * 1024 // 200 MB

function getExtension(filename: string): string {
  return filename.toLowerCase().split('.').pop() || ''
}

function isCVFile(filename: string): boolean {
  const ext = getExtension(filename)
  // Ignorer les fichiers cachés macOS et dossiers
  if (filename.startsWith('__MACOSX') || filename.startsWith('.')) return false
  return FORMATS_SUPPORTES.includes(ext)
}

function getMimeTypeForImage(ext: string): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' {
  if (ext === 'png') return 'image/png'
  return 'image/jpeg'
}

function mapDocumentTypeBulk(type: string): DocumentType {
  const mapping: Record<string, DocumentType> = {
    'certificat': 'certificat',
    'diplome': 'diplome',
    'lettre_motivation': 'lettre_motivation',
    'formation': 'formation',
    'permis': 'permis',
    'attestation': 'certificat',
  }
  return mapping[type] || 'autre'
}

async function traiterUnFichier(
  filename: string,
  buffer: Buffer,
  supabase: ReturnType<typeof createAdminClient>,
  offreId: string | null,
  statut: string
) {
  const ext = getExtension(filename)
  const isImage = FORMATS_IMAGES.includes(ext)
  const isPDF = ext === 'pdf'

  // Détection multi-documents pour les PDFs > 100 KB
  let bufferEffectif = buffer
  let filenameEffectif = filename
  let autresDocumentsMultiType: Awaited<ReturnType<typeof analyserDocumentMultiType>>['autresDocuments'] = []

  if (isPDF && buffer.length > 100 * 1024) {
    try {
      const multiDocResult = await analyserDocumentMultiType(buffer, filename)
      if (multiDocResult.estMultiDocument) {
        console.log(`[Multi-Doc] Détecté ${multiDocResult.autresDocuments.length + 1} types dans ${filename}`)
        bufferEffectif = multiDocResult.cvBuffer
        filenameEffectif = multiDocResult.cvFilename
        autresDocumentsMultiType = multiDocResult.autresDocuments
      }
    } catch (multiDocErr) {
      console.warn(`[Multi-Doc] Erreur détection pour ${filename} (fallback):`, (multiDocErr as Error).message)
    }
  }

  let analyse

  if (isImage) {
    const mimeType = getMimeTypeForImage(ext)
    analyse = await analyserCVDepuisImage(bufferEffectif, mimeType)
  } else {
    const texteCV = await extractTextFromCV(bufferEffectif, filenameEffectif)
    const isScanned = !texteCV || texteCV.trim().length < 50

    if (isScanned && isPDF) {
      analyse = await analyserCVDepuisPDF(bufferEffectif)
    } else if (isScanned) {
      throw new Error('Fichier vide ou illisible')
    } else {
      analyse = await analyserCV(texteCV)
    }
  }

  // Upload vers Supabase Storage (utiliser bufferEffectif = pages CV uniquement si split)
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

  // Extraction photo candidat (PDFs uniquement — depuis bufferEffectif = pages CV)
  let photoUrl: string | null = null
  if (isPDF) {
    try {
      const { extractPhotoFromPDF } = await import('@/lib/cv-photo')
      const photoBuffer = await extractPhotoFromPDF(bufferEffectif)
      if (photoBuffer) {
        const photoTimestamp = Date.now()
        const photoFileName = `photos/${photoTimestamp}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}.jpg`
        const { data: photoData } = await supabase.storage.from('cvs').upload(photoFileName, photoBuffer, {
          contentType: 'image/jpeg',
          upsert: false,
        })
        if (photoData?.path) {
          const { data: photoUrlData } = await supabase.storage.from('cvs').createSignedUrl(photoData.path, 60 * 60 * 24 * 365 * 10)
          photoUrl = photoUrlData?.signedUrl || null
          if (photoUrl) console.log(`[CV Bulk] Photo extraite pour ${filename}`)
        }
      }
    } catch (photoErr) {
      console.warn(`[CV Bulk] Photo extraction skipped for ${filename}:`, (photoErr as Error).message)
    }
  }

  // Créer le candidat en base
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
    cv_texte_brut: null,
    statut_pipeline: statut as any,
    tags: [],
    notes: null,
    source: 'upload_bulk',
    langues: analyse.langues?.length ? analyse.langues : null,
    linkedin: analyse.linkedin || null,
    permis_conduire: analyse.permis_conduire ?? null,
    date_naissance: analyse.date_naissance || null,
    experiences: analyse.experiences?.length ? analyse.experiences : null,
    formations_details: analyse.formations_details?.length ? analyse.formations_details : null,
  }

  const { data: candidatRaw, error: dbError } = await supabase
    .from('candidats')
    .insert(nouveauCandidat)
    .select()
    .single()

  if (dbError) throw new Error(`Erreur BDD : ${dbError.message}`)

  const candidat = candidatRaw as import('@/types/database').Candidat

  // Si une offre est spécifiée, créer l'entrée pipeline
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
          const { data: docStorageData } = await supabase.storage.from('cvs').upload(docStorageName, autreDoc.buffer, {
            contentType: 'application/pdf',
            upsert: false,
          })
          let docUrl: string | null = null
          if (docStorageData?.path) {
            const { data: docUrlData } = await supabase.storage.from('cvs').createSignedUrl(docStorageData.path, 60 * 60 * 24 * 365 * 10)
            docUrl = docUrlData?.signedUrl || null
          }
          if (docUrl) {
            const mappedDocType = mapDocumentTypeBulk(autreDoc.type)
            docsAjoutes.push({ name: autreDoc.filename, url: docUrl, type: mappedDocType, uploaded_at: new Date().toISOString() })
            console.log(`[Multi-Doc] Bulk: document ${autreDoc.type} uploadé pour ${filename}`)
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

  return { candidat, analyse }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const formData = await request.formData()

    const zipFile = formData.get('zip') as File | null
    const offreId = formData.get('offre_id') as string | null
    const statut = (formData.get('statut') as string) || 'nouveau'

    if (!zipFile) {
      return NextResponse.json(
        { error: 'Aucun fichier ZIP fourni. Utilisez le champ "zip".' },
        { status: 400 }
      )
    }

    const ext = getExtension(zipFile.name)
    if (ext !== 'zip') {
      return NextResponse.json(
        { error: 'Le fichier doit être un ZIP (.zip).' },
        { status: 400 }
      )
    }

    if (zipFile.size > TAILLE_MAX_ZIP) {
      return NextResponse.json(
        { error: 'Le ZIP dépasse la limite de 200 MB.' },
        { status: 400 }
      )
    }

    console.log(`[CV Bulk] Réception ZIP : ${zipFile.name} (${(zipFile.size / 1024 / 1024).toFixed(1)} MB)`)

    // Extraire le ZIP
    const arrayBuffer = await zipFile.arrayBuffer()
    const zipData = await JSZip.loadAsync(arrayBuffer)

    // Filtrer les fichiers CV valides
    const fichiersCVs: { name: string; relativeName: string }[] = []
    zipData.forEach((relativePath, zipEntry) => {
      if (!zipEntry.dir && isCVFile(relativePath)) {
        fichiersCVs.push({ name: zipEntry.name, relativeName: relativePath })
      }
    })

    if (fichiersCVs.length === 0) {
      return NextResponse.json(
        {
          error: `Aucun CV trouvé dans le ZIP. Formats supportés : ${FORMATS_SUPPORTES.join(', ')}.`,
        },
        { status: 422 }
      )
    }

    console.log(`[CV Bulk] ${fichiersCVs.length} CV(s) trouvé(s) dans le ZIP`)

    const resultats: Array<{
      fichier: string
      succes: boolean
      candidat_nom?: string
      candidat_id?: string
      erreur?: string
    }> = []

    let traites = 0
    let erreurs = 0

    // Traitement séquentiel pour éviter les rate limits Claude
    for (const fichier of fichiersCVs) {
      const nomCourt = fichier.name.split('/').pop() || fichier.name
      console.log(`[CV Bulk] Traitement (${traites + erreurs + 1}/${fichiersCVs.length}) : ${nomCourt}`)

      try {
        const zipEntry = zipData.file(fichier.relativeName)
        if (!zipEntry) throw new Error('Entrée ZIP introuvable')

        const buffer = Buffer.from(await zipEntry.async('arraybuffer'))

        const { candidat, analyse } = await traiterUnFichier(
          nomCourt,
          buffer,
          supabase,
          offreId,
          statut
        )

        resultats.push({
          fichier: nomCourt,
          succes: true,
          candidat_nom: `${analyse.prenom || ''} ${analyse.nom}`.trim(),
          candidat_id: candidat.id,
        })
        traites++
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erreur inconnue'
        console.error(`[CV Bulk] Erreur sur ${nomCourt} :`, message)
        resultats.push({ fichier: nomCourt, succes: false, erreur: message })
        erreurs++
      }
    }

    console.log(`[CV Bulk] Terminé : ${traites} succès, ${erreurs} erreurs`)

    return NextResponse.json({
      success: true,
      total: fichiersCVs.length,
      traites,
      erreurs,
      resultats,
      message: `${traites} candidat(s) créé(s) sur ${fichiersCVs.length} fichier(s)`,
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
