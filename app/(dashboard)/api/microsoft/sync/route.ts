// app/api/microsoft/sync/route.ts
// Synchronise les emails depuis un dossier Outlook ciblé → crée les candidats

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getValidAccessToken, getAccessTokenForPurpose, callGraph } from '@/lib/microsoft'
import { extractTextFromCV } from '@/lib/cv-parser'
import { analyserCV, analyserCVDepuisPDF } from '@/lib/claude'
import type { Integration } from '@/types/database'
import { logActivity } from '@/lib/activity-log'

export const runtime = 'nodejs'
export const maxDuration = 120

const CV_EXTENSIONS = ['pdf', 'docx', 'doc']
const DEFAULT_FOLDER_NAME = 'CV à traiter'

// Cherche le dossier par nom dans la boîte mail
async function findFolderByName(
  accessToken: string,
  folderName: string
): Promise<{ id: string; displayName: string } | null> {
  // 1. Cherche dans les dossiers de premier niveau
  try {
    const data = await callGraph(
      accessToken,
      `/me/mailFolders?$filter=displayName eq '${encodeURIComponent(folderName)}'&$select=id,displayName&$top=5`
    )
    if (data?.value?.length > 0) return data.value[0]
  } catch { /* try next */ }

  // 2. Cherche sans filtre (certaines versions de Graph n'acceptent pas le filtre sur displayName)
  try {
    const data = await callGraph(accessToken, '/me/mailFolders?$select=id,displayName&$top=100')
    const found = (data?.value || []).find(
      (f: any) => f.displayName?.toLowerCase() === folderName.toLowerCase()
    )
    if (found) return found
  } catch { /* try next */ }

  // 3. Cherche dans les sous-dossiers de la Boîte de réception
  try {
    const inboxData = await callGraph(
      accessToken,
      '/me/mailFolders/inbox/childFolders?$select=id,displayName&$top=100'
    )
    const found = (inboxData?.value || []).find(
      (f: any) => f.displayName?.toLowerCase() === folderName.toLowerCase()
    )
    if (found) return found
  } catch { /* give up */ }

  return null
}

