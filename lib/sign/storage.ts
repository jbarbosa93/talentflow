// TalentFlow Sign — Storage helpers
// v2.2.0 — Phase 1
// Bucket privé "talentflow-sign" — accès via service role uniquement.

import { createAdminClient } from '@/lib/supabase/admin'

export const SIGN_BUCKET = 'talentflow-sign'

// v2.9.23 — 'uploads' : fichiers chargés par le candidat pendant la signature
// (pièces jointes — CI, permis, etc.). Préfixe uploads/{envelopeId}/{tokenId}/.
export type SignFolder = 'templates' | 'envelopes' | 'signed' | 'uploads'

/**
 * Upload un PDF dans le bucket sign.
 * Path final : {folder}/{ownerId}/{filename}
 */
export async function uploadSignDocument(
  folder: SignFolder,
  ownerId: string,
  file: File | Blob,
  filename: string
): Promise<string> {
  const supabase = createAdminClient()
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${folder}/${ownerId}/${Date.now()}_${safe}`

  const { error } = await supabase.storage
    .from(SIGN_BUCKET)
    .upload(path, file, {
      contentType: 'application/pdf',
      upsert: false,
    })

  if (error) throw new Error(`uploadSignDocument: ${error.message}`)
  return path
}

/**
 * Récupère une URL signée temporaire pour servir un PDF.
 * TTL par défaut : 5 min (page de signature).
 */
export async function getSignedUrl(path: string, ttlSeconds: number = 300): Promise<string> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage
    .from(SIGN_BUCKET)
    .createSignedUrl(path, ttlSeconds)

  if (error || !data) throw new Error(`getSignedUrl: ${error?.message || 'no url'}`)
  return data.signedUrl
}

/**
 * Récupère le buffer d'un fichier (pour le servir via route API inline).
 */
export async function downloadSignDocument(path: string): Promise<Blob> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage.from(SIGN_BUCKET).download(path)
  if (error || !data) throw new Error(`downloadSignDocument: ${error?.message || 'not found'}`)
  return data
}

/**
 * Supprime un fichier du bucket.
 */
export async function deleteSignDocument(path: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.storage.from(SIGN_BUCKET).remove([path])
  if (error) throw new Error(`deleteSignDocument: ${error.message}`)
}
