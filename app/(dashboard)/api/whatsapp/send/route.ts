// app/(dashboard)/api/whatsapp/send/route.ts
// Envoi de messages WhatsApp à un candidat
// POST /api/whatsapp/send

import { NextRequest, NextResponse } from 'next/server'
import { envoyerMessage, envoyerTemplate } from '@/lib/whatsapp'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivityServer, getRouteUser } from '@/lib/logActivity'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'

const dbg = (...args: Parameters<typeof console.log>) => { if (process.env.DEBUG_MODE === 'true') console.log(...args) }

export async function POST(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError
  try {
    const body = await request.json()
    const {
      telephone,
      message,
      candidat_id,
      template_name,
      template_langue = 'fr',
      template_params = [],
    } = body

    if (!telephone) {
      return NextResponse.json(
        { error: 'Le champ "telephone" est requis' },
        { status: 400 }
      )
    }

    if (!message && !template_name) {
      return NextResponse.json(
        { error: 'Fournir "message" (texte libre) ou "template_name" (template WhatsApp)' },
        { status: 400 }
      )
    }

    let result

    if (template_name) {
      dbg(`[WhatsApp Send] Template "${template_name}" → ${telephone}`)
      result = await envoyerTemplate(telephone, template_name, template_langue, template_params)
    } else {
      dbg(`[WhatsApp Send] Message texte → ${telephone}`)
      result = await envoyerMessage(telephone, message)
    }

    const messageId = result.messages?.[0]?.id

    // Si un candidat est spécifié, enregistrer l'envoi comme note
    if (candidat_id && messageId) {
      const supabase = createAdminClient()
      const contenu = template_name
        ? `[WhatsApp envoyé] Template: ${template_name}`
        : `[WhatsApp envoyé] ${message}`

      await supabase.from('notes_candidat').insert({
        candidat_id,
        auteur: 'TalentFlow (WhatsApp)',
        contenu,
      })
    }

    dbg(`[WhatsApp Send] Succès, message ID : ${messageId}`)

    // Log activité équipe
    try {
      const routeUser = await getRouteUser()
      const contenu = template_name
        ? `Template: ${template_name}`
        : (message || '').slice(0, 120)
      await logActivityServer({
        ...routeUser,
        type: 'whatsapp_envoye',
        titre: `WhatsApp envoyé`,
        description: contenu || undefined,
        candidat_id: candidat_id || undefined,
        metadata: { telephone, template_name: template_name || null, message_id: messageId || null },
      })
    } catch (err) { console.warn('[whatsapp/send] logActivity failed:', (err as Error).message) }

    return NextResponse.json({
      success: true,
      message_id: messageId,
      telephone: result.contacts?.[0]?.wa_id || telephone,
    })
  } catch (error) {
    console.error('[WhatsApp Send] Erreur:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur envoi WhatsApp' },
      { status: 500 }
    )
  }
}

export async function GET() {
  const authError = await requireAuth()
  if (authError) return authError
  return NextResponse.json({
    status: 'ok',
    route: 'POST /api/whatsapp/send',
    description: 'Envoi d\'un message WhatsApp à un candidat',
    champs_requis: ['telephone'],
    champs_optionnels: [
      'message (texte libre)',
      'template_name (template WhatsApp Business)',
      'template_langue (défaut: fr)',
      'template_params (array de strings)',
      'candidat_id (uuid — enregistre une note)',
    ],
  })
}
