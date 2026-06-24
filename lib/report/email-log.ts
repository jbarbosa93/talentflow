// TalentFlow — Traçabilité des emails (table email_delivery_log)
// v2.13.25 — On logge chaque envoi Resend (id + destinataire + statut). Le webhook
// Resend (/api/webhooks/resend) met ensuite à jour le statut réel de livraison
// (delivered / bounced / complained) en matchant par resend_id.
// Best-effort : un échec de log ne doit jamais casser l'envoi.

import { createAdminClient } from '@/lib/supabase/admin'

export interface EmailLogMeta {
  emailType?: string            // report_client | report_candidat | report_admin | report | ...
  context?: string | null       // ex : « Ismael Jarmoun · Semaine 25 »
  submissionId?: string | null
}

export async function logEmailDelivery(args: {
  resendId?: string | null
  recipient: string
  status: 'sent' | 'failed'
  error?: string | null
  meta?: EmailLogMeta
}): Promise<void> {
  try {
    const supabase = createAdminClient()
    await (supabase as any).from('email_delivery_log').insert({
      resend_id: args.resendId ?? null,
      recipient: args.recipient,
      email_type: args.meta?.emailType ?? 'report',
      context: args.meta?.context ?? null,
      submission_id: args.meta?.submissionId ?? null,
      status: args.status,
      error: args.error ?? null,
    })
  } catch {
    /* best-effort */
  }
}
