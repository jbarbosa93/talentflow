// TalentFlow Sign — Gestion des tokens de signature
// v2.2.0 — Phase 1
// Toujours appeler côté serveur uniquement (utilise service role).

import { createAdminClient } from '@/lib/supabase/admin'
import { DEFAULT_TOKEN_TTL_DAYS } from './types'
import type { SignRecipient, SignToken } from './types'

export interface GeneratedToken {
  token: string
  recipient_email: string
  recipient_name: string
  expires_at: string
}

/**
 * Génère un token unique pour chaque destinataire d'une enveloppe.
 * À appeler à la création (status passe en 'sent').
 *
 * @param ttlDays Override du TTL. Si l'enveloppe a `expires_in_days` configuré,
 * passez cette valeur ; sinon DEFAULT_TOKEN_TTL_DAYS (30j).
 */
export async function generateTokensForEnvelope(
  envelopeId: string,
  recipients: SignRecipient[],
  ttlDays: number = DEFAULT_TOKEN_TTL_DAYS
): Promise<GeneratedToken[]> {
  const supabase = createAdminClient()
  const safeTtl = Number.isFinite(ttlDays) && ttlDays > 0 ? ttlDays : DEFAULT_TOKEN_TTL_DAYS
  const expiresAt = new Date(Date.now() + safeTtl * 24 * 60 * 60 * 1000).toISOString()

  const rows = recipients.map(r => ({
    envelope_id: envelopeId,
    recipient_email: r.email.toLowerCase().trim(),
    recipient_name: r.name.trim(),
    expires_at: expiresAt,
  }))

  const { data, error } = await supabase
    .from('sign_tokens' as any)
    .insert(rows)
    .select('token, recipient_email, recipient_name, expires_at')

  if (error) {
    throw new Error(`generateTokensForEnvelope: ${error.message}`)
  }

  return (data || []) as unknown as GeneratedToken[]
}

export interface VerifiedToken {
  valid: boolean
  reason?: 'not_found' | 'expired' | 'used'
  token?: SignToken
}

/**
 * Vérifie qu'un token est valide (existe, non expiré, non utilisé).
 * Utilisé par la route publique /api/sign/verify-token.
 */
export async function verifyToken(token: string): Promise<VerifiedToken> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('sign_tokens' as any)
    .select('*')
    .eq('token', token)
    .maybeSingle()

  if (error || !data) {
    return { valid: false, reason: 'not_found' }
  }

  const t = data as unknown as SignToken
  if (t.used_at) return { valid: false, reason: 'used', token: t }
  if (new Date(t.expires_at).getTime() < Date.now()) {
    return { valid: false, reason: 'expired', token: t }
  }

  return { valid: true, token: t }
}

/**
 * Marque un token comme utilisé (après signature).
 * Phase 1 : non utilisé (signature en Phase 4).
 */
export async function markTokenUsed(token: string, ip: string | null): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from('sign_tokens' as any)
    .update({ used_at: new Date().toISOString(), ip_address: ip })
    .eq('token', token)
}
