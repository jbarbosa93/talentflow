// GET /api/portal/documents/[docId]/file?side=recto|verso
// v2.10.43 — Sert un fichier document du candidat connecté, en INLINE (visu).
// Vérifie strictement que le document appartient au candidat de la session.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifySession, getPortalJwt } from '@/lib/portal-auth'
import { downloadComplianceFile } from '@/lib/compliance/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function resolveCandidateId(): Promise<string | null> {
  const jwt = await getPortalJwt('candidat')
  if (!jwt) return null
  const session = await verifySession(jwt)
  if (!session || session.accountType !== 'candidat' || !session.reportLinkId) return null
  const admin = createAdminClient()
  const { data: link } = await (admin as any)
    .from('report_links').select('candidat_id').eq('id', session.reportLinkId).maybeSingle()
  return (link?.candidat_id as string) || null
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ docId: string }> }) {
  const candidateId = await resolveCandidateId()
  if (!candidateId) return NextResponse.json({ error: 'non connecté' }, { status: 401 })

  const { docId } = await ctx.params
  const side = new URL(req.url).searchParams.get('side') === 'verso' ? 'verso' : 'recto'

  const admin = createAdminClient()
  const { data: doc } = await (admin as any)
    .from('candidat_documents')
    .select('candidat_id, file_recto_path, file_verso_path')
    .eq('id', docId)
    .maybeSingle()
  // Garde-fou : le document doit appartenir au candidat connecté.
  if (!doc || doc.candidat_id !== candidateId) {
    return NextResponse.json({ error: 'introuvable' }, { status: 404 })
  }
  const path = side === 'verso' ? doc.file_verso_path : doc.file_recto_path
  if (!path) return NextResponse.json({ error: 'fichier absent' }, { status: 404 })

  try {
    const blob = await downloadComplianceFile(path)
    const buf = Buffer.from(await blob.arrayBuffer())
    const ext = path.split('.').pop()?.toLowerCase() || ''
    const ct = ext === 'pdf' ? 'application/pdf'
      : ext === 'png' ? 'image/png'
      : ext === 'webp' ? 'image/webp'
      : 'image/jpeg'
    return new NextResponse(buf, {
      headers: { 'Content-Type': ct, 'Content-Disposition': 'inline', 'Cache-Control': 'private, max-age=60' },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur fichier' }, { status: 500 })
  }
}
