// app/api/microsoft/send/route.ts
// Envoie un email via Microsoft Graph API — support BCC multi-destinataires

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getValidAccessToken, callGraph } from '@/lib/microsoft'
import type { Integration } from '@/types/database'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Support ancien format (destinataire string) ET nouveau (destinataires array)
    const destinataires: string[] = body.destinataires
      ? body.destinataires
      : body.destinataire
        ? [body.destinataire]
        : []
    const { candidat_ids, sujet, corps, use_bcc = false } = body
    const candidat_id = body.candidat_id || (candidat_ids?.[0]) || null

    if (destinataires.length === 0 || !sujet || !corps) {
      return NextResponse.json(
        { error: 'destinataire(s), sujet et corps sont requis' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // Get Microsoft OneDrive integration (used for sending emails via j.barbosa)
    const { data: allMicrosoft } = await supabase
      .from('integrations')
      .select('*')
      .like('type', 'microsoft%')
      .eq('actif', true)
    const integrationRaw = (allMicrosoft || []).find((i: any) => i.type === 'microsoft_onedrive')
      || (allMicrosoft || []).find((i: any) => (i.metadata as any)?.purpose === 'onedrive')
      || (allMicrosoft || [])[0] // fallback

    const integration = integrationRaw as unknown as Integration | null

    if (!integration) {
      return NextResponse.json(
        { error: 'Compte Microsoft OneDrive non connecté. Configurez l\'intégration d\'abord.' },
        { status: 404 }
      )
    }

    const accessToken = await getValidAccessToken(integration.id)

    // Build recipients
    const recipients = destinataires.map((email: string) => ({
      emailAddress: { address: email },
    }))

    // Build message — BCC si plusieurs destinataires ou demandé explicitement
    const useBcc = use_bcc || destinataires.length > 1
    const message: any = {
      subject: sujet,
      body: {
        contentType: 'HTML',
        content: corps.replace(/\n/g, '<br>'),
      },
      from: {
        emailAddress: { address: integration.email, name: integration.nom_compte },
      },
    }

    if (useBcc) {
      message.bccRecipients = recipients
    } else {
      message.toRecipients = recipients
    }

    // Joindre les CVs des candidats sélectionnés
    const allCandidatIds = candidat_ids || (candidat_id ? [candidat_id] : [])
    if (allCandidatIds.length > 0) {
      const { data: candidats } = await supabase
        .from('candidats')
        .select('id, nom, prenom, cv_url, cv_nom_fichier')
        .in('id', allCandidatIds)

      const attachments: any[] = []
      for (const c of (candidats || [])) {
        if (!c.cv_url) continue
        try {
          // Télécharger le CV depuis l'URL signée
          const cvRes = await fetch(c.cv_url)
          if (!cvRes.ok) continue
          const buffer = Buffer.from(await cvRes.arrayBuffer())
          const filename = c.cv_nom_fichier || `CV_${c.prenom || ''}_${c.nom || ''}.pdf`
          const contentType = filename.toLowerCase().endsWith('.docx')
            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : 'application/pdf'

          attachments.push({
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: filename,
            contentType,
            contentBytes: buffer.toString('base64'),
          })
        } catch (err) {
          console.error(`[MS Send] Erreur téléchargement CV ${c.nom}:`, err)
        }
      }

      if (attachments.length > 0) {
        message.attachments = attachments
      }
    }

    // Send via Graph API
    await callGraph(accessToken, '/me/sendMail', {
      method: 'POST',
      body: JSON.stringify({ message, saveToSentItems: true }),
    })

    // Log sent emails — un log par destinataire
    const logs = destinataires.map((dest: string) => ({
      candidat_id,
      integration_id: integration.id,
      sujet,
      corps,
      destinataire: dest,
      statut: 'envoye' as const,
    }))
    await supabase.from('emails_envoyes').insert(logs)

    return NextResponse.json({ success: true, count: destinataires.length })

  } catch (error) {
    console.error('[MS Send] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur envoi email' },
      { status: 500 }
    )
  }
}
