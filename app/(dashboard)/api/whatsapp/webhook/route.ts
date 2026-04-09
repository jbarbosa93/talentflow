// app/(dashboard)/api/whatsapp/webhook/route.ts
// Webhook WhatsApp Business API (Meta)
// GET  /api/whatsapp/webhook — vérification Meta (challenge)
// POST /api/whatsapp/webhook — réception des messages entrants

import { NextRequest, NextResponse } from 'next/server'
import { verifierWebhook, parserWebhook, marquerCommeLu } from '@/lib/whatsapp'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const dbg = (...args: Parameters<typeof console.log>) => { if (process.env.DEBUG_MODE === 'true') console.log(...args) }

// ─── GET : vérification du webhook par Meta ───────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const challenge = verifierWebhook(searchParams)

    if (challenge) {
      // Meta attend une réponse texte plain avec le challenge
      return new NextResponse(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    return NextResponse.json(
      { error: 'Vérification échouée : token invalide' },
      { status: 403 }
    )
  } catch (error) {
    console.error('[WhatsApp Webhook GET] Erreur:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}

// ─── POST : réception des messages entrants ───────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Vérifier que c'est bien un événement WhatsApp
    if (body?.object !== 'whatsapp_business_account') {
      return NextResponse.json({ status: 'ignored' }, { status: 200 })
    }

    const messages = parserWebhook(body)

    if (messages.length === 0) {
      return NextResponse.json({ status: 'no_messages' }, { status: 200 })
    }

    const supabase = createAdminClient()

    for (const msg of messages) {
      dbg(`[WhatsApp Webhook] Message de ${msg.from} (type: ${msg.type})`)

      // Marquer comme lu
      await marquerCommeLu(msg.id).catch(() => null)

      // Chercher si ce numéro correspond à un candidat
      const telephone = `+${msg.from}`
      const { data: candidats } = await supabase
        .from('candidats')
        .select('id, nom, prenom')
        .or(`telephone.eq.${telephone},telephone.eq.${msg.from}`)
        .limit(1)

      const candidat = candidats?.[0] as { id: string; nom: string; prenom: string | null } | undefined

      if (msg.type === 'text' && msg.text?.body) {
        const contenu = `[WhatsApp] ${msg.text.body}`

        if (candidat) {
          // Enregistrer comme note sur le candidat
          await supabase.from('notes_candidat').insert({
            candidat_id: candidat.id,
            auteur: `WhatsApp (${telephone})`,
            contenu,
          })
          dbg(`[WhatsApp Webhook] Note ajoutée au candidat ${candidat.id}`)
        } else {
          // Logguer le message non associé
          dbg(`[WhatsApp Webhook] Numéro inconnu ${telephone} : "${msg.text.body}"`)
        }
      }
    }

    // Meta exige une réponse 200 rapidement
    return NextResponse.json({ status: 'ok' }, { status: 200 })
  } catch (error) {
    console.error('[WhatsApp Webhook POST] Erreur:', error)
    // Retourner 200 quand même pour éviter les retries Meta
    return NextResponse.json({ status: 'error_logged' }, { status: 200 })
  }
}
