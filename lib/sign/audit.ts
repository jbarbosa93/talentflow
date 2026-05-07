// TalentFlow Sign — Audit log (traçabilité juridique)
// v2.2.0 — Phase 1
// Insert toujours côté serveur via service role (bypass RLS).

import { createAdminClient } from '@/lib/supabase/admin'
import type { SignAuditAction, SignAuditEntry } from './types'

export interface LogAuditOptions {
  recipientEmail?: string | null
  ip?: string | null
  userAgent?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Logge un événement audit pour une enveloppe.
 * Ne throw jamais (best-effort) : l'audit ne doit pas bloquer l'action métier.
 */
export async function logAuditEvent(
  envelopeId: string,
  action: SignAuditAction,
  opts: LogAuditOptions = {}
): Promise<void> {
  try {
    const supabase = createAdminClient()
    await supabase.from('sign_audit_log' as any).insert({
      envelope_id: envelopeId,
      recipient_email: opts.recipientEmail ?? null,
      action,
      ip_address: opts.ip ?? null,
      user_agent: opts.userAgent ?? null,
      metadata: opts.metadata ?? {},
    })
  } catch (e) {
    console.error('[sign/audit] log error', e)
  }
}

/**
 * Récupère l'audit log d'une enveloppe (chronologique).
 */
export async function getAuditLog(envelopeId: string): Promise<SignAuditEntry[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('sign_audit_log' as any)
    .select('*')
    .eq('envelope_id', envelopeId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[sign/audit] get error', error)
    return []
  }
  return (data || []) as unknown as SignAuditEntry[]
}

/**
 * Extrait l'IP de la requête (best-effort, gère les proxies Vercel).
 */
export function extractIp(req: Request): string | null {
  const headers = req.headers
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    null
  )
}
