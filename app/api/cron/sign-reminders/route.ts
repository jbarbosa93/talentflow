// TalentFlow Sign — Cron rappels automatiques
// v2.2.1 — Phase 4a-bis-5
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

export async function GET(request: Request) {
  // Auth
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()

  // Cherche les enveloppes éligibles (sent/in_progress + reminder_frequency_days set)
  const { data: rows, error } = await supabase
    .from('sign_envelopes' as any)
    .select('*')
    .in('status', ['sent', 'in_progress'])
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const envelopes = (rows || []) as unknown as EnvelopeRow[]

  let remindersSent = 0
  let warningsSent = 0
  const errors: string[] = []
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'

  for (const env of envelopes) {
    const freq = env.reminder_frequency_days
    const lastSent = env.last_reminder_sent_at ? new Date(env.last_reminder_sent_at).getTime() : null
    const sentAtTs = env.sent_at ? new Date(env.sent_at).getTime() : null
    const baseTs = lastSent || sentAtTs || new Date(env.created_at).getTime()
    const daysSinceLast = (now.getTime() - baseTs) / (1000 * 60 * 60 * 24)

    // ─── Rappels périodiques ───
    if (freq && freq > 0 && daysSinceLast >= freq) {
      // Trouve les destinataires non signés (signers seulement, CC pas concerné)
      const pendingSigners = (env.recipients as SignRecipient[]).filter(r =>
        r.role !== 'cc' && r.status !== 'signed',
      )
      if (pendingSigners.length > 0) {
        // Récup les tokens actifs pour ces emails
        const { data: tokensData } = await supabase
          .from('sign_tokens' as any)
          .select('token, recipient_email, recipient_name, expires_at')
          .eq('envelope_id', env.id)
          .is('signed_at', null)
        const tokens = (tokensData || []) as unknown as Array<{
          token: string; recipient_email: string; recipient_name: string; expires_at: string
        }>
        // Récup info expéditeur
        let senderName = 'L-Agence SA'
        let senderEmail: string | undefined
        if (env.created_by) {
          try {
            const { data: { user } } = await supabase.auth.admin.getUserById(env.created_by)
            const meta = (user?.user_metadata as { entreprise?: string } | null) || null
            senderName = meta?.entreprise?.trim() || senderName
            senderEmail = user?.email || undefined
          } catch { /* */ }
        }
        for (const tok of tokens) {
          // Skip si token expiré
          if (new Date(tok.expires_at).getTime() < now.getTime()) continue
          // Skip si destinataire déjà signé
          const r = pendingSigners.find(p => p.email.toLowerCase().trim() === tok.recipient_email)
          if (!r) continue
          try {
            await sendSignReminderEmail(tok.recipient_email, {
              recipientName: tok.recipient_name,
              recipientRole: r.role === 'cc' ? 'Copie' : 'Signataire',
              senderName,
              senderEmail,
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
        // Update last_reminder_sent_at
        await supabase
          .from('sign_envelopes' as any)
          .update({ last_reminder_sent_at: now.toISOString() })
          .eq('id', env.id)
      }
    }

    // ─── Alerte avant expiration ───
    if (env.expiry_warning_days && env.expiry_warning_days > 0) {
      const { data: tokensData } = await supabase
        .from('sign_tokens' as any)
        .select('token, recipient_email, recipient_name, expires_at')
        .eq('envelope_id', env.id)
        .is('signed_at', null)
      const tokens = (tokensData || []) as unknown as Array<{
        token: string; recipient_email: string; recipient_name: string; expires_at: string
      }>
      for (const tok of tokens) {
        const expTs = new Date(tok.expires_at).getTime()
        const daysUntil = (expTs - now.getTime()) / (1000 * 60 * 60 * 24)
        // Envoie l'alerte si on est dans la fenêtre [warning-1, warning] jours avant expiration
        if (daysUntil > env.expiry_warning_days - 1 && daysUntil <= env.expiry_warning_days) {
          // (Pour simplicité on réutilise le template reminder mais on pourrait faire un dédié)
          try {
            await sendSignReminderEmail(tok.recipient_email, {
              recipientName: tok.recipient_name,
              recipientRole: 'Signataire',
              senderName: 'L-Agence SA',
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
