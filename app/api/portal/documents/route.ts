// /api/portal/documents — Documents du candidat connecté (portail /report).
// v2.10.43 — GET : liste les documents (conformité + généraux) de SA fiche.
//            POST : le candidat charge un document (type + fichier recto [+ verso]).
// PUBLIC (cookie portail candidat). Strictement limité à son candidat_id.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifySession, getPortalJwt } from '@/lib/portal-auth'
import { getCandidatDocuments, getAllDocumentTypes } from '@/lib/compliance/queries'
import { uploadComplianceFile } from '@/lib/compliance/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// v2.13.7 — { authed } distingue « pas connecté » (401) de « connecté sans
// candidat lié » (candidateId null → 200 vide, pas de logout).
async function resolveCandidateId(): Promise<{ authed: boolean; candidateId: string | null }> {
  const jwt = await getPortalJwt('candidat')
  const session = jwt ? await verifySession(jwt) : null
  if (!session || session.accountType !== 'candidat') return { authed: false, candidateId: null }
  let candidateId: string | null = null
  if (session.reportLinkId) {
    const admin = createAdminClient()
    const { data: link } = await (admin as any)
      .from('report_links').select('candidat_id').eq('id', session.reportLinkId).maybeSingle()
    candidateId = (link?.candidat_id as string) || null
  }
  return { authed: true, candidateId }
}

export async function GET() {
  const { authed, candidateId } = await resolveCandidateId()
  if (!authed) return NextResponse.json({ error: 'non connecté' }, { status: 401 })
  if (!candidateId) return NextResponse.json({ documents: [], types: [] }) // connecté sans candidat lié

  const [docs, types] = await Promise.all([getCandidatDocuments(candidateId), getAllDocumentTypes()])
  const documents = (docs || []).map((d: any) => ({
    id: d.id,
    label: d.label || d.document_type?.name || 'Document',
    type_name: d.document_type?.name || '',
    status: d.status || null,
    expiry_date: d.expiry_date || null,
    hasRecto: !!d.file_recto_path,
    hasVerso: !!d.file_verso_path,
    created_at: d.created_at || null,
  }))
  return NextResponse.json({
    documents,
    types: (types || []).map((t: any) => ({ id: t.id, name: t.name, requires_expiry: !!t.requires_expiry })),
  })
}

export async function POST(req: NextRequest) {
  const { authed, candidateId } = await resolveCandidateId()
  if (!authed) return NextResponse.json({ error: 'non connecté' }, { status: 401 })
  if (!candidateId) return NextResponse.json({ error: 'Aucun candidat lié à ce compte' }, { status: 400 })

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  const documentTypeId = String(form.get('document_type_id') || '')
  const expiryDate = (form.get('expiry_date') as string | null)?.trim() || null
  const recto = form.get('recto') as File | null
  const verso = form.get('verso') as File | null
  if (!documentTypeId) return NextResponse.json({ error: 'Type de document requis' }, { status: 400 })
  if (!recto) return NextResponse.json({ error: 'Fichier requis' }, { status: 400 })

  const OK_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
  for (const f of [recto, verso]) {
    if (f && !OK_MIME.includes(f.type)) return NextResponse.json({ error: 'Format non supporté (JPG, PNG, PDF)' }, { status: 400 })
    if (f && f.size > 15 * 1024 * 1024) return NextResponse.json({ error: 'Fichier trop lourd (max 15 Mo)' }, { status: 400 })
  }

  const admin = createAdminClient()
  const types = await getAllDocumentTypes()
  const typeName = (types || []).find((t: any) => t.id === documentTypeId)?.name || 'Document'

  // 1) Crée la ligne (scoped au candidat connecté)
  const { data: row, error: insErr } = await (admin as any)
    .from('candidat_documents')
    .insert({
      candidat_id: candidateId,
      document_type_id: documentTypeId,
      label: typeName,
      expiry_date: expiryDate,
      metadata: { uploaded_by: 'candidate_portal' },
    })
    .select('id')
    .single()
  if (insErr || !row) return NextResponse.json({ error: insErr?.message || 'Échec création' }, { status: 500 })

  // 2) Upload des fichiers + maj des chemins
  try {
    const updates: Record<string, string> = {}
    const rectoPath = await uploadComplianceFile({ candidatId: candidateId, documentId: row.id, side: 'recto' as any, file: recto, mimeType: recto.type })
    updates.file_recto_path = rectoPath
    if (verso) {
      const versoPath = await uploadComplianceFile({ candidatId: candidateId, documentId: row.id, side: 'verso' as any, file: verso, mimeType: verso.type })
      updates.file_verso_path = versoPath
    }
    await (admin as any).from('candidat_documents').update(updates).eq('id', row.id)
  } catch (e: any) {
    await (admin as any).from('candidat_documents').delete().eq('id', row.id)
    return NextResponse.json({ error: e?.message || 'Échec upload' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
