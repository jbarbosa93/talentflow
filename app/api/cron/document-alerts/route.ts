// /api/cron/document-alerts — Email agrégé quotidien des alertes conformité
// v2.7.3
// Schedule : 0 8 * * * (tous les jours 8h00 UTC)
// Protection : Bearer CRON_SECRET
//
// v2.7.3 — Refonte routing :
//   - Email récap quotidien → 1 seul envoi à info@l-agence.ch (toute l'équipe)
//   - Suppression du routage par consultant (plus d'emails séparés par João/Seb)
//   - Rappels candidat J-30 et J-14 → destinataire = candidat, cc = info@l-agence.ch

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDocumentAlerts } from '@/lib/compliance/alerts'
import { sendDocumentAlertsEmail } from '@/lib/compliance/send-alert-email'
import { sendCandidateReminderEmail, type ReminderWindow } from '@/lib/compliance/send-candidate-reminder'
import { daysUntilExpiry } from '@/lib/compliance/document-status'

export const runtime = 'nodejs'
export const maxDuration = 60

// v2.7.3 — Destinataire unique pour toutes les alertes conformité L-Agence
const LAGENCE_EMAIL = 'info@l-agence.ch'

export async function GET(request: Request) {
  // Auth
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://talent-flow.ch'

  // 1. Récupère TOUTES les alertes (limite 500)
  let summary
  try {
    summary = await getDocumentAlerts({ limit: 500 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur récupération' }, { status: 500 })
  }

  if (summary.total === 0) {
    return NextResponse.json({
      ok: true,
      sent: 0,
      reason: 'Aucune alerte aujourd\'hui',
    })
  }

  const adminClient = createAdminClient()

  // 2. Email unique à info@l-agence.ch (récap global, toutes alertes confondues)
  const recapResult = await sendDocumentAlertsEmail({
    to: LAGENCE_EMAIL,
    audience: 'admin',
    consultantName: null,
    alerts: summary.alerts,
    totalExpired: summary.expired,
    totalUrgent: summary.urgent,
    totalWarning: summary.warning,
    baseUrl,
  })

  // 3. v2.7.1 — Rappels candidat individuels (J-30 et J-14)
  // Destinataire = candidat ; cc = info@l-agence.ch (géré dans send-candidate-reminder)
  // Dedup via candidat_documents.metadata.notif_30d_sent_at / notif_14d_sent_at.
  const candidateReminders: { to: string; doc: string; window: ReminderWindow; ok: boolean; error?: string }[] = []
  try {
    const { data: rows } = await (adminClient as any)
      .from('candidat_documents')
      .select(`
        id, candidat_id, label, sub_category, expiry_date, metadata,
        document_type:document_types ( category, name ),
        candidat:candidats!candidat_id ( prenom, nom, email )
      `)
      .not('expiry_date', 'is', null)
    const candidates = (rows || []) as any[]

    for (const doc of candidates) {
      // Filtre type : seulement permis_conduire + qualification
      const cat = doc.document_type?.category
      if (cat !== 'permis_conduire' && cat !== 'qualification') continue
      const candidatEmail = (doc.candidat?.email || '').trim()
      if (!candidatEmail) continue

      const days = daysUntilExpiry(doc.expiry_date)
      if (days === null) continue

      // Décide quelle fenêtre (J-30 ou J-14) déclencher AUJOURD'HUI
      // Tolérance ±0 jour mais idempotent : on regarde si l'envoi pour cette fenêtre a déjà été fait
      let win: ReminderWindow | null = null
      if (days === 30 || (days < 30 && days > 14 && !doc.metadata?.notif_30d_sent_at)) win = 30
      if (days === 14 || (days <= 14 && days >= 0 && !doc.metadata?.notif_14d_sent_at)) win = 14

      if (!win) continue
      const flagKey = win === 30 ? 'notif_30d_sent_at' : 'notif_14d_sent_at'
      if (doc.metadata?.[flagKey]) continue // déjà envoyé pour cette fenêtre

      const firstName = ((doc.candidat?.prenom || '') as string).trim().split(/\s+/)[0] || null
      const fullName = [doc.candidat?.prenom, doc.candidat?.nom].filter(Boolean).join(' ').trim() || 'Collaborateur'

      try {
        const r = await sendCandidateReminderEmail({
          to: candidatEmail,
          candidateFirstName: firstName,
          candidateFullName: fullName,
          documentLabel: doc.label || doc.document_type?.name || 'Document',
          documentSubCategory: doc.sub_category,
          expiryDate: doc.expiry_date,
          daysLeft: win,
        })
        candidateReminders.push({ to: candidatEmail, doc: doc.label, window: win, ok: r.ok, error: r.error })

        if (r.ok) {
          const newMeta = { ...(doc.metadata || {}), [flagKey]: new Date().toISOString() }
          await (adminClient as any)
            .from('candidat_documents')
            .update({ metadata: newMeta })
            .eq('id', doc.id)
        }
      } catch (e: any) {
        candidateReminders.push({ to: candidatEmail, doc: doc.label, window: win, ok: false, error: e?.message || String(e) })
      }
    }
  } catch (e) {
    console.error('[cron/document-alerts] candidate reminders failed:', e instanceof Error ? e.message : String(e))
  }

  return NextResponse.json({
    ok: true,
    total_alerts: summary.total,
    expired: summary.expired,
    urgent: summary.urgent,
    warning: summary.warning,
    recap_sent: recapResult.ok,
    recap_error: recapResult.error,
    recap_to: LAGENCE_EMAIL,
    candidate_reminders: {
      sent: candidateReminders.filter(r => r.ok).length,
      failed: candidateReminders.filter(r => !r.ok).length,
      details: candidateReminders,
    },
  })
}
