// TalentFlow Sign — Upload PDF (templates ou envelopes)
// v2.2.0 — Phase 1
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { uploadSignDocument, type SignFolder } from '@/lib/sign/storage'

export const runtime = 'nodejs'
export const maxDuration = 60

const VALID_FOLDERS: SignFolder[] = ['templates', 'envelopes', 'signed']

export async function POST(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const folder = formData.get('folder') as string | null
    const ownerId = formData.get('ownerId') as string | null

    if (!file) return NextResponse.json({ error: 'file requis' }, { status: 400 })
    if (!folder || !(VALID_FOLDERS as string[]).includes(folder)) {
      return NextResponse.json({ error: 'folder invalide' }, { status: 400 })
    }
    if (!ownerId) return NextResponse.json({ error: 'ownerId requis' }, { status: 400 })

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'PDF uniquement' }, { status: 400 })
    }
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'Fichier > 50 MB' }, { status: 400 })
    }

    const path = await uploadSignDocument(folder as SignFolder, ownerId, file, file.name)
    return NextResponse.json({ path, name: file.name, size: file.size })
  } catch (e) {
    console.error('[sign/upload] error', e)
    return NextResponse.json({ error: 'Erreur upload' }, { status: 500 })
  }
}
