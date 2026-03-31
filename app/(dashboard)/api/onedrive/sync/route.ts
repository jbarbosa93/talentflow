// app/(dashboard)/api/onedrive/sync/route.ts
// Sync manuelle OneDrive — importe les CVs déposés dans le dossier configuré

import { NextResponse, after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAccessTokenForPurpose, callGraph } from '@/lib/microsoft'
import { extractTextFromCV } from '@/lib/cv-parser'
import { analyserCV, analyserCVDepuisPDF, analyserCVDepuisImage } from '@/lib/claude'
import { logActivity } from '@/lib/activity-log'
import { normaliserGenre } from '@/lib/normaliser-genre'

export const runtime = 'nodejs'
export const maxDuration = 300

const DEFAULT_FOLDER_NAME = 'CVs TalentFlow'
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

function hasNewContent(existing: any, newAnalysis: any): boolean {
  // Check if new analysis has more experiences
  const oldExpCount = (existing.experiences || []).length
  const newExpCount = (newAnalysis.experiences || []).length
  if (newExpCount > oldExpCount) return true

  // Check if titre_poste changed meaningfully
  if (newAnalysis.titre_poste && existing.titre_poste &&
      newAnalysis.titre_poste.toLowerCase() !== existing.titre_poste.toLowerCase()) return true

  // Check new competences
  const oldComp = new Set((existing.competences || []).map((s: string) => s.toLowerCase()))
  const newComp = (newAnalysis.competences || []).filter((s: string) => !oldComp.has(s.toLowerCase()))
  if (newComp.length >= 3) return true

  // Check new formations
  const oldFormCount = (existing.formations_details || []).length
  const newFormCount = (newAnalysis.formations_details || []).length
  if (newFormCount > oldFormCount) return true

  return false
}

