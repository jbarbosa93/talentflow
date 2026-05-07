// TalentFlow Sign — CRUD une enveloppe + action 'remind'
// v2.2.0 — Phase 3 (action remind)
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth-guard'
import { sendSignReminderEmail } from '@/lib/sign/send-email'
import { logAuditEvent, extractIp } from '@/lib/sign/audit'
import type { SignStatus, SignCategory, SignEnvelope, SignRecipient, SignToken } from '@/lib/sign/types'

const VALID_STATUS: SignStatus[] = ['draft', 'sent', 'in_progress', 'completed', 'expired', 'declined', 'cancelled']
const VALID_CATEGORY: SignCategory[] = ['mappe', 'contrat', 'autres']

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth()
  if (authError) return authError

  const { id } = await ctx.params
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('sign_envelopes' as any)
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Enveloppe introuvable' }, { status: 404 })
  return NextResponse.json({ envelope: data })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth()
  if (authError) return authError

  const { id } = await ctx.params
  try {
    const body = await req.json()

    // ─── v2.2.0 Phase 3 — action: 'remind' (renvoyer email aux destinataires non signés) ───
    if (body.action === 'remind') {
      return await handleRemind(req, id)
    }

    const allowed: Record<string, unknown> = {}
    if (typeof body.title === 'string') allowed.title = body.title.trim()
    if (typeof body.message === 'string') allowed.message = body.message.trim() || null
    if (Array.isArray(body.recipients)) allowed.recipients = body.recipients
    if (body.status && (VALID_STATUS as string[]).includes(body.status)) allowed.status = body.status
    if (body.document_category && (VALID_CATEGORY as string[]).includes(body.document_category)) {
      allowed.document_category = body.document_category
    }
    // v2.2.2 — Champs additionnels acceptés en édition de brouillon
    if (body.template_id === null || typeof body.template_id === 'string') {
      allowed.template_id = body.template_id || null
    }
    if (body.candidate_id === null || typeof body.candidate_id === 'string') {
      allowed.candidate_id = body.candidate_id || null
    }
    if (Array.isArray(body.documents)) allowed.documents = body.documents
    if (typeof body.expires_in_days === 'number') allowed.expires_in_days = body.expires_in_days
    if (typeof body.reminder_frequency_days === 'number') allowed.reminder_frequency_days = body.reminder_frequency_days
    if (typeof body.expiry_warning_days === 'number') allowed.expiry_warning_days = body.expiry_warning_days
    if (body.context_data === null || typeof body.context_data === 'object') {
      allowed.context_data = body.context_data
    }

    if (Object.keys(allowed).length === 0) {
      return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('sign_envelopes' as any)
      .update(allowed)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    return NextResponse.json({ envelope: data })
  } catch {
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 })
  }
}

