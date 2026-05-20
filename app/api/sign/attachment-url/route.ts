// TalentFlow Sign — PUBLIC : URL d'upload signée pour une pièce jointe candidat
// v2.9.23
//
// Le candidat (page publique /sign/v/[token]) charge un fichier dans un champ
// `attachment`. On lui renvoie une URL d'upload signée Supabase → le navigateur
// PUT le fichier directement vers Storage (pas de limite Vercel 4,5 Mo).
//
// Sécurité : le token de signature autorise l'accès. Chemin imposé côté serveur
// (uploads/{envelopeId}/{tokenId}/…) → le candidat ne choisit pas où écrire.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyToken } from '@/lib/sign/tokens'
import { SIGN_BUCKET } from '@/lib/sign/storage'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const token = body.token as string | undefined
    const filename = (body.filename as string | undefined) || 'fichier'
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ ok: false, error: 'token manquant' }, { status: 400 })
    }

    const result = await verifyToken(token)
    if (!result.valid || !result.token) {
      return NextResponse.json({ ok: false, error: 'token invalide' }, { status: 403 })
    }
    const tokenObj = result.token
    if (tokenObj.signed_at) {
      return NextResponse.json({ ok: false, error: 'document déjà signé' }, { status: 409 })
    }

    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'fichier'
    const path = `uploads/${tokenObj.envelope_id}/${tokenObj.id}/${Date.now()}_${safe}`

    const supabase = createAdminClient()
    const { data, error } = await supabase.storage
      .from(SIGN_BUCKET)
      .createSignedUploadUrl(path)

    if (error || !data) {
      console.error('[sign/attachment-url] createSignedUploadUrl error', error)
      return NextResponse.json({ ok: false, error: 'Erreur génération URL' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      uploadUrl: data.signedUrl,
      token: data.token,
      path,
    })
  } catch (e) {
    console.error('[sign/attachment-url] error', e)
    return NextResponse.json({ ok: false, error: 'Erreur serveur' }, { status: 500 })
  }
}
