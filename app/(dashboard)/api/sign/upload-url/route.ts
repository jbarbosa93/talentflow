// TalentFlow Sign — Signed Upload URL (bypass Vercel Functions 4.5 MB limit)
// v2.7.4
//
// POST /api/sign/upload-url
// Body : { folder: 'templates'|'envelopes'|'signed', ownerId: string, filename: string }
//
// Génère une signed URL Supabase Storage permettant au navigateur de PUT
// directement le PDF sans passer par Vercel Functions. Permet d'uploader
// jusqu'à ~5 GB (limite Supabase Storage) au lieu de 4.5 MB (limite Vercel).
//
// Workflow client :
//   1. POST /api/sign/upload-url → renvoie { uploadUrl, path, token }
//   2. PUT uploadUrl avec body = File (header Content-Type: application/pdf)
//   3. Utiliser `path` dans le state docs côté front

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { SIGN_BUCKET, type SignFolder } from '@/lib/sign/storage'

export const runtime = 'nodejs'

const VALID_FOLDERS: SignFolder[] = ['templates', 'envelopes', 'signed']

export async function POST(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const body = await req.json().catch(() => ({}))
    const folder = body.folder as string | undefined
    const ownerId = body.ownerId as string | undefined
    const filename = body.filename as string | undefined

    if (!folder || !(VALID_FOLDERS as string[]).includes(folder)) {
      return NextResponse.json({ error: 'folder invalide' }, { status: 400 })
    }
    if (!ownerId) return NextResponse.json({ error: 'ownerId requis' }, { status: 400 })
    if (!filename) return NextResponse.json({ error: 'filename requis' }, { status: 400 })

    // Sanitize filename + génère path déterministe (timestamp évite collisions)
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200)
    const path = `${folder}/${ownerId}/${Date.now()}_${safe}`

    const supabase = createAdminClient()
    // createSignedUploadUrl : génère un token d'upload valable ~2h.
    // Le navigateur fera ensuite un PUT (ou via supabase-js client.uploadToSignedUrl).
    const { data, error } = await supabase.storage
      .from(SIGN_BUCKET)
      .createSignedUploadUrl(path)

    if (error || !data) {
      console.error('[sign/upload-url] error', error)
      return NextResponse.json({
        error: error?.message || 'Erreur création URL signée',
      }, { status: 500 })
    }

    return NextResponse.json({
      uploadUrl: data.signedUrl,
      token: data.token,
      path,
      bucket: SIGN_BUCKET,
    })
  } catch (e: any) {
    console.error('[sign/upload-url] exception', e)
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
