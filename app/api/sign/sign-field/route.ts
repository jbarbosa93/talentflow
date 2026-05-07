// TalentFlow Sign — PUBLIC : enregistre la signature globale + valeurs des champs
// v2.2.0 — Phase 4a
//
// Option A (DocuSign-like) : 1 seule signature globale par token, appliquée
// automatiquement à tous les champs signature/initial du destinataire.
//
// Body :
//   - { token, signatureDataUrl, method }       → adopte la signature globale
//   - { token, fieldValues: { fieldId: val } }  → met à jour les valeurs des champs (texte, date, checkbox, etc.)
// Les 2 peuvent être combinés dans un seul appel.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyToken } from '@/lib/sign/tokens'
import type { SignToken } from '@/lib/sign/types'

export const runtime = 'nodejs'

const VALID_METHODS = ['drawn', 'typed', 'auto'] as const
const MAX_DATA_URL_LEN = 1_500_000 // ~1 MB en base64 → ~1.1 MB caractères

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

    // Bloque si déjà finalisé
    if (result.token.signed_at) {
      return NextResponse.json({ ok: false, error: 'déjà signé' }, { status: 409 })
    }

    const supabase = createAdminClient()
    const updates: Record<string, unknown> = {}

    // ─── Adopter signature globale ───
    if (typeof body.signatureDataUrl === 'string' && body.signatureDataUrl.length > 0) {
      if (!body.signatureDataUrl.startsWith('data:image/')) {
        return NextResponse.json({ ok: false, error: 'signatureDataUrl invalide' }, { status: 400 })
      }
      if (body.signatureDataUrl.length > MAX_DATA_URL_LEN) {
        return NextResponse.json({ ok: false, error: 'signature trop volumineuse (>1 MB)' }, { status: 400 })
      }
      const method = (VALID_METHODS as readonly string[]).includes(body.method)
        ? body.method
        : 'drawn'
      updates.signature_data_url = body.signatureDataUrl
      updates.signature_method = method
    }

    // ─── Valeurs des champs ───
    // Merge avec les valeurs existantes (UPSERT côté field_values jsonb)
    if (body.fieldValues && typeof body.fieldValues === 'object' && !Array.isArray(body.fieldValues)) {
      const tokenWithFV = result.token as SignToken & { field_values?: Record<string, unknown> }
      const current = tokenWithFV.field_values || {}
      updates.field_values = { ...current, ...body.fieldValues }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, error: 'rien à mettre à jour' }, { status: 400 })
    }

    const { error } = await supabase
      .from('sign_tokens' as any)
      .update(updates)
      .eq('id', result.token.id)

    if (error) {
      console.error('[sign/sign-field] update error', error)
      return NextResponse.json({ ok: false, error: 'Erreur enregistrement' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[sign/sign-field] error', e)
    return NextResponse.json({ ok: false, error: 'Erreur serveur' }, { status: 500 })
  }
}
