// /api/candidats/[id]/documents/[docId] — PATCH / DELETE
// v2.5.0

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  uploadComplianceFile,
  COMPLIANCE_BUCKET,
} from '@/lib/compliance/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const authError = await requireAuth()
  if (authError) return authError
  try {
    const { id, docId } = await params
    const supabase = createAdminClient()

    const { data: existing } = await (supabase as any)
      .from('candidat_documents')
      .select('id, candidat_id')
      .eq('id', docId)
      .eq('candidat_id', id)
      .maybeSingle()
    if (!existing) return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })

    const form = await req.formData()
    const updates: Record<string, any> = {}
    const setIf = (k: string) => {
      if (form.has(k)) {
        const v = form.get(k) as string
        updates[k] = v && v.trim() ? v.trim() : null
      }
    }
    setIf('label')
    setIf('sub_category')
    setIf('expiry_date')
    setIf('issued_date')
    setIf('document_number')
    setIf('notes')
    if (form.has('document_type_id')) {
      const v = String(form.get('document_type_id') || '').trim()
      if (v) updates.document_type_id = v
    }

    const fileRecto = form.get('file_recto') as File | null
    const fileVerso = form.get('file_verso') as File | null

    if (fileRecto && fileRecto.size > 0) {
      const path = await uploadComplianceFile({
        candidatId: id, documentId: docId, side: 'recto', file: fileRecto, mimeType: fileRecto.type || 'application/octet-stream',
      })
      updates.file_recto_path = path
    }
    if (fileVerso && fileVerso.size > 0) {
      const path = await uploadComplianceFile({
        candidatId: id, documentId: docId, side: 'verso', file: fileVerso, mimeType: fileVerso.type || 'application/octet-stream',
      })
      updates.file_verso_path = path
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: true, noop: true })
    }

    const { error: updErr } = await (supabase as any)
      .from('candidat_documents')
      .update(updates)
      .eq('id', docId)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur serveur' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const authError = await requireAuth()
  if (authError) return authError
  try {
    const { id, docId } = await params
    const supabase = createAdminClient()

    // v2.7.1 — Récupère les paths fichiers AVANT delete (pour décider de purger Storage)
    const { data: existing } = await (supabase as any)
      .from('candidat_documents')
      .select('id, file_recto_path, file_verso_path')
      .eq('id', docId)
      .eq('candidat_id', id)
      .maybeSingle()
    if (!existing) return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })

    const rectoPath: string | null = existing.file_recto_path || null
    const versoPath: string | null = existing.file_verso_path || null

    // DELETE row d'abord
    const { error: delErr } = await (supabase as any)
      .from('candidat_documents')
      .delete()
      .eq('id', docId)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

    // v2.7.1 — Purge Storage seulement si AUCUNE autre row ne pointe vers le même fichier
    // (cas multi-permis : N rows partagent le même path, on garde le fichier tant qu'au moins
    // une row le référence)
    const pathsToCheck: string[] = []
    if (rectoPath) pathsToCheck.push(rectoPath)
    if (versoPath && versoPath !== rectoPath) pathsToCheck.push(versoPath)

    const orphanPaths: string[] = []
    for (const p of pathsToCheck) {
      const { count: cnt1 } = await (supabase as any)
        .from('candidat_documents')
        .select('id', { count: 'exact', head: true })
        .eq('file_recto_path', p)
      const { count: cnt2 } = await (supabase as any)
        .from('candidat_documents')
        .select('id', { count: 'exact', head: true })
        .eq('file_verso_path', p)
      const totalRefs = (cnt1 || 0) + (cnt2 || 0)
      if (totalRefs === 0) orphanPaths.push(p)
    }

    if (orphanPaths.length > 0) {
      try {
        await supabase.storage.from(COMPLIANCE_BUCKET).remove(orphanPaths)
      } catch (e) {
        console.warn('[documents/DELETE] storage purge failed:', e instanceof Error ? e.message : String(e))
      }
    }

    return NextResponse.json({ ok: true, storage_purged: orphanPaths.length, storage_kept: pathsToCheck.length - orphanPaths.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur serveur' }, { status: 500 })
  }
}
