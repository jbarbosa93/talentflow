// app/api/microsoft/sync/route.ts
// Synchronise les emails Microsoft → détecte les CVs → crée les candidats

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getValidAccessToken, callGraph } from '@/lib/microsoft'
import { extractTextFromCV } from '@/lib/cv-parser'
import { analyserCV, analyserCVDepuisPDF } from '@/lib/claude'
import type { Integration } from '@/types/database'

export const runtime = 'nodejs'
export const maxDuration = 120

const CV_EXTENSIONS = ['pdf', 'docx', 'doc']

export async function POST() {
  try {
    const supabase = createAdminClient()

    // Get Microsoft integration
    const { data: integrationRaw } = await supabase
      .from('integrations')
      .select('*')
      .eq('type', 'microsoft')
      .eq('actif', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const integration = integrationRaw as unknown as Integration | null

    if (!integration) {
      return NextResponse.json(
        { error: 'Aucune intégration Microsoft active. Connectez votre compte.' },
        { status: 404 }
      )
    }

    const accessToken = await getValidAccessToken(integration.id)

    // Fetch unread emails with attachments from last 30 days
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const messages = await callGraph(
      accessToken,
      `/me/messages?$filter=hasAttachments eq true and receivedDateTime ge ${since}&$orderby=receivedDateTime desc&$top=100&$select=id,subject,from,receivedDateTime,hasAttachments`
    )

    let processed = 0
    let skipped = 0
    let errors = 0
    const created: string[] = []

    for (const message of messages.value || []) {
      // Skip already processed
      const { data: existing } = await supabase
        .from('emails_recus')
        .select('id')
        .eq('microsoft_message_id', message.id)
        .maybeSingle()

      if (existing) { skipped++; continue }

      // Get attachments
      let attachments: any[] = []
      try {
        const attData = await callGraph(accessToken, `/me/messages/${message.id}/attachments?$select=id,name,contentType,size,contentBytes`)
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

      // Process first CV found
      const att = cvAttachments[0]
      try {
        const buffer = Buffer.from(att.contentBytes, 'base64')
        const filename = att.name || 'cv.pdf'
        const mimeType = att.contentType || 'application/octet-stream'

        let texteCV = ''
        try {
          texteCV = await extractTextFromCV(buffer, filename, mimeType)
        } catch { /* will try vision */ }

        const isPDF = filename.toLowerCase().endsWith('.pdf') || mimeType === 'application/pdf'
        const isScanned = !texteCV || texteCV.trim().length < 50

        let analyse
        if (isScanned && isPDF) {
          analyse = await analyserCVDepuisPDF(buffer)
        } else if (!isScanned) {
          analyse = await analyserCV(texteCV)
        } else {
          throw new Error('Fichier illisible')
        }

        // Upload to storage
        const timestamp = Date.now()
        const storageName = `${timestamp}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`
        const { data: storageData } = await supabase.storage.from('cvs').upload(storageName, buffer, {
          contentType: mimeType,
          upsert: false,
        })

        let cvUrl: string | null = null
        if (storageData?.path) {
          const { data: urlData } = await supabase.storage.from('cvs').createSignedUrl(storageData.path, 60 * 60 * 24 * 365 * 10)
          cvUrl = urlData?.signedUrl || null
        }

        // Create candidate
        const { data: candidat, error: dbError } = await supabase
          .from('candidats')
          .insert({
            nom: analyse.nom || 'Candidat',
            prenom: analyse.prenom || null,
            email: analyse.email || message.from?.emailAddress?.address || null,
            telephone: analyse.telephone || null,
            localisation: analyse.localisation || null,
            titre_poste: analyse.titre_poste || null,
            annees_exp: analyse.annees_exp || 0,
            competences: analyse.competences || [],
            formation: analyse.formation || null,
            cv_url: cvUrl,
            cv_nom_fichier: filename,
            resume_ia: analyse.resume || null,
            cv_texte_brut: texteCV.slice(0, 10000),
            statut_pipeline: 'nouveau',
            tags: ['email', 'microsoft'],
            notes: `Importé automatiquement depuis: ${message.from?.emailAddress?.address || 'inconnu'}\nSujet: ${message.subject || '—'}`,
            source: 'email_microsoft',
          })
          .select()
          .single()

        if (dbError) throw dbError

        await supabase.from('emails_recus').insert({
          integration_id: integration.id,
          microsoft_message_id: message.id,
          expediteur: message.from?.emailAddress?.address,
          sujet: message.subject,
          recu_le: message.receivedDateTime,
          traite: true,
          candidat_id: (candidat as any)?.id || null,
        })

        processed++
        created.push(`${analyse.prenom || ''} ${analyse.nom}`.trim())

      } catch (err) {
        console.error('[MS Sync] Error processing attachment:', err)
        errors++
        // Still record the email to avoid reprocessing
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

    console.log(`[MS Sync] Done: ${processed} créés, ${skipped} ignorés, ${errors} erreurs`)
    return NextResponse.json({ success: true, processed, skipped, errors, created })

  } catch (error) {
    console.error('[MS Sync] Fatal error:', error)
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
