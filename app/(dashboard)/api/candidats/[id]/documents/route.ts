// /api/candidats/[id]/documents — Compliance documents par candidat
// GET → liste + driver flag + checklist | POST → créer document (multipart)
// v2.5.0

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildDriverChecklist,
  getCandidatDocuments,
} from '@/lib/compliance/queries'
import { isDriver } from '@/lib/compliance/driver-detection'
import { uploadComplianceFile } from '@/lib/compliance/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth()
  if (authError) return authError
  try {
    const { id } = await params
    const supabase = createAdminClient()
    const { data: cand } = await (supabase as any)
      .from('candidats')
      .select('id, pipeline_metier, titre_poste, is_driver_override')
      .eq('id', id)
      .maybeSingle()
    if (!cand) return NextResponse.json({ error: 'Candidat introuvable' }, { status: 404 })

    const driverFlag = isDriver(cand)
    const documents = await getCandidatDocuments(id)
    const checklist = driverFlag ? await buildDriverChecklist(id) : []

    return NextResponse.json({
      candidat: {
        id: cand.id,
        pipeline_metier: cand.pipeline_metier,
        titre_poste: cand.titre_poste,
        is_driver_override: cand.is_driver_override,
        is_driver: driverFlag,
      },
      documents,
      checklist,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur serveur' }, { status: 500 })
  }
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
    const label          = String(form.get('label') || '').trim()
    const subCategory    = (form.get('sub_category') as string | null)?.trim() || null
    const expiryDate     = (form.get('expiry_date') as string | null)?.trim() || null
    const issuedDate     = (form.get('issued_date') as string | null)?.trim() || null
    const documentNumber = (form.get('document_number') as string | null)?.trim() || null
    const notes          = (form.get('notes') as string | null)?.trim() || null
    const fileRecto      = form.get('file_recto') as File | null
    const fileVerso      = form.get('file_verso') as File | null

    if (!documentTypeId) return NextResponse.json({ error: 'document_type_id requis' }, { status: 400 })
    if (!label) return NextResponse.json({ error: 'label requis' }, { status: 400 })

    // Insert document row first to get id
    const { data: insertData, error: insErr } = await (supabase as any)
      .from('candidat_documents')
      .insert({
        candidat_id: id,
        document_type_id: documentTypeId,
        label,
        sub_category: subCategory,
        expiry_date: expiryDate,
        issued_date: issuedDate,
        document_number: documentNumber,
        notes,
      })
      .select('id')
      .single()
    if (insErr || !insertData) {
      return NextResponse.json({ error: insErr?.message || 'Erreur création' }, { status: 500 })
    }
    const docId = insertData.id as string

    // Upload files if provided
    const updates: Record<string, string> = {}
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
    if (Object.keys(updates).length > 0) {
      await (supabase as any)
        .from('candidat_documents')
        .update(updates)
        .eq('id', docId)
    }

    return NextResponse.json({ id: docId, ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur serveur' }, { status: 500 })
  }
}
