// app/api/microsoft/sync/route.ts
// Synchronise les emails depuis un dossier Outlook ciblé → crée les candidats

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getValidAccessToken, callGraph } from '@/lib/microsoft'
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

    // Fetch all active Microsoft integrations, then filter by metadata.purpose
    const { data: allMicrosoft } = await supabase
      .from('integrations')
      .select('*')
      .eq('type', 'microsoft')
      .eq('actif', true)
    const integrationRaw = (allMicrosoft || []).find((i: any) => (i.metadata as any)?.purpose === 'outlook')
      || (allMicrosoft || []).find((i: any) => !(i.metadata as any)?.purpose) // legacy fallback

    const integration = integrationRaw as unknown as Integration | null

    if (!integration) {
      return NextResponse.json(
        { error: 'Aucune intégration Microsoft Outlook active. Connectez votre compte.' },
        { status: 404 }
      )
    }

    const accessToken = await getValidAccessToken(integration.id)
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

    // Récupère les emails du dossier cible (non traités — pas de filtre date pour ne rien rater)
    const messages = await callGraph(
      accessToken,
      `/me/mailFolders/${targetFolderId}/messages?$top=50&$select=id,subject,from,receivedDateTime,hasAttachments`
    )

    let processed = 0
    let skipped = 0
    let errors = 0
    let duplicates = 0
    const created: string[] = []

    for (const message of messages.value || []) {
      // Déjà traité ?
      const { data: existing } = await supabase
        .from('emails_recus')
        .select('id')
        .eq('microsoft_message_id', message.id)
        .maybeSingle()

      if (existing) { skipped++; continue }

      // Récupère les pièces jointes
      let attachments: any[] = []
      try {
        const attData = await callGraph(
          accessToken,
          `/me/messages/${message.id}/attachments?$select=id,name,contentType,size,contentBytes`
        )
        attachments = attData.value || []
      } catch {
        skipped++; continue
      }

      const cvAttachments = attachments.filter((att: any) => {
        const ext = (att.name || '').toLowerCase().split('.').pop()
        return CV_EXTENSIONS.includes(ext) && att.size < 10 * 1024 * 1024 && att.contentBytes
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
        const buffer = Buffer.from(att.contentBytes, 'base64')
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

        // Vérification doublon candidat (par email ou nom+prénom)
        const senderEmail = message.from?.emailAddress?.address
        const candidatEmail = analyse.email || senderEmail || null
        const candidatNom = (analyse.nom || '').trim()
        const candidatPrenom = (analyse.prenom || '').trim()

        if (candidatEmail) {
          const { data: existing } = await supabase
            .from('candidats')
            .select('id, nom, prenom')
            .ilike('email', candidatEmail)
            .maybeSingle()

          if (existing) {
            // Enregistre l'email comme traité (doublon)
            await supabase.from('emails_recus').insert({
              integration_id: integration.id,
              microsoft_message_id: message.id,
              expediteur: senderEmail,
              sujet: message.subject,
              recu_le: message.receivedDateTime,
              traite: true,
              candidat_id: existing.id,
            })
            duplicates++
            continue
          }
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

export async function GET() {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('emails_recus')
    .select('*, candidats(nom, prenom)')
    .order('recu_le', { ascending: false })
    .limit(30)
  return NextResponse.json({ emails: data || [] })
}
