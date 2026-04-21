// Cron quotidien (03:15 UTC) — auto-wipe rétention glissante 30 jours
//
// Supprime TOUS les rows > 30 jours sur :
//  - emails_envoyes (historique des envois email/iMessage/WhatsApp/SMS)
//  - activites (fil d'activité team)
//
// v1.9.68 : mise en place du retention policy après le bug "historique vide" de Seb
// (on ne peut pas prouver si les rows ont été supprimées manuellement ou jamais écrites).
//
// Protection : CRON_SECRET (Vercel Cron attache automatiquement le header Authorization).

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 60

const RETENTION_DAYS = 30

export async function GET(request: Request) {
  // Auth Vercel Cron
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  // La table `activites` n'est pas dans les types auto-générés → cast any.
  const supabase = createAdminClient() as any
  const tStart = Date.now()
  const cutoffIso = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const results: Record<string, { deleted: number; error?: string }> = {}

  // 1. emails_envoyes — historique envois
  try {
    const { error, count } = await supabase
      .from('emails_envoyes')
      .delete({ count: 'exact' })
      .lt('created_at', cutoffIso)
    if (error) {
      results.emails_envoyes = { deleted: 0, error: error.message }
      console.error('[cron/cleanup-old-data] emails_envoyes error:', error.message)
    } else {
      results.emails_envoyes = { deleted: count ?? 0 }
    }
  } catch (e: any) {
    results.emails_envoyes = { deleted: 0, error: e?.message || 'unknown' }
  }

  // 2. activites — fil d'activité team
  try {
    const { error, count } = await supabase
      .from('activites')
      .delete({ count: 'exact' })
      .lt('created_at', cutoffIso)
    if (error) {
      results.activites = { deleted: 0, error: error.message }
      console.error('[cron/cleanup-old-data] activites error:', error.message)
    } else {
      results.activites = { deleted: count ?? 0 }
    }
  } catch (e: any) {
    results.activites = { deleted: 0, error: e?.message || 'unknown' }
  }

  const durationMs = Date.now() - tStart
  const totalDeleted = (results.emails_envoyes?.deleted ?? 0) + (results.activites?.deleted ?? 0)

  console.log(
    `[cron/cleanup-old-data] Retention ${RETENTION_DAYS}j — emails_envoyes: ${results.emails_envoyes?.deleted ?? 0}, activites: ${results.activites?.deleted ?? 0} (total ${totalDeleted}) en ${durationMs}ms`
  )

  return NextResponse.json({
    ok: true,
    retention_days: RETENTION_DAYS,
    cutoff: cutoffIso,
    results,
    total_deleted: totalDeleted,
    duration_ms: durationMs,
  })
}
