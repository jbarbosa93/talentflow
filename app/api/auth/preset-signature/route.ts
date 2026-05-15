// v2.8.5 — Endpoint pour gérer la signature pré-enregistrée du user
//
// Stocke un data URL PNG (signature dessinée 1×) dans
// auth.users.raw_user_meta_data.preset_signature_data_url.
//
// Utilisé par /api/sign/envelopes pour auto-apposer la signature du créateur
// si présente (skip l'étape de signature manuelle pour les consultants).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// Limite anti-DoS : signature PNG dessinée fait typiquement 10-80 KB en base64.
// 500 KB = ~365 KB binaire, large marge tout en bloquant uploads abusifs.
const MAX_SIGNATURE_SIZE_BYTES = 500_000

/** GET — Récupère la signature pré-enregistrée du user courant */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const presetSig = (user.user_metadata as { preset_signature_data_url?: string })?.preset_signature_data_url
  return NextResponse.json({
    hasSignature: !!presetSig,
    dataUrl: presetSig || null,
  })
}

/** POST — Enregistre/remplace la signature du user courant
 *  Body: { dataUrl: "data:image/png;base64,..." } */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  let body: { dataUrl?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
  }

  const dataUrl = body.dataUrl
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
    return NextResponse.json({ error: 'dataUrl invalide (PNG base64 attendu)' }, { status: 400 })
  }
  if (dataUrl.length > MAX_SIGNATURE_SIZE_BYTES) {
    return NextResponse.json({
      error: `Signature trop volumineuse (${Math.round(dataUrl.length / 1024)} KB > ${MAX_SIGNATURE_SIZE_BYTES / 1024} KB)`,
    }, { status: 413 })
  }

  // Update via service role pour pouvoir modifier raw_user_meta_data
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...user.user_metadata,
      preset_signature_data_url: dataUrl,
      preset_signature_set_at: new Date().toISOString(),
    },
  })
  if (error) {
    console.error('[preset-signature] update failed', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

/** DELETE — Supprime la signature pré-enregistrée */
export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const admin = createAdminClient()
  const meta = { ...user.user_metadata } as Record<string, unknown>
  delete meta.preset_signature_data_url
  delete meta.preset_signature_set_at
  const { error } = await admin.auth.admin.updateUserById(user.id, { user_metadata: meta })
  if (error) {
    console.error('[preset-signature] delete failed', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
