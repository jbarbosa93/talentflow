// v2.13.25 — Statut de livraison des emails envoyés aux entreprises d'un lien rapport.
// Lu depuis email_delivery_log (alimenté à l'envoi + mis à jour par le webhook Resend).
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth()
  if (authError) return authError
  const { id } = await params
  const supabase = createAdminClient()

  // Destinataires = emails des entreprises autorisées de ce lien
  const { data: clients } = await (supabase as any)
    .from('report_link_clients')
    .select('client_email')
    .eq('link_id', id)
  const recipients = Array.from(new Set(
    ((clients || []) as { client_email: string | null }[])
      .map(c => (c.client_email || '').trim().toLowerCase())
      .filter(Boolean),
  ))
  if (recipients.length === 0) return NextResponse.json({ emails: [] })

  const { data: logs } = await (supabase as any)
    .from('email_delivery_log')
    .select('recipient, email_type, context, status, error, sent_at, delivered_at')
    .in('recipient', recipients)
    .order('sent_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ emails: logs || [] })
}
