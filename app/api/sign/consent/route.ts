// TalentFlow Sign — PUBLIC : enregistre l'acceptation des CGU par le destinataire
// v2.2.0 — Phase 3
//
// Pas d'auth dashboard : auth = token uuid valide non expiré non utilisé.
// Effets :
//  1. UPDATE sign_tokens.terms_accepted_at + terms_accepted_ip (idempotent)
//  2. INSERT sign_audit_log action='consented' avec metadata.terms_version
//
// Le client appelle cet endpoint quand l'utilisateur clique "Commencer" dans le ConsentModal.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyToken } from '@/lib/sign/tokens'
import { logAuditEvent, extractIp } from '@/lib/sign/audit'

export const runtime = 'nodejs'

// Version courante des CGU (à bumper si le texte change pour tracer les acceptations historiques)
const TERMS_VERSION = '1.0.0'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const token = body.token as string | undefined
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ ok: false, error: 'token manquant' }, { status: 400 })
    }

    const result = await verifyToken(token)
    if (!result.valid || !result.token) {
      return NextResponse.json({ ok: false, error: 'token invalide' }, { status: 403 })
    }

    const ip = extractIp(req)
    const userAgent = req.headers.get('user-agent') || null
    const supabase = createAdminClient()

    // 1. UPDATE sign_tokens (idempotent — n'écrase pas si déjà accepté)
    const { error: updErr } = await supabase
      .from('sign_tokens' as any)
      .update({
        terms_accepted_at: new Date().toISOString(),
        terms_accepted_ip: ip,
      })
      .eq('id', result.token.id)
      .is('terms_accepted_at', null) // ne ré-écrit pas si déjà consenté

    if (updErr) {
      console.error('[sign/consent] update token error', updErr)
      return NextResponse.json({ ok: false, error: 'Erreur enregistrement' }, { status: 500 })
    }

    // 2. Log audit (best-effort — n'utilise pas l'IP refus pour bloquer)
    await logAuditEvent(result.token.envelope_id, 'consented', {
      recipientEmail: result.token.recipient_email,
      ip,
      userAgent,
      metadata: {
        termsVersion: TERMS_VERSION,
        tokenId: result.token.id,
      },
    })

    return NextResponse.json({ ok: true, termsVersion: TERMS_VERSION })
  } catch (e) {
    console.error('[sign/consent] error', e)
    return NextResponse.json({ ok: false, error: 'Erreur serveur' }, { status: 500 })
  }
}
