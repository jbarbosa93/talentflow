// app/api/microsoft/send/route.ts
// Envoie un email via Microsoft Graph API

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getValidAccessToken, callGraph } from '@/lib/microsoft'
import type { Integration } from '@/types/database'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const { candidat_id, destinataire, sujet, corps } = await request.json()

    if (!destinataire || !sujet || !corps) {
      return NextResponse.json(
        { error: 'destinataire, sujet et corps sont requis' },
        { status: 400 }
      )
    }

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
        { error: 'Compte Microsoft non connecté. Configurez l\'intégration d\'abord.' },
        { status: 404 }
      )
    }

    const accessToken = await getValidAccessToken(integration.id)

    // Send via Graph API
    await callGraph(accessToken, '/me/sendMail', {
      method: 'POST',
      body: JSON.stringify({
        message: {
          subject: sujet,
          body: {
            contentType: 'HTML',
            content: corps.replace(/\n/g, '<br>'),
          },
          toRecipients: [
            { emailAddress: { address: destinataire } },
          ],
          from: {
            emailAddress: { address: integration.email, name: integration.nom_compte },
          },
        },
        saveToSentItems: true,
      }),
    })

    // Log sent email
    await supabase.from('emails_envoyes').insert({
      candidat_id: candidat_id || null,
      integration_id: integration.id,
      sujet,
      corps,
      destinataire,
      statut: 'envoye',
    })

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[MS Send] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur envoi email' },
      { status: 500 }
    )
  }
}
