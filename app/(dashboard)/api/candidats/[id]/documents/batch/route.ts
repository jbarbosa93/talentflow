// POST /api/candidats/[id]/documents/batch
// v2.7.1 — Crée N candidat_documents en une seule requête, partageant le même fichier.
// Cas d'usage : un permis de conduire avec plusieurs sous-catégories (B + C + CE)
// chacune ayant sa propre date d'échéance.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { uploadComplianceFile } from '@/lib/compliance/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface BatchEntry {
  sub_category: string | null
  expiry_date: string | null
  issued_date: string | null
  document_number: string | null
  label: string
  notes: string | null
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const { id } = await params
    const supabase = createAdminClient()
    const { data: cand } = await (supabase as any)
      .from('candidats')
      .select('id')
      .eq('id', id)
      .maybeSingle()
    if (!cand) return NextResponse.json({ error: 'Candidat introuvable' }, { status: 404 })

    const form = await req.formData()
    const documentTypeId = String(form.get('document_type_id') || '')
    const entriesRaw = String(form.get('entries') || '[]')
    const fileRecto = form.get('file_recto') as File | null
    const fileVerso = form.get('file_verso') as File | null

    if (!documentTypeId) return NextResponse.json({ error: 'document_type_id requis' }, { status: 400 })

    let entries: BatchEntry[]
    try {
      entries = JSON.parse(entriesRaw)
    } catch {
      return NextResponse.json({ error: 'entries invalide (JSON attendu)' }, { status: 400 })
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: 'entries doit être un tableau non vide' }, { status: 400 })
    }
    for (const e of entries) {
      if (!e.label || typeof e.label !== 'string') {
        return NextResponse.json({ error: 'Chaque entrée doit avoir un label' }, { status: 400 })
      }
    }

    // 1. Insert N rows (sans fichier pour l'instant)
    const insertPayload = entries.map(e => ({
      candidat_id: id,
      document_type_id: documentTypeId,
      label: e.label.trim().slice(0, 200),
      sub_category: e.sub_category ? String(e.sub_category).trim() : null,
      expiry_date: e.expiry_date && e.expiry_date.trim() ? e.expiry_date.trim() : null,
      issued_date: e.issued_date && e.issued_date.trim() ? e.issued_date.trim() : null,
      document_number: e.document_number ? String(e.document_number).trim() : null,
      notes: e.notes ? String(e.notes).trim() : null,
    }))

    const { data: inserted, error: insErr } = await (supabase as any)
      .from('candidat_documents')
      .insert(insertPayload)
      .select('id')
    if (insErr) {
      return NextResponse.json({ error: insErr.message || 'Erreur insertion batch' }, { status: 500 })
    }
    const insertedIds = ((inserted || []) as any[]).map(r => r.id as string)

    // 2. Upload fichiers (1 fois) sous le path du PREMIER doc, puis update tous les rows
    const updates: Record<string, string> = {}
    if (fileRecto && fileRecto.size > 0 && insertedIds[0]) {
      const path = await uploadComplianceFile({
        candidatId: id,
        documentId: insertedIds[0],
        side: 'recto',
        file: fileRecto,
        mimeType: fileRecto.type || 'application/octet-stream',
      })
      updates.file_recto_path = path
    }
    if (fileVerso && fileVerso.size > 0 && insertedIds[0]) {
      const path = await uploadComplianceFile({
        candidatId: id,
        documentId: insertedIds[0],
        side: 'verso',
        file: fileVerso,
        mimeType: fileVerso.type || 'application/octet-stream',
      })
      updates.file_verso_path = path
    }

    if (Object.keys(updates).length > 0 && insertedIds.length > 0) {
      await (supabase as any)
        .from('candidat_documents')
        .update(updates)
        .in('id', insertedIds)
    }

    return NextResponse.json({ ids: insertedIds, count: insertedIds.length, ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
