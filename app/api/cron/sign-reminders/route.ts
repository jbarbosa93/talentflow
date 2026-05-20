// TalentFlow Sign — Cron rappels automatiques
// v2.2.1 — Phase 4a-bis-5
// v2.7.5 — Refactor N+1 → batch (1 query tokens + cache getUserById)
//
// Run quotidien (matin) — pour chaque enveloppe sent/in_progress avec
// reminder_frequency_days configuré, vérifie si le dernier rappel date de
// + de N jours → renvoie un rappel à TOUS les destinataires non signés.
//
// Aussi : si expiry_warning_days configuré ET tokens expirent dans X jours
// → envoie une alerte aux destinataires non signés.
//
// Protection : CRON_SECRET.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendSignReminderEmail } from '@/lib/sign/send-email'
import { logAuditEvent } from '@/lib/sign/audit'
import type { SignEnvelope, SignRecipient } from '@/lib/sign/types'

export const runtime = 'nodejs'
export const maxDuration = 60

interface EnvelopeRow extends SignEnvelope {
  expires_in_days?: number | null
  reminder_frequency_days?: number | null
  expiry_warning_days?: number | null
  last_reminder_sent_at?: string | null
}

type TokenRow = {
  envelope_id: string
  token: string
  recipient_email: string
  recipient_name: string
  expires_at: string
}

export async function GET(request: Request) {
  // Auth
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()

  // 1. Fetch envelopes éligibles
  const { data: rows, error } = await supabase
    .from('sign_envelopes' as any)
    .select('*')
    .in('status', ['sent', 'in_progress'])
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const envelopes = (rows || []) as unknown as EnvelopeRow[]
  if (envelopes.length === 0) {
    return NextResponse.json({ ok: true, envelopesScanned: 0, remindersSent: 0, warningsSent: 0 })
  }

  // 2. Fetch TOUS les tokens non signés en 1 query, puis grouper par envelope_id
  const envIds = envelopes.map(e => e.id)
  const { data: allTokens } = await supabase
    .from('sign_tokens' as any)
    .select('envelope_id, token, recipient_email, recipient_name, expires_at')
    .in('envelope_id', envIds)
    .is('signed_at', null)
  const tokensByEnvelope = new Map<string, TokenRow[]>()
  for (const t of (allTokens || []) as unknown as TokenRow[]) {
    const arr = tokensByEnvelope.get(t.envelope_id) || []
    arr.push(t)
    tokensByEnvelope.set(t.envelope_id, arr)
  }

  // 3. Cache senders : 1 getUserById par created_by unique
  type SenderInfo = { name: string; email: string | undefined }
  const senderCache = new Map<string, SenderInfo>()
  const uniqueCreators = Array.from(new Set(envelopes.map(e => e.created_by).filter(Boolean) as string[]))
  await Promise.all(uniqueCreators.map(async (uid) => {
    try {
      const { data: { user } } = await supabase.auth.admin.getUserById(uid)
      const meta = (user?.user_metadata as { entreprise?: string } | null) || null
      senderCache.set(uid, {
        name: meta?.entreprise?.trim() || 'L-Agence SA',
        email: user?.email || undefined,
      })
    } catch {
      senderCache.set(uid, { name: 'L-Agence SA', email: undefined })
    }
  }))

  let remindersSent = 0
  let warningsSent = 0
  const errors: string[] = []
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'

  for (const env of envelopes) {
    const tokens = tokensByEnvelope.get(env.id) || []
    if (tokens.length === 0) continue

    const sender: SenderInfo = env.created_by
      ? (senderCache.get(env.created_by) || { name: 'L-Agence SA', email: undefined })
      : { name: 'L-Agence SA', email: undefined }

    const freq = env.reminder_frequency_days
    const lastSent = env.last_reminder_sent_at ? new Date(env.last_reminder_sent_at).getTime() : null
    const sentAtTs = env.sent_at ? new Date(env.sent_at).getTime() : null
    const baseTs = lastSent || sentAtTs || new Date(env.created_at).getTime()
    const daysSinceLast = (now.getTime() - baseTs) / (1000 * 60 * 60 * 24)

    // ─── Rappels périodiques ───
    if (freq && freq > 0 && daysSinceLast >= freq) {
      const pendingSigners = (env.recipients as SignRecipient[]).filter(r =>
        r.role !== 'cc' && r.status !== 'signed',
      )
      if (pendingSigners.length > 0) {
        for (const tok of tokens) {
          if (new Date(tok.expires_at).getTime() < now.getTime()) continue
          // v2.9.24 — Normalise les DEUX côtés : sans ça, un token dont la
          // casse de l'email diffère du recipient ne matchait pas → rappel
          // jamais envoyé à un signataire en attente.
          const r = pendingSigners.find(p =>
            p.email.toLowerCase().trim() === (tok.recipient_email || '').toLowerCase().trim())
          if (!r) continue
          try {
            await sendSignReminderEmail(tok.recipient_email, {
              recipientName: tok.recipient_name,
              recipientRole: r.role === 'cc' ? 'Copie' : 'Signataire',
              senderName: sender.name,
              senderEmail: sender.email,
              envelopeTitle: env.title,
              message: env.message,
              signUrl: `${appUrl}/sign/v/${tok.token}`,
              expiresAt: tok.expires_at,
            })
            remindersSent += 1
          } catch (e) {
            errors.push(`reminder ${env.id} → ${tok.recipient_email}: ${(e as Error).message}`)
          }
        }
        await logAuditEvent(env.id, 'reminded', {
          metadata: { triggered_by: 'cron', recipients: tokens.length },
        })
        await supabase
          .from('sign_envelopes' as any)
          .update({ last_reminder_sent_at: now.toISOString() })
          .eq('id', env.id)
      }
    }

    // ─── Alerte avant expiration ─── (réutilise les mêmes tokens)
    if (env.expiry_warning_days && env.expiry_warning_days > 0) {
      for (const tok of tokens) {
        const expTs = new Date(tok.expires_at).getTime()
        const daysUntil = (expTs - now.getTime()) / (1000 * 60 * 60 * 24)
        if (daysUntil > env.expiry_warning_days - 1 && daysUntil <= env.expiry_warning_days) {
          try {
            await sendSignReminderEmail(tok.recipient_email, {
              recipientName: tok.recipient_name,
              recipientRole: 'Signataire',
              senderName: sender.name,
              envelopeTitle: `${env.title} (expire bientôt)`,
              message: env.message,
              signUrl: `${appUrl}/sign/v/${tok.token}`,
              expiresAt: tok.expires_at,
            })
            warningsSent += 1
          } catch (e) {
            errors.push(`warning ${env.id} → ${tok.recipient_email}: ${(e as Error).message}`)
          }
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    envelopesScanned: envelopes.length,
    remindersSent,
    warningsSent,
    errors: errors.length > 0 ? errors : undefined,
  })
}
