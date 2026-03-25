// app/(dashboard)/api/onedrive/sync/route.ts
// Sync manuelle OneDrive — importe les CVs déposés dans le dossier configuré

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAccessTokenForPurpose, callGraph } from '@/lib/microsoft'
import { extractTextFromCV } from '@/lib/cv-parser'
import { analyserCV, analyserCVDepuisPDF } from '@/lib/claude'
import { logActivity } from '@/lib/activity-log'

export const runtime = 'nodejs'
export const maxDuration = 300

const DEFAULT_FOLDER_NAME = 'CVs TalentFlow'
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

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

    // 3. Charger TOUS les IDs déjà traités en mémoire (rapide, 1 seule requête)
    const { data: alreadyDone } = await (supabase as any).from('onedrive_fichiers').select('onedrive_item_id')
    const doneIds = new Set((alreadyDone || []).map((r: any) => r.onedrive_item_id))

    // 4. Lister les fichiers dans le dossier SharePoint (racine + sous-dossiers)
    let fichiers: any[] = []
    try {
      const rootData = await callGraph(accessToken, `/drives/${driveId}/items/${folderId}/children?$select=name,id,file,folder,size&$top=200`)
      const folders: any[] = []
      for (const item of (rootData.value || [])) {
        if (item.file && !doneIds.has(item.id)) {
          const ext = item.name.split('.').pop()?.toLowerCase()
          if (['pdf', 'docx', 'doc'].includes(ext || '')) fichiers.push(item)
        }
        if (item.folder) folders.push(item)
      }
      // Scanner les sous-dossiers
      for (const folder of folders) {
        try {
          const subData = await callGraph(accessToken, `/drives/${driveId}/items/${folder.id}/children?$select=name,id,file,size&$top=200`)
          for (const item of (subData.value || [])) {
            if (item.file && !doneIds.has(item.id)) {
              const ext = item.name.split('.').pop()?.toLowerCase()
              if (['pdf', 'docx', 'doc'].includes(ext || '')) fichiers.push(item)
            }
          }
        } catch { /* ignore sub-folder errors */ }
      }
    } catch (err) {
      return NextResponse.json(
        { error: `Impossible de lister les fichiers SharePoint: ${err instanceof Error ? err.message : 'Erreur'}` },
        { status: 500 }
      )
    }

    let processed = 0
    let skipped = 0
    let errors = 0
    let duplicates = 0
    const created: string[] = []

    // 5. Pour chaque fichier CV NON traité (max 3 par sync — chaque prend ~15s)
    const MAX_NEW = 20 // 20 CVs par batch (Vercel Pro 300s)
    for (const fichier of fichiers) {
      if (processed + errors >= MAX_NEW) break
      try {
        // Déjà filtré en mémoire (doneIds) — pas besoin de vérifier en DB

        // b. Vérifie taille < 10MB
        if (fichier.size > MAX_FILE_SIZE) {
          console.warn(`[OneDrive Sync] Fichier trop volumineux (${fichier.size} bytes): ${fichier.name}`)
          skipped++
          continue
        }

        // c. Télécharge le fichier
        // Télécharger via SharePoint Graph API
        const dlRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${fichier.id}/content`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (!dlRes.ok) { errors++; continue }
        const buffer = Buffer.from(await dlRes.arrayBuffer())
        const filename = fichier.name
        const ext = filename.toLowerCase().split('.').pop() || ''
        const mimeType = ext === 'pdf'
          ? 'application/pdf'
          : ext === 'docx'
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/msword'

        // d. Extrait le texte
        let texteCV = ''
        try {
          texteCV = await extractTextFromCV(buffer, filename, mimeType)
        } catch { /* will try vision */ }

        const isPDF = ext === 'pdf' || mimeType === 'application/pdf'
        const isScanned = !texteCV || texteCV.trim().length < 50

        // e. Analyse avec Claude
        let analyse: any
        if (isScanned && isPDF) {
          analyse = await analyserCVDepuisPDF(buffer)
        } else if (!isScanned) {
          analyse = await analyserCV(texteCV)
        } else {
          throw new Error('Fichier illisible — ni texte extrait, ni PDF pour vision')
        }

        const candidatEmail = analyse.email || null
        const candidatNom = (analyse.nom || '').trim()
        const candidatPrenom = (analyse.prenom || '').trim()
        const candidatTel = (analyse.telephone || '').replace(/\D/g, '')

        // f. Vérifie doublon candidat (email → téléphone → nom+prénom)
        let existingCandidat: any = null

        if (candidatEmail && !existingCandidat) {
          const { data } = await supabase.from('candidats').select('id, nom, prenom')
            .ilike('email', candidatEmail).maybeSingle()
          existingCandidat = data
        }
        if (!existingCandidat && candidatTel.length >= 8) {
          const { data } = await supabase.from('candidats').select('id, nom, prenom')
            .ilike('telephone', `%${candidatTel.slice(-9)}%`).maybeSingle()
          existingCandidat = data
        }
        if (!existingCandidat && candidatNom && candidatPrenom) {
          const { data } = await supabase.from('candidats').select('id, nom, prenom')
            .ilike('nom', candidatNom).ilike('prenom', candidatPrenom).maybeSingle()
          existingCandidat = data
        }

        if (existingCandidat) {
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
          duplicates++
          continue
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

        // Extraction photo du PDF (timeout 8s — skip si trop lent)
        let photoUrl: string | null = null
        if (isPDF) {
          try {
            const { extractPhotoFromPDF } = await import('@/lib/cv-photo')
            const photoPromise = extractPhotoFromPDF(buffer)
            const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000))
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
            cv_url: cvUrl,
            photo_url: photoUrl,
            cv_nom_fichier: filename,
            resume_ia: analyse.resume || null,
            cv_texte_brut: texteCV.slice(0, 10000),
            statut_pipeline: 'nouveau',
            import_status: 'a_traiter',
            source: 'ONEDRIVE',
            tags: [],
            notes: `Importé depuis OneDrive — dossier: ${folderName}\nFichier: ${filename}`,
          })
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

        processed++
        created.push(`${candidatPrenom} ${candidatNom}`.trim() || 'Candidat')

      } catch (err) {
        console.error(`[OneDrive Sync] Erreur fichier ${fichier.name}:`, err)
        errors++

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
      duplicates,
      errors,
      created,
    }

    console.log(`[OneDrive Sync] Dossier "${folderName}": ${processed} créés, ${duplicates} doublons, ${skipped} ignorés, ${errors} erreurs`)
    if (processed > 0) {
      await logActivity({ action: 'onedrive_sync', details: result })
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

export async function DELETE() {
  try {
    const supabase = createAdminClient()
    await (supabase as any).from('onedrive_fichiers').delete().gte('created_at', '2000-01-01')
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[OneDrive Sync] DELETE error:', error)
    return NextResponse.json({ error: 'Erreur suppression historique' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = createAdminClient()

    const { data, error } = await (supabase as any)
      .from('onedrive_fichiers')
      .select('*, candidats(nom, prenom)')
      .order('traite_le', { ascending: false })
      .limit(30)

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
