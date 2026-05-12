// /api/candidats/[id]/documents/[docId]/file?side=recto|verso
// Proxy stream pour servir le fichier inline (PDF/image) — service role only
// v2.5.0

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { downloadComplianceFile } from '@/lib/compliance/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_SIDES = new Set(['recto', 'verso'])

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const authError = await requireAuth()
  if (authError) return authError
  try {
    const { id, docId } = await params
    const side = req.nextUrl.searchParams.get('side') || 'recto'
    if (!ALLOWED_SIDES.has(side)) {
      return NextResponse.json({ error: 'side invalide' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data: doc } = await (supabase as any)
      .from('candidat_documents')
      .select('id, candidat_id, file_recto_path, file_verso_path')
      .eq('id', docId)
      .eq('candidat_id', id)
      .maybeSingle()
    if (!doc) return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })

    const path = side === 'recto' ? doc.file_recto_path : doc.file_verso_path
    if (!path) return NextResponse.json({ error: 'Fichier absent' }, { status: 404 })

    const blob = await downloadComplianceFile(path)
    const arrayBuffer = await blob.arrayBuffer()
    const ext = path.split('.').pop()?.toLowerCase() || ''
    const mime = ext === 'pdf' ? 'application/pdf'
               : ext === 'png' ? 'image/png'
               : ext === 'webp' ? 'image/webp'
               : 'image/jpeg'

    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': mime,
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur serveur' }, { status: 500 })
  }
}
