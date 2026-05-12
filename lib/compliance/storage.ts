// TalentFlow Compliance — Storage helpers
// v2.5.0
// Bucket privé "candidat-documents" — accès via service role uniquement.

import { createAdminClient } from '@/lib/supabase/admin'

export const COMPLIANCE_BUCKET = 'candidat-documents'

export type ComplianceSide = 'recto' | 'verso'

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg':  'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

export function extFromMime(mime: string | undefined, fallback = 'bin'): string {
  if (!mime) return fallback
  return MIME_EXT[mime] || fallback
}

export async function uploadComplianceFile(params: {
  candidatId: string
  documentId: string
  side: ComplianceSide
  file: Blob | File
  mimeType: string
}): Promise<string> {
  const supabase = createAdminClient()
  const ext = extFromMime(params.mimeType)
  const path = `${params.candidatId}/${params.documentId}/${params.side}.${ext}`
  const { error } = await supabase.storage
    .from(COMPLIANCE_BUCKET)
    .upload(path, params.file, {
      contentType: params.mimeType,
      upsert: true,
    })
  if (error) throw new Error(`uploadComplianceFile: ${error.message}`)
  return path
}

export async function getComplianceSignedUrl(path: string, ttlSeconds = 600): Promise<string> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage
    .from(COMPLIANCE_BUCKET)
    .createSignedUrl(path, ttlSeconds)
  if (error || !data) throw new Error(`getComplianceSignedUrl: ${error?.message || 'no url'}`)
  return data.signedUrl
}

export async function downloadComplianceFile(path: string): Promise<Blob> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage.from(COMPLIANCE_BUCKET).download(path)
  if (error || !data) throw new Error(`downloadComplianceFile: ${error?.message || 'not found'}`)
  return data
}

export async function deleteComplianceFile(path: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.storage.from(COMPLIANCE_BUCKET).remove([path])
  if (error) throw new Error(`deleteComplianceFile: ${error.message}`)
}

export async function deleteComplianceFolder(candidatId: string, documentId: string): Promise<void> {
  const supabase = createAdminClient()
  const prefix = `${candidatId}/${documentId}`
  const { data: files } = await supabase.storage.from(COMPLIANCE_BUCKET).list(prefix)
  if (files && files.length > 0) {
    const paths = files.map(f => `${prefix}/${f.name}`)
    await supabase.storage.from(COMPLIANCE_BUCKET).remove(paths)
  }
}