// ─────────────────────────────────────────────────────────────────
// Handler "remind" — envoie un email de rappel aux signers non signés
// v2.2.0 Phase 3
// ─────────────────────────────────────────────────────────────────
async function handleRemind(req: NextRequest, envelopeId: string): Promise<NextResponse> {
  const supabase = createAdminClient()

  // 1. Récup enveloppe
  const { data: env, error: envErr } = await supabase
    .from('sign_envelopes' as any)
    .select('*')
    .eq('id', envelopeId)
    .maybeSingle()
  if (envErr || !env) {
    return NextResponse.json({ error: 'Enveloppe introuvable' }, { status: 404 })
  }
  const envelope = env as unknown as SignEnvelope
  if (envelope.status === 'draft') {
    return NextResponse.json({ error: "Enveloppe pas encore envoyée — utilisez le bouton 'Envoyer'" }, { status: 400 })
  }
  if (envelope.status === 'completed' || envelope.status === 'cancelled' || envelope.status === 'declined') {
    return NextResponse.json({ error: `Statut ${envelope.status} : pas de rappel possible` }, { status: 400 })
  }

  // 2. Récup tokens valides (non expirés, non utilisés)
  const nowIso = new Date().toISOString()
  const { data: tokens, error: tokErr } = await supabase
    .from('sign_tokens' as any)
    .select('*')
    .eq('envelope_id', envelopeId)
    .is('used_at', null)
    .gt('expires_at', nowIso)
  if (tokErr) {
    console.error('[sign/remind] tokens fetch error', tokErr)
    return NextResponse.json({ error: 'Erreur récupération tokens' }, { status: 500 })
  }
  const tokensList = (tokens || []) as unknown as SignToken[]
  if (tokensList.length === 0) {
    return NextResponse.json({ error: 'Aucun token actif (tous expirés ou déjà signés)' }, { status: 400 })
  }

  // 3. Filtrer : on ne renvoie qu'aux destinataires NON signés
  // (recipients[].status est mis à 'signed' à Phase 4 ; pour l'instant, tous les non-signés = tous)
  const recipients = (envelope.recipients || []) as SignRecipient[]
  const signedEmails = new Set(
    recipients
      .filter(r => r.status === 'signed')
      .map(r => r.email.toLowerCase().trim())
  )

  // 4. Récup expéditeur (pour senderName / senderEmail dans le mail)
  const server = await createServerClient()
  const { data: { user } } = await server.auth.getUser()
  const meta = (user?.user_metadata as { entreprise?: string } | null) || null
  const senderName = (meta?.entreprise && meta.entreprise.trim()) || 'L-Agence SA'
  const senderEmail = user?.email || undefined

  // 5. Compte des docs (info pour l'email)
  let documentsCount = 1
  if (envelope.template_id) {
    try {
      const { data: tpl } = await supabase
        .from('sign_templates' as any)
        .select('documents')
        .eq('id', envelope.template_id)
        .maybeSingle()
      const t = tpl as unknown as { documents?: unknown[] } | null
      documentsCount = Array.isArray(t?.documents) ? t!.documents!.length : 1
    } catch { /* silencieux */ }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'
  const ip = extractIp(req)

  // Map recipientEmail → role pour passer le bon rôle au template
  const roleByEmail = new Map<string, string>()
  recipients.forEach(r => roleByEmail.set(r.email.toLowerCase().trim(), r.role === 'cc' ? 'Copie' : 'Signataire'))

  // 6. Envoi des reminders (parallèle, audit log par destinataire)
  const results = await Promise.all(tokensList.map(async t => {
    const lcEmail = t.recipient_email.toLowerCase().trim()
    if (signedEmails.has(lcEmail)) {
      return { email: t.recipient_email, ok: false, skipped: 'déjà signé' }
    }
    const role = roleByEmail.get(lcEmail) || 'Signataire'
    const signUrl = `${appUrl}/sign/v/${t.token}`
    const result = await sendSignReminderEmail(t.recipient_email, {
      recipientName: t.recipient_name,
      recipientRole: role,
      senderName,
      senderEmail,
      envelopeTitle: envelope.title,
      message: envelope.message,
      signUrl,
      documentsCount,
      expiresAt: t.expires_at,
    })

    await logAuditEvent(envelopeId, 'reminded', {
      recipientEmail: t.recipient_email,
      ip,
      metadata: {
        emailSent: result.ok,
        resendId: result.id,
        error: result.error,
        role,
      },
    })

    return { email: t.recipient_email, ok: result.ok, error: result.error }
  }))

  const sentOk = results.filter(r => r.ok).length
  const sentErrors = results.filter(r => !r.ok && !('skipped' in r))
  const skipped = results.filter(r => 'skipped' in r).length

  return NextResponse.json({
    ok: true,
    reminded: sentOk,
    skipped,
    errors: sentErrors,
  })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth()
  if (authError) return authError

  const { id } = await ctx.params
  const supabase = createAdminClient()
  const { error } = await supabase.from('sign_envelopes' as any).delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
