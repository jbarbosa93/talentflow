// v2.8.6 — Endpoint preset signature avec stockage en table dédiée
//
// IMPORTANT : avant v2.8.6 on stockait dans auth.users.raw_user_meta_data,
// mais Supabase embarque TOUT le user_metadata dans le cookie JWT auth-token.
// Un data URL PNG (~50KB) → cookie de 17 chunks (70KB) → 494 Vercel.
//
// Solution : table user_preset_signatures séparée, lookup par user_id.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const MAX_SIGNATURE_SIZE_BYTES = 500_000

/** GET — Récupère la signature pré-enregistrée du user courant */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const admin = createAdminClient()
  const { data } = await admin
    .from('user_preset_signatures' as any)
    .select('data_url')
    .eq('user_id', user.id)
    .maybeSingle()

  const row = data as unknown as { data_url?: string } | null
  return NextResponse.json({
    hasSignature: !!row?.data_url,
    dataUrl: row?.data_url || null,
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

  const admin = createAdminClient()
  const { error } = await admin
    .from('user_preset_signatures' as any)
    .upsert({
      user_id: user.id,
      data_url: dataUrl,
      set_at: new Date().toISOString(),
    })
  if (error) {
    console.error('[preset-signature] upsert failed', error)
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
  const { error } = await admin
    .from('user_preset_signatures' as any)
    .delete()
    .eq('user_id', user.id)
  if (error) {
    console.error('[preset-signature] delete failed', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
