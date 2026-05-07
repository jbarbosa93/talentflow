// TalentFlow Sign — Bulk download : zip de tous les PDFs signés des enveloppes sélectionnées
// v2.2.1
//
// POST { ids: string[] } → application/zip avec tous les PDFs stampés finals.
// Skip silencieusement les enveloppes non-completed.
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import JSZip from 'jszip'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  const body = await req.json().catch(() => ({}))
  const ids = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === 'string') : []
  if (ids.length === 0) return NextResponse.json({ error: 'ids manquant' }, { status: 400 })

  const sb = createAdminClient()
  const { data: envelopes } = await sb
    .from('sign_envelopes' as any)
    .select('id, title, status')
    .in('id', ids)

  const completed = ((envelopes || []) as unknown as { id: string; title: string; status: string }[])
    .filter(e => e.status === 'completed')

  if (completed.length === 0) {
    return NextResponse.json({ error: 'Aucune enveloppe complétée parmi la sélection' }, { status: 400 })
  }

  const zip = new JSZip()

  for (const env of completed) {
    // Cherche les PDFs signés dans signed/{envelopeId}/
    const { data: files } = await sb.storage
      .from('talentflow-sign')
      .list(`signed/${env.id}`, { limit: 100 })
    const safeTitle = env.title.replace(/[^\w\s\-.()]/g, '_').slice(0, 60)
    const folder = zip.folder(safeTitle) || zip
    for (const f of (files || [])) {
      try {
        const { data: blob } = await sb.storage
          .from('talentflow-sign')
          .download(`signed/${env.id}/${f.name}`)
        if (blob) {
          const buf = await blob.arrayBuffer()
          folder.file(f.name, buf)
        }
      } catch { /* skip */ }
    }
  }

  const zipBuf = await zip.generateAsync({ type: 'uint8array' })
  return new NextResponse(zipBuf as BlobPart, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="signatures-${new Date().toISOString().slice(0, 10)}.zip"`,
    },
  })
}
