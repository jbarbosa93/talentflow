// app/(dashboard)/api/whatsapp/webhook/route.ts
// Webhook WhatsApp Business API (Meta)
// GET  /api/whatsapp/webhook — vérification Meta (challenge)
// POST /api/whatsapp/webhook — réception des messages entrants

import { NextRequest, NextResponse } from 'next/server'
import { verifierWebhook, parserWebhook, marquerCommeLu } from '@/lib/whatsapp'
import { createAdminClient } from '@/lib/supabase/admin'
import { createHmac, timingSafeEqual } from 'node:crypto'

export const runtime = 'nodejs'

const dbg = (...args: Parameters<typeof console.log>) => { if (process.env.DEBUG_MODE === 'true') console.log(...args) }

/**
 * Vérifie la signature Meta `X-Hub-Signature-256` (HMAC-SHA256 sur le raw body avec WHATSAPP_APP_SECRET).
 * Si `WHATSAPP_APP_SECRET` est vide → on log un warning et on accepte (mode dégradé non-bloquant).
 * Sinon, signature invalide → false (le caller renvoie 403).
 */
function verifyMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (!appSecret) {
    console.warn('[WhatsApp Webhook] WHATSAPP_APP_SECRET non défini — vérification de signature DÉSACTIVÉE.')
    return true
  }
  if (!signatureHeader) return false
  const expected = 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const a = Buffer.from(signatureHeader)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

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
    // Lire le raw body pour vérifier la signature Meta AVANT parsing
    const rawBody = await request.text()
    const signature = request.headers.get('x-hub-signature-256')
    if (!verifyMetaSignature(rawBody, signature)) {
      return NextResponse.json({ error: 'Signature invalide' }, { status: 403 })
    }

    const body = JSON.parse(rawBody)

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
