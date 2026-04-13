// Génère une URL pré-signée pour upload direct navigateur → Supabase Storage
// Bypasse complètement la limite Vercel sur les gros fichiers

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'
export const preferredRegion = 'dub1'  // Dublin — aligné avec Supabase eu-west-1 (Ireland)

export async function GET(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError
  const { searchParams } = new URL(request.url)
  const filename = searchParams.get('filename')
  if (!filename) return NextResponse.json({ error: 'filename requis' }, { status: 400 })

  const adminClient = createAdminClient()
  const timestamp = Date.now()
  const safeName = `${timestamp}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  const { data, error } = await adminClient.storage
    .from('cvs')
    .createSignedUploadUrl(safeName)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ signedUrl: data.signedUrl, path: data.path, token: data.token })
}
