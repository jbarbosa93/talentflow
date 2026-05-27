// /api/cron/paiement-rappel-heures — Rappel J-2 versement de salaire
// v2.9.74 — Schedule : 0 7 * * * (7h UTC = 9h CEST / 8h CET)
// Protection : Bearer CRON_SECRET
//
// Logique :
// 1. SELECT calendrier WHERE date_paiement = today + 2 (J+2)
// 2. Pour chaque entrée → SELECT candidats actifs avec ce mode_paiement + email
// 3. Pour chaque candidat, vérifier qu'aucune notif n'a déjà été envoyée pour ce date_paiement
// 4. Envoyer email + logger dans secretariat_paiement_notifs_log
//
// Body retour : { ok, scanned, sent, skipped, failed, details[] }

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPaiementReminder, type PaiementMode } from '@/lib/secretariat/send-paiement-reminder'

export const runtime = 'nodejs'
export const maxDuration = 300

function todayPlus(days: number): string {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function GET(request: Request) {
  // Auth — Bearer CRON_SECRET (strict v2.7.5)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabase = createAdminClient() as any
  const cibleDate = todayPlus(2) // J+2

  // 1. Récupérer les entrées calendrier avec date_paiement = J+2
  const { data: calendarEntries, error: calErr } = await supabase
    .from('secretariat_paiement_calendrier')
    .select('id, mode, libelle, date_paiement')
    .eq('date_paiement', cibleDate)

  if (calErr) {
    return NextResponse.json({ error: 'calendrier: ' + calErr.message }, { status: 500 })
  }

  if (!calendarEntries || calendarEntries.length === 0) {
    return NextResponse.json({
      ok: true,
      cible_date: cibleDate,
      scanned: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      reason: 'Aucun paiement prévu à J+2',
    })
  }

  const stats = { scanned: 0, sent: 0, skipped: 0, failed: 0, no_email: 0, already_sent: 0 }
  const details: any[] = []

  for (const entry of calendarEntries) {
    const mode = entry.mode as PaiementMode

    // 2. Candidats actifs avec ce mode_paiement
    // Récup email depuis la table candidats principale via candidat_id
    const { data: candidats, error: candErr } = await supabase
      .from('secretariat_candidats')
      .select(`
        id, nom, prenom, candidat_id, mode_paiement, is_mission_terminee, archive,
        candidat:candidats!candidat_id ( email )
      `)
      .eq('mode_paiement', mode)
      .eq('archive', false)
      .eq('is_mission_terminee', false)

    if (candErr) {
      details.push({ mode, error: 'candidats: ' + candErr.message })
      continue
    }

    for (const c of candidats || []) {
      stats.scanned++

      const email: string | null = c.candidat?.email || null
      if (!email) {
        stats.no_email++
        // Log skipped pour traçabilité
        await supabase.from('secretariat_paiement_notifs_log').upsert({
          candidat_id: c.id,
          mode,
          date_paiement: entry.date_paiement,
          email: null,
          status: 'skipped_no_email',
        }, { onConflict: 'candidat_id,date_paiement' })
        continue
      }

      // 3. Check dédup
      const { data: existing } = await supabase
        .from('secretariat_paiement_notifs_log')
        .select('id, status')
        .eq('candidat_id', c.id)
        .eq('date_paiement', entry.date_paiement)
        .maybeSingle()

      if (existing && existing.status === 'sent') {
        stats.already_sent++
        continue
      }

      // 4. Envoyer
      const result = await sendPaiementReminder({
        to: email,
        prenom: c.prenom || '',
        nom: c.nom || '',
        mode,
        datePaiement: entry.date_paiement,
        libellePeriode: entry.libelle || '',
      })

      // 5. Log
      await supabase.from('secretariat_paiement_notifs_log').upsert({
        candidat_id: c.id,
        mode,
        date_paiement: entry.date_paiement,
        email,
        status: result.ok ? 'sent' : 'failed',
        error_message: result.error || null,
      }, { onConflict: 'candidat_id,date_paiement' })

      if (result.ok) {
        stats.sent++
        details.push({ candidat: `${c.nom} ${c.prenom}`, email, mode, libelle: entry.libelle, ok: true })
      } else {
        stats.failed++
        details.push({ candidat: `${c.nom} ${c.prenom}`, email, mode, libelle: entry.libelle, ok: false, error: result.error })
      }
    }
  }

  return NextResponse.json({
    ok: true,
    cible_date: cibleDate,
    calendar_entries: calendarEntries.length,
    ...stats,
    details,
  })
}
