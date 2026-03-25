// app/api/cron/email-sync/route.ts
// Endpoint appelé automatiquement par Vercel Cron toutes les 10 minutes
// Synchronise les emails du dossier Outlook "CV à traiter" → candidats TalentFlow

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getValidAccessToken, callGraph } from '@/lib/microsoft'
import { extractTextFromCV } from '@/lib/cv-parser'
import { analyserCV, analyserCVDepuisPDF } from '@/lib/claude'
import type { Integration } from '@/types/database'
import { logActivity } from '@/lib/activity-log'

export const runtime = 'nodejs'
export const maxDuration = 300

const CV_EXTENSIONS = ['pdf', 'docx', 'doc']
const DEFAULT_FOLDER_NAME = 'CV à traiter'

async function findFolderByName(
  accessToken: string,
  folderName: string
): Promise<{ id: string; displayName: string } | null> {
  try {
    const data = await callGraph(accessToken, '/me/mailFolders?$select=id,displayName&$top=100')
    const found = (data?.value || []).find(
      (f: any) => f.displayName?.toLowerCase() === folderName.toLowerCase()
    )
    if (found) return found
  } catch { /* try inbox children */ }

  try {
    const subData = await callGraph(
      accessToken,
      '/me/mailFolders/inbox/childFolders?$select=id,displayName&$top=100'
    )
    const found = (subData?.value || []).find(
      (f: any) => f.displayName?.toLowerCase() === folderName.toLowerCase()
    )
    if (found) return found
  } catch { /* give up */ }

  return null
}

export async function GET(request: Request) {
  // Vercel Cron authentifie avec Authorization: Bearer <CRON_SECRET>
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()

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
      // Pas de compte connecté — cron inutile, pas d'erreur
      return NextResponse.json({ skipped: true, reason: 'Aucune intégration Microsoft Outlook active' })
    }

    const meta = (integration.metadata as any) || {}
    // Respecte le paramètre auto_sync (désactivable depuis la page Intégrations)
    if (meta.auto_sync === false) {
      return NextResponse.json({ skipped: true, reason: 'Sync automatique désactivé' })
    }

    const accessToken = await getValidAccessToken(integration.id)
    const targetFolderName = meta.email_folder_name || DEFAULT_FOLDER_NAME
    let targetFolderId = meta.email_folder_id || null

    if (!targetFolderId) {
      const folder = await findFolderByName(accessToken, targetFolderName)
      if (!folder) {
        console.log(`[Cron] Dossier "${targetFolderName}" introuvable`)
        return NextResponse.json({ skipped: true, reason: `Dossier "${targetFolderName}" introuvable` })
      }
      targetFolderId = folder.id
      await supabase.from('integrations').update({
        metadata: { ...meta, email_folder_id: targetFolderId, email_folder_name: targetFolderName },
        updated_at: new Date().toISOString(),
      }).eq('id', integration.id)
    }

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
      const { data: alreadyDone } = await supabase
        .from('emails_recus')
        .select('id')
        .eq('microsoft_message_id', message.id)
        .maybeSingle()

      if (alreadyDone) { skipped++; continue }

      let attachments: any[] = []
      try {
        const attData = await callGraph(
          accessToken,
          `/me/messages/${message.id}/attachments?$select=id,name,contentType,size`
        )
        attachments = attData.value || []
      } catch { skipped++; continue }

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

      const att = cvAttachments[0]
      try {
        // Télécharger le contenu (contentBytes peut être null pour les gros fichiers)
        let buffer: Buffer
        if (att.contentBytes) {
          buffer = Buffer.from(att.contentBytes, 'base64')
        } else {
          const dlRes = await fetch(
            `https://graph.microsoft.com/v1.0/me/messages/${message.id}/attachments/${att.id}/$value`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          )
          if (!dlRes.ok) throw new Error(`Download failed: ${dlRes.status}`)
          buffer = Buffer.from(await dlRes.arrayBuffer())
        }
        const filename = att.name || 'cv.pdf'
        const mimeType = att.contentType || 'application/octet-stream'

        let texteCV = ''
        try { texteCV = await extractTextFromCV(buffer, filename, mimeType) } catch { /* vision fallback */ }

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

        const senderEmail = message.from?.emailAddress?.address
        const candidatEmail = analyse.email || senderEmail || null

        // Vérif doublon par email
        if (candidatEmail) {
          const { data: existing } = await supabase
            .from('candidats')
            .select('id')
            .ilike('email', candidatEmail)
            .maybeSingle()

          if (existing) {
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

        const { data: candidat, error: dbError } = await supabase
          .from('candidats')
          .insert({
            nom: (analyse.nom || '').trim() || 'Candidat',
            prenom: (analyse.prenom || '').trim() || null,
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
            // PAS de statut_pipeline — la pipeline est gérée manuellement
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
        created.push(`${analyse.prenom || ''} ${analyse.nom || ''}`.trim() || 'Candidat')

      } catch (err) {
        console.error('[Cron Sync] Erreur:', err)
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

    // Sauvegarde la date du dernier sync
    const updatedMeta = { ...meta, last_sync: new Date().toISOString(), email_folder_id: targetFolderId, email_folder_name: targetFolderName }
    await supabase.from('integrations').update({
      metadata: updatedMeta,
      updated_at: new Date().toISOString(),
    }).eq('id', integration.id)

    const result = { success: true, folder: targetFolderName, processed, skipped, duplicates, errors, created }
    if (processed > 0) {
      console.log(`[Cron Sync] "${targetFolderName}": ${processed} créés, ${duplicates} doublons`)
      await logActivity({ action: 'microsoft_sync', details: result })
    }
    return NextResponse.json(result)

  } catch (error) {
    console.error('[Cron Sync] Erreur fatale:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
