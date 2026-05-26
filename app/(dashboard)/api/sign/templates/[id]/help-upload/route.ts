// TalentFlow Sign — Upload d'une « aide visuelle » par champ (v2.9.72)
//
// PDF ou image attaché à un SignField.helpAttachment, affiché au candidat via
// un bouton ℹ️ dans le wizard. Servi publiquement via /api/sign/document/[token].
//
// Path Storage : templates/{templateId}/help/{ts}_{filename}.
// Limite : 10 MB. MimeTypes : PDF + image (jpeg/png/webp).

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { uploadFieldHelpAttachment } from '@/lib/sign/storage'

export const runtime = 'nodejs'
export const maxDuration = 30

const VALID_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]
const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const { id: templateId } = await ctx.params
    if (!templateId) {
      return NextResponse.json({ error: 'templateId requis' }, { status: 400 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'file requis' }, { status: 400 })

    if (!VALID_MIMES.includes(file.type)) {
      return NextResponse.json(
        { error: `Type non supporté (${file.type}). Accepté : PDF, JPEG, PNG, WebP.` },
        { status: 400 },
      )
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: 'Fichier > 10 MB' }, { status: 400 })
    }

    const path = await uploadFieldHelpAttachment(
      templateId,
      file,
      file.name || 'help',
      file.type,
    )

    return NextResponse.json({
      path,
      mimeType: file.type,
      fileName: file.name || 'help',
      size: file.size,
    })
  } catch (e) {
    console.error('[sign/templates/help-upload] error', e)
    return NextResponse.json({ error: 'Erreur upload' }, { status: 500 })
  }
}
