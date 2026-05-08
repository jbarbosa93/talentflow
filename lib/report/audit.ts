// TalentFlow Rapports — Audit log (Phase 5)
// v2.2.6
// Pattern aligné sur lib/sign/audit.ts

import { createAdminClient } from '@/lib/supabase/admin'
import type { ReportAuditAction } from './types'

interface LogReportAuditArgs {
  submissionId: string
  action: ReportAuditAction
  actorEmail?: string | null
  ip?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Insère une entrée dans report_audit_log. Best-effort : log l'erreur mais
 * ne throw pas (le pipeline ne doit pas être bloqué par l'audit).
 */
export async function logReportAudit(args: LogReportAuditArgs): Promise<void> {
  try {
    const supabase = createAdminClient()
    await supabase
      .from('report_audit_log' as any)
      .insert({
        submission_id: args.submissionId,
        action: args.action,
        actor_email: args.actorEmail || null,
        ip_address: args.ip || null,
        metadata: args.metadata || {},
      })
  } catch (e) {
    console.warn('[report/audit] log failed', args.action, e)
  }
}

/** Extrait l'IP du request (pattern identique à lib/sign/audit.ts). */
export function extractIp(req: Request | { headers: Headers }): string | null {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real.trim()
  return null
}