export async function POST(request?: Request) {
  try {
    const supabase = createAdminClient()

    // Parse optional params
    let forceFolderName: string | null = null
    let forceFolderId: string | null = null
    if (request) {
      try {
        const url = new URL(request.url)
        forceFolderName = url.searchParams.get('folder_name')
        forceFolderId = url.searchParams.get('folder_id')
      } catch { /* ignore */ }
    }

    // Obtenir le token Outlook via metadata
    let accessToken: string
    let integrationId: string
    try {
      const result = await getAccessTokenForPurpose('outlook')
      accessToken = result.token
      integrationId = result.integrationId
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }

    // Charger l'intégration pour accéder aux metadata
    const { data: integrationRaw } = await supabase.from('integrations').select('*').eq('id', integrationId).single()
    const integration = integrationRaw as unknown as Integration
    const meta = (integration.metadata as any) || {}

    // Détermine le dossier à surveiller
    const targetFolderName = forceFolderName || meta.email_folder_name || DEFAULT_FOLDER_NAME
    let targetFolderId = forceFolderId || meta.email_folder_id || null

    // Cherche le dossier si on n'a pas l'ID
    if (!targetFolderId) {
      const folder = await findFolderByName(accessToken, targetFolderName)
      if (!folder) {
        return NextResponse.json(
          {
            error: `Dossier "${targetFolderName}" introuvable dans Outlook.`,
            hint: 'Créez ce dossier dans votre Outlook ou configurez le bon nom dans les intégrations.',
          },
          { status: 404 }
        )
      }
      targetFolderId = folder.id

      // Sauvegarde l'ID pour les prochains appels
      await supabase.from('integrations').update({
        metadata: { ...meta, email_folder_id: targetFolderId, email_folder_name: targetFolderName },
        updated_at: new Date().toISOString(),
      }).eq('id', integration.id)
    }

    // Récupère les emails du dossier cible avec pagination (max 200 par page, max 5 pages = 1000 emails)
    let allMessages: any[] = []
    // Récupérer les emails NON encore traités en vérifiant par batch
    // On récupère page par page et on s'arrête dès qu'on a assez de nouveaux
    let nextLink: string | null = `/me/mailFolders/${targetFolderId}/messages?$top=20&$select=id,subject,from,receivedDateTime,hasAttachments&$orderby=receivedDateTime desc`
    const MAX_NEW_TO_PROCESS = 5 // 5 CVs par sync max (chaque prend ~10s avec Claude)
    let newFound = 0

    while (nextLink && newFound < MAX_NEW_TO_PROCESS) {
      const page = await callGraph(accessToken, nextLink)
      const pageMessages = page.value || []

      for (const msg of pageMessages) {
        // Vérifier si déjà traité AVANT de l'ajouter
        const { data: ex } = await supabase.from('emails_recus').select('id').eq('microsoft_message_id', msg.id).maybeSingle()
        if (!ex) {
          allMessages.push(msg)
          newFound++
          if (newFound >= MAX_NEW_TO_PROCESS) break
        }
      }

      // Si tous les messages de cette page étaient déjà traités, continuer à la page suivante
      if (newFound < MAX_NEW_TO_PROCESS && page['@odata.nextLink']) {
        nextLink = page['@odata.nextLink'].replace('https://graph.microsoft.com/v1.0', '')
      } else {
        nextLink = null
      }
    }

    let processed = 0
    let skipped = 0
    let errors = 0
    let duplicates = 0
    const created: string[] = []

    for (const message of allMessages) {
      // Tous les messages dans allMessages sont déjà filtrés (non traités)

      // Récupère les pièces jointes (sans contentBytes — on télécharge séparément)
      let attachments: any[] = []
      try {
        const attData = await callGraph(
          accessToken,
          `/me/messages/${message.id}/attachments?$select=id,name,contentType,size`
        )
        attachments = attData.value || []
      } catch (attErr: any) {
        console.error(`[Sync] Attachments error for ${message.subject}:`, attErr?.message || attErr)
        skipped++; continue
      }

      // Filtrer les CVs par extension
      const cvAttachments = attachments.filter((att: any) => {
        const ext = (att.name || '').toLowerCase().split('.').pop()
        return CV_EXTENSIONS.includes(ext) && att.size < 10 * 1024 * 1024
      })

      if (cvAttachments.length === 0) {
        await supabase.from('emails_recus').insert({
          integration_id: integration.id,
          microsoft_message_id: message.id,
          expediteur: message.from?.emailAddress?.address,
          sujet: message.subject,
          recu_le: message.receivedDateTime,
          traite: true,
          candidat_id: null,
        })
        skipped++
        continue
      }

      // Traite la première pièce jointe CV trouvée
      const att = cvAttachments[0]
      try {
        // Télécharger le contenu de la pièce jointe (contentBytes peut être null pour les gros fichiers)
        let buffer: Buffer
        if (att.contentBytes) {
          buffer = Buffer.from(att.contentBytes, 'base64')
        } else {
          // Télécharger via l'endpoint $value
          const dlRes = await fetch(
            `https://graph.microsoft.com/v1.0/me/messages/${message.id}/attachments/${att.id}/$value`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          )
          if (!dlRes.ok) throw new Error(`Download failed: ${dlRes.status}`)
          buffer = Buffer.from(await dlRes.arrayBuffer())
        }
        const filename = att.name || 'cv.pdf'
        const mimeType = att.contentType || 'application/octet-stream'

        // Extraction texte
        let texteCV = ''
        try {
          texteCV = await extractTextFromCV(buffer, filename, mimeType)
        } catch { /* will try vision */ }

        const isPDF = filename.toLowerCase().endsWith('.pdf') || mimeType === 'application/pdf'
        const isScanned = !texteCV || texteCV.trim().length < 50

        let analyse: any
        if (isScanned && isPDF) {
          analyse = await analyserCVDepuisPDF(buffer)
        } else if (!isScanned) {
          analyse = await analyserCV(texteCV)
        } else {
          throw new Error('Fichier illisible')
        }

        // Vérification doublon candidat (email → téléphone → nom+prénom)
        const senderEmail = message.from?.emailAddress?.address
        const candidatEmail = analyse.email || senderEmail || null
        const candidatNom = (analyse.nom || '').trim()
        const candidatPrenom = (analyse.prenom || '').trim()
        const candidatTel = (analyse.telephone || '').replace(/\D/g, '')

        let existingCandidat: any = null

        // 1. Par email
        if (candidatEmail && !existingCandidat) {
          const { data } = await supabase.from('candidats').select('id, nom, prenom')
            .ilike('email', candidatEmail).maybeSingle()
          existingCandidat = data
        }

        // 2. Par téléphone (derniers 9 chiffres)
        if (!existingCandidat && candidatTel.length >= 8) {
          const { data } = await supabase.from('candidats').select('id, nom, prenom')
            .ilike('telephone', `%${candidatTel.slice(-9)}%`).maybeSingle()
          existingCandidat = data
        }

        // 3. Par nom + prénom exact
        if (!existingCandidat && candidatNom && candidatPrenom) {
          const { data } = await supabase.from('candidats').select('id, nom, prenom')
            .ilike('nom', candidatNom).ilike('prenom', candidatPrenom).maybeSingle()
          existingCandidat = data
        }

        if (existingCandidat) {
          await supabase.from('emails_recus').insert({
            integration_id: integration.id,
            microsoft_message_id: message.id,
            expediteur: senderEmail,
            sujet: message.subject,
            recu_le: message.receivedDateTime,
            traite: true,
            candidat_id: existingCandidat.id,
            erreur: `Doublon — ${existingCandidat.prenom || ''} ${existingCandidat.nom}`.trim(),
          })
          duplicates++
          continue
        }

        // Upload vers Supabase Storage
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

        // Extraction photo du PDF
        let photoUrl: string | null = null
        if (isPDF) {
          try {
            const { extractPhotoFromPDF } = await import('@/lib/cv-photo')
            const photoBuffer = await extractPhotoFromPDF(buffer)
            if (photoBuffer) {
              const photoName = `photos/${timestamp}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}.jpg`
              const { data: photoData } = await supabase.storage.from('cvs').upload(photoName, photoBuffer, { contentType: 'image/jpeg', upsert: false })
              if (photoData?.path) {
                const { data: pUrl } = await supabase.storage.from('cvs').createSignedUrl(photoData.path, 60 * 60 * 24 * 365 * 10)
                photoUrl = pUrl?.signedUrl || null
              }
            }
          } catch { /* photo extraction failed — continue without */ }
        }

        // Crée le candidat avec source E-MAIL et import_status a_traiter
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
            cv_nom_fichier: filename,
            photo_url: photoUrl,
            resume_ia: analyse.resume || null,
            cv_texte_brut: texteCV.slice(0, 10000),
            statut_pipeline: 'nouveau',
            import_status: 'a_traiter',
            source: 'E-MAIL',
            tags: [],
            notes: `Email de: ${senderEmail || 'inconnu'}\nSujet: ${message.subject || '—'}\nDossier: ${targetFolderName}`,
          })
          .select()
          .single()

        if (dbError) throw dbError

        await supabase.from('emails_recus').insert({
          integration_id: integration.id,
          microsoft_message_id: message.id,
          expediteur: senderEmail,
          sujet: message.subject,
          recu_le: message.receivedDateTime,
          traite: true,
          candidat_id: (candidat as any)?.id || null,
        })

        processed++
        created.push(`${candidatPrenom} ${candidatNom}`.trim() || 'Candidat')

      } catch (err) {
        console.error('[MS Sync] Erreur pièce jointe:', err)
        errors++
        try {
          await supabase.from('emails_recus').insert({
            integration_id: integration.id,
            microsoft_message_id: message.id,
            expediteur: message.from?.emailAddress?.address,
            sujet: message.subject,
            recu_le: message.receivedDateTime,
            traite: false,
          })
        } catch { /* ignore */ }
      }
    }

    // Met à jour la date du dernier sync
    const currentMeta = (integration.metadata as any) || {}
    await supabase.from('integrations').update({
      metadata: {
        ...currentMeta,
        last_sync: new Date().toISOString(),
        email_folder_id: targetFolderId,
        email_folder_name: targetFolderName,
      },
      updated_at: new Date().toISOString(),
    }).eq('id', integration.id)

    const result = {
      success: true,
      folder: targetFolderName,
      processed,
      skipped,
      duplicates,
      errors,
      created,
    }

    console.log(`[MS Sync] Dossier "${targetFolderName}": ${processed} créés, ${duplicates} doublons, ${skipped} ignorés, ${errors} erreurs`)
    await logActivity({ action: 'microsoft_sync', details: result })
    return NextResponse.json(result)

  } catch (error) {
    console.error('[MS Sync] Erreur fatale:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  const supabase = createAdminClient()
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '500')
  const { count: total } = await supabase.from('emails_recus').select('id', { count: 'exact', head: true })
  const { count: withCV } = await supabase.from('emails_recus').select('id', { count: 'exact', head: true }).not('candidat_id', 'is', null)
  const { data } = await supabase
    .from('emails_recus')
    .select('*, candidats(nom, prenom)')
    .order('recu_le', { ascending: false })
    .limit(limit)
  return NextResponse.json({ emails: data || [], total: total || 0, with_cv: withCV || 0 })
}
