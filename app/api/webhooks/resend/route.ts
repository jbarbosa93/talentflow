// TalentFlow — Webhook Resend (statut de livraison réel des emails)
// v2.13.25 — Resend POST ici les events email.delivered / email.bounced /
// email.complained. On vérifie la signature Svix puis on met à jour
// email_delivery_log (matché par resend_id = data.email_id).
//
// Route PUBLIQUE par design (Resend n'est pas authentifié) — la sécurité repose
// ENTIÈREMENT sur la vérification de la signature Svix avec RESEND_WEBHOOK_SECRET.

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// Vérifie la signature Svix (format Resend) : HMAC-SHA256 de `id.timestamp.body`
// avec le secret (whsec_… → base64). Le header svix-signature peut contenir
// plusieurs signatures séparées par des espaces (« v1,xxx v1,yyy »).
function verifySvixSignature(
  secret: string,
  headers: { id: string; timestamp: string; signature: string },
  body: string,
): boolean {
  try {
    const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
    const signedContent = `${headers.id}.${headers.timestamp}.${body}`
    const expected = crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64')
    const provided = headers.signature.split(' ').map(s => s.split(',')[1]).filter(Boolean)
    return provided.some(sig => {
      try {
        const a = Buffer.from(sig)
        const b = Buffer.from(expected)
        return a.length === b.length && crypto.timingSafeEqual(a, b)
      } catch { return false }
    })
  } catch { return false }
}

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'Webhook non configuré' }, { status: 503 })

  const body = await req.text()
  const svixId = req.headers.get('svix-id') || ''
  const svixTimestamp = req.headers.get('svix-timestamp') || ''
  const svixSignature = req.headers.get('svix-signature') || ''

  if (!svixId || !svixTimestamp || !svixSignature ||
      !verifySvixSignature(secret, { id: svixId, timestamp: svixTimestamp, signature: svixSignature }, body)) {
    return NextResponse.json({ error: 'Signature invalide' }, { status: 401 })
  }

  let event: any
  try { event = JSON.parse(body) } catch { return NextResponse.json({ error: 'JSON invalide' }, { status: 400 }) }

  const type = event?.type as string | undefined
  const emailId = event?.data?.email_id as string | undefined
  if (!type || !emailId) return NextResponse.json({ ok: true })

  const statusMap: Record<string, string> = {
    'email.delivered': 'delivered',
    'email.bounced': 'bounced',
    'email.complained': 'complained', // marqué comme spam par le destinataire
  }
  const newStatus = statusMap[type]
  if (newStatus) {
    try {
      const supabase = createAdminClient()
      const patch: Record<string, unknown> = { status: newStatus, updated_at: new Date().toISOString() }
      if (newStatus === 'delivered') patch.delivered_at = new Date().toISOString()
      await (supabase as any).from('email_delivery_log').update(patch).eq('resend_id', emailId)
    } catch { /* best-effort */ }
  }

  return NextResponse.json({ ok: true })
}