export async function POST() {
  try {
    const supabase = createAdminClient()

    // 1. Obtenir le token OneDrive (SharePoint)
    let accessToken: string
    let integrationId: string
    try {
      const result = await getAccessTokenForPurpose('onedrive')
      accessToken = result.token
      integrationId = result.integrationId
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }

    // 2. Lire la config SharePoint depuis metadata
    const { data: integrationRow } = await supabase.from('integrations').select('metadata').eq('id', integrationId).single()
    const meta = (integrationRow as any)?.metadata || {}

    // Check if sync should stop
    if (meta.sync_stop_requested) {
      await supabase.from('integrations').update({
        metadata: { ...meta, sync_stop_requested: false },
      }).eq('id', integrationId)
      return NextResponse.json({ stopped: true, message: 'Sync arrêtée' })
    }

    // Config SharePoint directement dans metadata de la row microsoft_onedrive
    const driveId = meta.sharepoint_drive_id || meta.onedrive?.sharepoint_drive_id
    const folderId = meta.sharepoint_folder_id || meta.onedrive?.sharepoint_folder_id
    const folderName = meta.sharepoint_folder_name || meta.onedrive?.sharepoint_folder_name || DEFAULT_FOLDER_NAME

    if (!driveId || !folderId) {
      return NextResponse.json(
        { error: 'Aucun dossier SharePoint configuré. Configurez dans Intégrations.' },
        { status: 400 }
      )
    }

    // 3. Charger uniquement les IDs RÉUSSIS — les erreurs (traite: false) seront retentées
    const { data: alreadyDone } = await (supabase as any).from('onedrive_fichiers').select('onedrive_item_id').eq('traite', true)
    const doneIds = new Set<string>((alreadyDone || []).map((r: any) => r.onedrive_item_id))

    // 4. Lister les fichiers dans le dossier SharePoint (récursif jusqu'à 5 niveaux)
    async function scanFolderRecursive(scanDriveId: string, scanFolderId: string, scanToken: string, scanDoneIds: Set<string>, depth = 0): Promise<any[]> {
      if (depth > 5) return []
      const data = await callGraph(scanToken, `/drives/${scanDriveId}/items/${scanFolderId}/children?$select=name,id,file,folder,size,lastModifiedDateTime&$top=200`)
      let result: any[] = []
      for (const item of (data.value || [])) {
        if (item.file && !scanDoneIds.has(item.id)) {
          const ext = item.name.split('.').pop()?.toLowerCase()
          if (['pdf', 'docx', 'doc', 'jpg', 'jpeg', 'png', 'webp'].includes(ext || '')) result.push(item)
        }
        if (item.folder) {
          try {
            const subFiles = await scanFolderRecursive(scanDriveId, item.id, scanToken, scanDoneIds, depth + 1)
            result.push(...subFiles)
          } catch { /* ignore sub-folder errors */ }
        }
      }
      return result
    }

    let fichiers: any[] = []
    try {
      fichiers = await scanFolderRecursive(driveId, folderId, accessToken, doneIds)
    } catch (err) {
      return NextResponse.json(
        { error: `Impossible de lister les fichiers SharePoint: ${err instanceof Error ? err.message : 'Erreur'}` },
        { status: 500 }
      )
    }

    let processed = 0
    let skipped = 0
    let errors = 0
    let updated = 0
    let reactivated = 0
    const created: string[] = []
    const updatedNames: string[] = []
    const reactivatedNames: string[] = []
    const errorFiles: string[] = []

    // 5. Pour chaque fichier CV NON traité (max 20 par batch, 5 en parallèle)
    const MAX_NEW = 20 // 20 CVs par batch (Vercel Pro 300s)
    const fichiersToProcess = fichiers.slice(0, MAX_NEW)

    const PARALLEL = 5
    for (let i = 0; i < fichiersToProcess.length; i += PARALLEL) {
      const chunk = fichiersToProcess.slice(i, i + PARALLEL)
      const results = await Promise.all(chunk.map(async (fichier): Promise<{ status: 'created' | 'skipped' | 'updated' | 'reactivated' | 'error'; name?: string; candidatId?: string; filename?: string }> => {
        // Date de modification du fichier OneDrive = date d'ajout du candidat
        const fileDate = fichier.lastModifiedDateTime || new Date().toISOString()

        try {
          // b. Vérifie taille < 10MB
          if (fichier.size > MAX_FILE_SIZE) {
            console.warn(`[OneDrive Sync] Fichier trop volumineux (${fichier.size} bytes): ${fichier.name}`)
            return { status: 'skipped' }
          }

          // c. Télécharge le fichier
          const dlRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${fichier.id}/content`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          if (!dlRes.ok) return { status: 'error' }
          const buffer = Buffer.from(await dlRes.arrayBuffer())
          const filename = fichier.name
          const ext = filename.toLowerCase().split('.').pop() || ''
          const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)
          const isPDF = ext === 'pdf'
          const isDocx = ext === 'docx'
          const mimeType = isPDF ? 'application/pdf'
            : isDocx ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : isImage ? `image/${ext === 'jpg' ? 'jpeg' : ext}`
            : 'application/octet-stream'

          // d. Analyse avec Claude
          let analyse: any
          let texteCV = ''

          if (isImage) {
            // Images (JPG, PNG, etc.) → envoi direct à Claude vision
            analyse = await analyserCVDepuisImage(buffer, mimeType as any)
          } else if (isPDF) {
            // PDF → essayer d'extraire le texte, sinon vision
            try { texteCV = await extractTextFromCV(buffer, filename, mimeType) } catch {}
            if (texteCV && texteCV.trim().length >= 50) {
              analyse = await analyserCV(texteCV)
              // Si le texte était illisible (scan rotaté) → fallback vision avec correction rotation
              const estVide = !analyse.nom && !analyse.prenom && !analyse.titre_poste && !(analyse.competences?.length)
              if (estVide) {
                console.log(`[OneDrive Sync] Texte extrait mais résultat vide (PDF rotaté?) → fallback vision`)
                analyse = await analyserCVDepuisPDF(buffer)
              }
            } else {
              analyse = await analyserCVDepuisPDF(buffer)
            }
          } else if (isDocx) {
            // DOCX → extraire le texte
            try { texteCV = await extractTextFromCV(buffer, filename, mimeType) } catch {}
            if (texteCV && texteCV.trim().length >= 50) {
              analyse = await analyserCV(texteCV)
            } else {
              throw new Error('DOCX illisible')
            }
          } else {
            throw new Error(`Format non supporté: .${ext}`)
          }

          // ── Vérification analyse vide (CV rotaté / illisible) ──────────────────
          // Si l'analyse ne retourne ni nom, ni prénom, ni titre → réessayer avec vision PDF
          const analyseVide = !analyse.nom && !analyse.prenom && !analyse.titre_poste && !(analyse.competences?.length)
          if (analyseVide && isPDF) {
            console.log(`[OneDrive Sync] Analyse vide pour "${filename}" → retry forcé avec vision PDF (CV peut-être rotaté)`)
            try { analyse = await analyserCVDepuisPDF(buffer) } catch { /* si ça échoue aussi, on continue avec le vide */ }
          }
          if (analyseVide && isImage) {
            console.log(`[OneDrive Sync] Analyse vide pour "${filename}" → image illisible, sera retentée`)
            throw new Error('Image illisible — analyse vide')
          }

          const candidatEmail = analyse.email || null
          const candidatNom = (analyse.nom || '').trim()
          const candidatPrenom = (analyse.prenom || '').trim()
          const candidatTel = (analyse.telephone || '').replace(/\D/g, '')
          const docType = analyse.document_type || 'cv'
          const isNotCV = docType && docType !== 'cv'

          // ── Si toujours vide après retry → erreur (traite: false → sera retenté) ──
          if (!candidatNom && !candidatPrenom && !candidatEmail && candidatTel.length < 8 && !isNotCV) {
            throw new Error('CV illisible — aucune donnée extraite (rotaté ou scan de mauvaise qualité)')
          }

          // e-bis. Si c'est un document non-CV (permis, certificat, etc.) SANS nom identifiable → skip
          if (isNotCV && !candidatNom && !candidatEmail && candidatTel.length < 8) {
            console.log(`[OneDrive Sync] Document "${docType}" sans candidat identifiable: ${filename}`)
            try {
              await (supabase as any).from('onedrive_fichiers').insert({
                integration_id: integrationId,
                onedrive_item_id: fichier.id,
                nom_fichier: filename,
                traite: true,
                erreur: `Document "${docType}" — aucun candidat identifiable`,
              })
            } catch { /* ignore */ }

            // Log activité pour traçabilité
            try {
              await (supabase as any).from('activites').insert({
                type: 'onedrive_sync',
                description: `Document ignoré — "${docType}" sans candidat identifiable`,
                metadata: { filename, document_type: docType, source: 'onedrive' },
                created_at: new Date().toISOString(),
              })
            } catch { /* ignore */ }

            return { status: 'skipped', name: `⚠️ ${filename} (${docType})` }
          }

          // f. Vérifie doublon candidat (5 méthodes)
          let existingCandidat: any = null

          // 1. Par email
          if (candidatEmail && !existingCandidat) {
            const { data } = await supabase.from('candidats').select('id, nom, prenom')
              .ilike('email', candidatEmail).maybeSingle()
            existingCandidat = data
          }
          // 2. Par téléphone — comparaison normalisée côté JS (évite le problème des espaces/formats)
          //    Ex: "+41 77 423 99 95" en DB ne contient pas "774239995" en ilike → on normalise les deux
          if (!existingCandidat && candidatTel.length >= 8) {
            const tel9 = candidatTel.slice(-9)
            const prenomFilter = candidatPrenom ? candidatPrenom.split(/\s+/)[0] : null
            let telQuery = supabase.from('candidats').select('id, nom, prenom, telephone').not('telephone', 'is', null)
            if (prenomFilter) telQuery = telQuery.ilike('prenom', `%${prenomFilter}%`)
            const { data: telCandidats } = await telQuery.limit(150)
            if (telCandidats) {
              const telMatch = telCandidats.find((c: any) => {
                const stored = (c.telephone || '').replace(/\D/g, '')
                return stored.length >= 8 && stored.slice(-9) === tel9
              })
              if (telMatch) existingCandidat = telMatch
            }
          }
          // 3. Par nom + prénom exact (les deux doivent correspondre exactement)
          if (!existingCandidat && candidatNom && candidatPrenom) {
            const { data } = await supabase.from('candidats').select('id, nom, prenom')
              .ilike('nom', candidatNom).ilike('prenom', candidatPrenom).maybeSingle()
            existingCandidat = data
          }
          // 4. Match partiel nom (dernière partie) + prénom + AU MOINS UN signal confirmant
          //    (téléphone OU localisation OU date_naissance) — évite les faux positifs
          if (!existingCandidat && candidatNom && candidatPrenom) {
            const lastNamePart = candidatNom.split(/\s+/).pop()! // ex: "TAVARES" depuis "Vieira Tavares"
            const firstNamePart = candidatPrenom.split(/\s+/)[0].toLowerCase()
            if (lastNamePart.length >= 4) {
              const { data: byPartialName } = await supabase.from('candidats')
                .select('id, nom, prenom, telephone, localisation, date_naissance')
                .ilike('nom', `%${lastNamePart}%`)
                .limit(30)
              if (byPartialName) {
                const match = byPartialName.find((c: any) => {
                  // 1. Prénom doit correspondre (premier mot)
                  const cPrenom = (c.prenom || '').toLowerCase()
                  const prenomOk = cPrenom.includes(firstNamePart) || firstNamePart.includes(cPrenom.split(/\s+/)[0])
                  if (!prenomOk) return false
                  // 2. Au moins un signal confirmant supplémentaire
                  let confirm = 0
                  if (candidatTel.length >= 8 && c.telephone) {
                    const stored = c.telephone.replace(/\D/g, '')
                    if (stored.length >= 8 && stored.slice(-9) === candidatTel.slice(-9)) confirm++
                  }
                  if (analyse.localisation && c.localisation) {
                    const locA = analyse.localisation.toLowerCase().split(/[,\s]+/)[0]
                    const locB = c.localisation.toLowerCase()
                    if (locA.length >= 3 && locB.includes(locA)) confirm++
                  }
                  if (analyse.date_naissance && c.date_naissance &&
                      analyse.date_naissance === c.date_naissance) confirm++
                  return confirm >= 1
                })
                if (match) existingCandidat = match
              }
            }
          }
          // 5. Par nom de fichier exact (même nom de fichier = même candidat)
          if (!existingCandidat && filename) {
            const { data } = await supabase.from('candidats').select('id, nom, prenom')
              .eq('cv_nom_fichier', filename).maybeSingle()
            existingCandidat = data
          }

          // ── Document non-CV (certificat, diplôme, etc.) SANS candidat correspondant ──
          // Ne pas créer un candidat depuis un certificat — logguer erreur pour correction manuelle
          if (isNotCV && !existingCandidat) {
            const nameStr = [candidatPrenom, candidatNom].filter(Boolean).join(' ') || 'inconnu'
            const docTypeLabel = docType === 'certificat' ? 'Certificat' : docType === 'diplome' ? 'Diplôme' : docType === 'formation' ? 'Formation' : docType === 'attestation' ? 'Attestation' : docType === 'permis' ? 'Permis' : `Document (${docType})`
            throw new Error(
              `${docTypeLabel} — candidat "${nameStr}" introuvable dans la base. ` +
              `Importez d'abord le CV de ce candidat, puis ce fichier sera rattaché automatiquement.`
            )
          }

          if (existingCandidat) {
            // Smart update: fetch full existing candidate data
            const { data: candidatExistant } = await supabase.from('candidats')
              .select('*').eq('id', existingCandidat.id).single() as { data: any }

            if (!candidatExistant) {
              // Candidate disappeared, skip
              try {
                await (supabase as any).from('onedrive_fichiers').insert({
                  integration_id: integrationId,
                  onedrive_item_id: fichier.id,
                  nom_fichier: filename,
                  traite: true,
                  candidat_id: existingCandidat.id,
                  erreur: `Doublon — ${existingCandidat.prenom || ''} ${existingCandidat.nom}`.trim(),
                })
              } catch { /* ignore */ }
              return { status: 'skipped' }
            }

            const candidatDisplayName = `${existingCandidat.prenom || ''} ${existingCandidat.nom}`.trim()

            // Si document non-CV (permis, certificat, etc.) → ajouter comme document au candidat existant
            if (isNotCV) {
              const timestamp = Date.now()
              const storageName = `${timestamp}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`
              const { data: storageData } = await supabase.storage
                .from('cvs')
                .upload(storageName, buffer, { contentType: mimeType, upsert: false })

              let docUrl: string | null = null
              if (storageData?.path) {
                const { data: urlData } = await supabase.storage
                  .from('cvs')
                  .createSignedUrl(storageData.path, 60 * 60 * 24 * 365 * 10)
                docUrl = urlData?.signedUrl || null
              }

              const existingDocs = candidatExistant.documents || []
              const docTypeLabel = docType === 'permis' ? 'Permis' : docType === 'certificat' ? 'Certificat' : docType === 'diplome' ? 'Diplôme' : docType === 'formation' ? 'Formation' : docType === 'attestation' ? 'Attestation' : 'Document'
              existingDocs.push({
                name: filename,
                url: docUrl,
                type: docTypeLabel,
                uploaded_at: new Date().toISOString(),
              })

              await (supabase as any).from('candidats').update({
                documents: existingDocs,
                updated_at: new Date().toISOString(),
              }).eq('id', candidatExistant.id)

              try {
                await (supabase as any).from('onedrive_fichiers').insert({
                  integration_id: integrationId,
                  onedrive_item_id: fichier.id,
                  nom_fichier: filename,
                  traite: true,
                  candidat_id: existingCandidat.id,
                  erreur: `${docTypeLabel} ajouté — ${candidatDisplayName}`,
                })
              } catch { /* ignore */ }

              return { status: 'updated', name: `📄 ${docTypeLabel} → ${candidatDisplayName}`, candidatId: existingCandidat.id, filename }
            }

            // Si même nom de fichier → même CV re-déposé, pas de mise à jour (juste réactivation)
            const memeNomFichier = filename === candidatExistant.cv_nom_fichier
            // Compare new CV analysis with existing candidate
            const cvHasNewContent = !memeNomFichier && hasNewContent(candidatExistant, analyse)

            if (cvHasNewContent) {
              // Step 3a: CV has NEW content — update candidate
              const timestamp = Date.now()
              const storageName = `${timestamp}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`
              const { data: storageData } = await supabase.storage
                .from('cvs')
                .upload(storageName, buffer, { contentType: mimeType, upsert: false })

              let newCvUrl: string | null = null
              if (storageData?.path) {
                const { data: urlData } = await supabase.storage
                  .from('cvs')
                  .createSignedUrl(storageData.path, 60 * 60 * 24 * 365 * 10)
                newCvUrl = urlData?.signedUrl || null
              }

              // Move old CV to documents array
              const existingDocs = candidatExistant.documents || []
              if (candidatExistant.cv_url) {
                existingDocs.push({
                  name: candidatExistant.cv_nom_fichier || 'Ancien CV',
                  url: candidatExistant.cv_url,
                  type: 'cv',
                  uploaded_at: new Date().toISOString(),
                })
              }

              // Update candidate with new CV data
              // created_at = date du fichier OneDrive = date de dernière candidature/disponibilité
              await (supabase as any).from('candidats').update({
                titre_poste: analyse.titre_poste || candidatExistant.titre_poste,
                competences: analyse.competences || candidatExistant.competences,
                langues: analyse.langues || candidatExistant.langues,
                experiences: analyse.experiences || candidatExistant.experiences,
                formations_details: analyse.formations_details || candidatExistant.formations_details,
                formation: analyse.formation || candidatExistant.formation,
                resume_ia: analyse.resume || candidatExistant.resume_ia,
                permis_conduire: analyse.permis_conduire ?? candidatExistant.permis_conduire,
                date_naissance: analyse.date_naissance || candidatExistant.date_naissance,
                genre: normaliserGenre(analyse.genre) ?? candidatExistant.genre ?? null,
                linkedin: analyse.linkedin || candidatExistant.linkedin,
                annees_exp: analyse.annees_exp || candidatExistant.annees_exp,
                cv_url: newCvUrl || candidatExistant.cv_url,
                cv_nom_fichier: filename,
                documents: existingDocs,
                created_at: fileDate, // Date de candidature = date du fichier sur OneDrive
                updated_at: new Date().toISOString(),
              }).eq('id', candidatExistant.id)

              try {
                await (supabase as any).from('onedrive_fichiers').insert({
                  integration_id: integrationId,
                  onedrive_item_id: fichier.id,
                  nom_fichier: filename,
                  traite: true,
                  candidat_id: existingCandidat.id,
                  erreur: `Mis à jour — ${candidatDisplayName}`,
                })
              } catch { /* ignore */ }

              return { status: 'updated', name: candidatDisplayName, candidatId: existingCandidat.id, filename }
            } else {
              // Step 3b: Same CV — réactivation, mettre à jour la date de candidature
              await (supabase as any).from('candidats').update({
                created_at: fileDate, // Date de candidature = date du fichier sur OneDrive
                updated_at: new Date().toISOString(),
              }).eq('id', candidatExistant.id)

              try {
                await (supabase as any).from('onedrive_fichiers').insert({
                  integration_id: integrationId,
                  onedrive_item_id: fichier.id,
                  nom_fichier: filename,
                  traite: true,
                  candidat_id: existingCandidat.id,
                  erreur: `Réactivé — ${candidatDisplayName}`,
                })
              } catch { /* ignore */ }

              return { status: 'reactivated', name: candidatDisplayName }
            }
          }

          // g. Upload vers Supabase Storage bucket 'cvs'
          const timestamp = Date.now()
          const storageName = `${timestamp}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`
          const { data: storageData } = await supabase.storage
            .from('cvs')
            .upload(storageName, buffer, { contentType: mimeType, upsert: false })

          let cvUrl: string | null = null
          if (storageData?.path) {
            const { data: urlData } = await supabase.storage
              .from('cvs')
              .createSignedUrl(storageData.path, 60 * 60 * 24 * 365 * 10)
            cvUrl = urlData?.signedUrl || null
          }

          // Extraction photo du PDF (timeout 20s — Vercel Pro)
          let photoUrl: string | null = null
          if (isPDF) {
            try {
              const { extractPhotoFromPDF } = await import('@/lib/cv-photo')
              const photoPromise = extractPhotoFromPDF(buffer)
              const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 20000))
              const photoBuffer = await Promise.race([photoPromise, timeoutPromise])
              if (photoBuffer) {
                const photoName = `photos/${timestamp}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}.jpg`
                const { data: photoData } = await supabase.storage.from('cvs').upload(photoName, photoBuffer, { contentType: 'image/jpeg', upsert: false })
                if (photoData?.path) {
                  const { data: pUrl } = await supabase.storage.from('cvs').createSignedUrl(photoData.path, 60 * 60 * 24 * 365 * 10)
                  photoUrl = pUrl?.signedUrl || null
                }
              }
            } catch { /* photo extraction failed */ }
          }

          // ── Validation minimum avant création (évite les "Candidat" vides) ──
          // Un candidat DOIT avoir au minimum un nom OU un prénom OU un email OU un téléphone
          const aDesInfosBase = candidatNom || candidatPrenom || candidatEmail || candidatTel.length >= 8
          const aDesInfosCV = analyse.titre_poste || (analyse.competences?.length > 0) || (analyse.experiences?.length > 0)
          if (!aDesInfosBase && !aDesInfosCV) {
            throw new Error(`Document vide ou illisible — aucune donnée exploitable extraite (${filename}). Vérifiez que le fichier contient bien un CV.`)
          }

          // h. Crée le candidat
          const { data: candidat, error: dbError } = await supabase
            .from('candidats')
            .insert({
              nom: candidatNom || 'Candidat',
              prenom: candidatPrenom || null,
              email: candidatEmail,
              telephone: analyse.telephone || null,
              localisation: analyse.localisation || null,
              titre_poste: analyse.titre_poste || null,
              annees_exp: analyse.annees_exp || 0,
              competences: analyse.competences || [],
              formation: analyse.formation || null,
              langues: analyse.langues || null,
              linkedin: analyse.linkedin || null,
              experiences: analyse.experiences || null,
              formations_details: analyse.formations_details || null,
              date_naissance: analyse.date_naissance || null,
              permis_conduire: analyse.permis_conduire ?? false,
              genre: normaliserGenre(analyse.genre),
              cv_url: cvUrl,
              photo_url: photoUrl,
              cv_nom_fichier: filename,
              resume_ia: analyse.resume || null,
              cv_texte_brut: texteCV.slice(0, 10000),
              statut_pipeline: null, // JAMAIS d'ajout auto en pipeline
              import_status: 'a_traiter',
              source: 'ONEDRIVE',
              tags: [],
              notes: `Importé depuis OneDrive — dossier: ${folderName}\nFichier: ${filename}`,
              created_at: fileDate, // Date de modification du fichier OneDrive
            } as any)
            .select()
            .single()

          if (dbError) throw dbError

          const candidatId = (candidat as any)?.id || null

          // i. Insert dans onedrive_fichiers
          try {
            await (supabase as any).from('onedrive_fichiers').insert({
              integration_id: integrationId,
              onedrive_item_id: fichier.id,
              nom_fichier: filename,
              traite: true,
              candidat_id: candidatId,
            })
          } catch (tableErr: any) {
            const msg = tableErr?.message || ''
            if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('42P01')) {
              console.warn('[OneDrive Sync] Table onedrive_fichiers manquante — candidat créé mais non enregistré')
            }
          }

          return { status: 'created', name: `${candidatPrenom} ${candidatNom}`.trim() || 'Candidat', candidatId, filename }

        } catch (err) {
          console.error(`[OneDrive Sync] Erreur fichier ${fichier.name}:`, err)

          // Enregistre l'erreur dans onedrive_fichiers
          try {
            await (supabase as any).from('onedrive_fichiers').insert({
              integration_id: integrationId,
              onedrive_item_id: fichier.id,
              nom_fichier: fichier.name,
              traite: false,
              erreur: err instanceof Error ? err.message : 'Erreur inconnue',
            })
          } catch { /* ignore */ }
          return { status: 'error' }
        }
      }))

      // Accumulate results
      const individualLogs: any[] = []
      for (const r of results) {
        if (r.status === 'created') {
          processed++
          if (r.name) created.push(r.name)
          individualLogs.push({
            user_id: '00000000-0000-0000-0000-000000000000',
            user_name: 'Système (OneDrive)',
            type: 'cv_importe',
            titre: `CV importé — ${r.name}`,
            description: `Fichier: ${r.filename || 'inconnu'} · Dossier: ${folderName}`,
            candidat_id: r.candidatId || null,
            candidat_nom: r.name || null,
            metadata: { source: 'onedrive', folder: folderName },
          })
        }
        else if (r.status === 'updated') {
          updated++
          if (r.name) updatedNames.push(r.name)
          individualLogs.push({
            user_id: '00000000-0000-0000-0000-000000000000',
            user_name: 'Système (OneDrive)',
            type: 'cv_actualise',
            titre: `CV actualisé — ${r.name}`,
            description: `Fichier: ${r.filename || 'inconnu'} · Dossier: ${folderName}`,
            candidat_id: r.candidatId || null,
            candidat_nom: r.name || null,
            metadata: { source: 'onedrive', folder: folderName },
          })
        }
        else if (r.status === 'reactivated') {
          reactivated++
          if (r.name) reactivatedNames.push(r.name)
          individualLogs.push({
            user_id: '00000000-0000-0000-0000-000000000000',
            user_name: 'Système (OneDrive)',
            type: 'cv_doublon',
            titre: `CV réactivé — ${r.name || 'inconnu'}`,
            description: `Fichier: ${r.filename || 'inconnu'} · Dossier: ${folderName}`,
            candidat_id: r.candidatId || null,
            candidat_nom: r.name || null,
            metadata: { source: 'onedrive', folder: folderName },
          })
        }
        else if (r.status === 'skipped') skipped++
        else if (r.status === 'error') { errors++; if (r.filename) errorFiles.push(r.filename) }
      }

      // Log individual activities (batch insert)
      if (individualLogs.length > 0) {
        try {
          await (supabase as any).from('activites').insert(individualLogs)
        } catch (e) {
          console.error('[OneDrive Sync] Erreur log activites individuelles:', e)
        }
      }
    }

    // 6. Met à jour onedrive_last_sync
    await supabase
      .from('integrations')
      .update({
        metadata: {
          ...meta,
          onedrive_last_sync: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', integrationId)

    // 7. Retourne les stats
    const result = {
      success: true,
      folder: folderName,
      processed,
      skipped,
      updated,
      reactivated,
      errors,
      created,
      updatedNames,
      reactivatedNames,
      errorFiles,
    }

    console.log(`[OneDrive Sync] Dossier "${folderName}": ${processed} créés, ${updated} mis à jour, ${reactivated} réactivés, ${skipped} ignorés, ${errors} erreurs`)

    // Log activity if anything happened (created, updated, or reactivated)
    if (processed > 0 || updated > 0 || reactivated > 0) {
      // Log to logs_activite (legacy)
      await logActivity({ action: 'onedrive_sync', details: result })

      // NOTE: On ne log plus le résumé "onedrive_sync" global — seuls les logs individuels
      // (cv_importe, cv_actualise, cv_doublon) sont créés pour chaque fichier traité.
      // Cela évite les doublons dans la page activités.
      /*
      try {
        const parts: string[] = []
        if (processed > 0) parts.push(`${processed} importé${processed > 1 ? 's' : ''}`)
        if (updated > 0) parts.push(`${updated} mis à jour`)
        if (reactivated > 0) parts.push(`${reactivated} réactivé${reactivated > 1 ? 's' : ''}`)
        if (errors > 0) parts.push(`${errors} erreur${errors > 1 ? 's' : ''}`)

        await (supabase as any).from('activites').insert({
          user_id: '00000000-0000-0000-0000-000000000000',
          user_name: 'Système (OneDrive)',
          type: 'onedrive_sync',
          titre: `Sync OneDrive — ${parts.join(', ')}`,
          description: `Dossier: ${folderName}`,
          metadata: {
            folder: folderName,
            processed,
            updated,
            reactivated,
            skipped,
            errors,
            created: created.slice(0, 10),
            updatedNames: updatedNames.slice(0, 10),
            reactivatedNames: reactivatedNames.slice(0, 10),
          },
        })
      } catch (e) {
        console.error('[OneDrive Sync] Erreur log activites:', e)
      }
      */
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('[OneDrive Sync] Erreur fatale:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}

// DELETE supprimé — ne jamais effacer l'historique (cause des re-doublons)

export async function GET() {
  try {
    const supabase = createAdminClient()

    const { data, error } = await (supabase as any)
      .from('onedrive_fichiers')
      .select('*, candidats(nom, prenom)')
      .order('traite_le', { ascending: false })
      .limit(500)

    if (error) {
      const msg = error.message || ''
      if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('42P01')) {
        return NextResponse.json(
          {
            fichiers: [],
            migration_needed: true,
            hint: 'Exécutez la migration SQL supabase/migrations/20260323_onedrive_fichiers.sql dans votre dashboard Supabase.',
          }
        )
      }
      throw error
    }

    return NextResponse.json({ fichiers: data || [] })
  } catch (error) {
    console.error('[OneDrive Sync GET]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
