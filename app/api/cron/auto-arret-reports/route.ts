// /api/cron/auto-arret-reports — Rapport d'arrêt auto en fin de semaine
// v2.7.1
// Schedule : 0 20 * * 0 (dimanche 20h UTC = 22h CH)
// Protection : Bearer CRON_SECRET
//
// Pour chaque report_link lié à une mission ayant un arrêt de ≥ 14 jours
// couvrant entièrement la semaine qui vient de se terminer (lundi → dimanche
// d'aujourd'hui) :
//   - Envoie un email récapitulatif au créateur du lien + ADMIN_EMAIL
//   - PAS d'envoi au client ni au candidat (rapport interne L-Agence)
//   - Dédup via report_auto_arret_log (UNIQUE link_id, week_start)

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 60

const FROM_DEFAULT = 'TalentFlow Rapports <noreply@talent-flow.ch>'
const MIN_ARRET_DAYS = 14  // arrêt ≥ 2 semaines

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Lundi 00:00 de la semaine contenant `d` (semaine ISO, lundi = jour 1). */
function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = x.getDay() // 0=dim, 1=lun, ..., 6=sam
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  return x
}

function diffDaysInclusive(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00').getTime()
  const db = new Date(b + 'T00:00:00').getTime()
  if (isNaN(da) || isNaN(db)) return 0
  return Math.round((db - da) / 86400000) + 1
}

function escapeHtml(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function frDate(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const adminEmail = (process.env.ADMIN_EMAIL || '').trim()
  const resendKey = process.env.RESEND_API_KEY

  // 1. Calcul de la semaine qui vient de se terminer
  //    Le cron tourne le dimanche soir → la semaine est lundi - dimanche d'aujourd'hui
  const today = new Date()
  const monday = mondayOf(today)
  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)
  const weekStart = isoDate(monday)
  const weekEnd = isoDate(sunday)

  const supabase = createAdminClient()

  // 2. Charge tous les liens actifs avec mission_id
  const { data: linksRaw } = await (supabase as any)
    .from('report_links')
    .select('id, slug, candidat_name, client_name, mission_id, created_by')
    .eq('status', 'active')
    .not('mission_id', 'is', null)

  const links = ((linksRaw as unknown) ?? []) as Array<{
    id: string
    slug: string
    candidat_name: string | null
    client_name: string | null
    mission_id: string | null
    created_by: string | null
  }>

  if (links.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, week: { weekStart, weekEnd } })
  }

  // 3. Charge les missions correspondantes (arrets + metier)
  const missionIds = Array.from(new Set(links.map(l => l.mission_id).filter(Boolean) as string[]))
  const { data: missionsRaw } = await (supabase as any)
    .from('missions')
    .select('id, metier, metier_display, arrets, candidat_nom, client_nom')
    .in('id', missionIds)
  const missionsById = new Map<string, any>()
  for (const m of (missionsRaw ?? []) as any[]) missionsById.set(m.id, m)

  // 4. Map created_by → email
  const userIds = Array.from(new Set(links.map(l => l.created_by).filter(Boolean) as string[]))
  const creatorEmails = new Map<string, string>()
  for (const uid of userIds) {
    try {
      const { data } = await (supabase as any).auth.admin.getUserById(uid)
      const email = data?.user?.email
      if (email) creatorEmails.set(uid, email)
    } catch { /* silent */ }
  }

  // 5. Pour chaque lien : check arrêt qualifiant + dédup + envoi
  let processed = 0
  let skipped = 0
  let sent = 0
  const errors: string[] = []

  for (const link of links) {
    processed++
    const mission = missionsById.get(link.mission_id!)
    if (!mission) { skipped++; continue }

    const arrets = Array.isArray(mission.arrets) ? mission.arrets : []
    // Arrêt qui (a) dure ≥ 14j, (b) couvre TOUTE la semaine [weekStart, weekEnd]
    const qualifyingArret = arrets.find((a: any) => {
      if (!a?.debut || !a?.fin) return false
      const dur = diffDaysInclusive(a.debut, a.fin)
      if (dur < MIN_ARRET_DAYS) return false
      return a.debut <= weekStart && a.fin >= weekEnd
    })

    if (!qualifyingArret) { skipped++; continue }

    // Dédup : déjà envoyé pour ce lien sur cette semaine ?
    const { data: existingLog } = await (supabase as any)
      .from('report_auto_arret_log')
      .select('id')
      .eq('link_id', link.id)
      .eq('week_start', weekStart)
      .maybeSingle()

    if (existingLog) { skipped++; continue }

    // Destinataires
    const recipients: string[] = []
    if (link.created_by && creatorEmails.has(link.created_by)) {
      recipients.push(creatorEmails.get(link.created_by)!)
    }
    if (adminEmail && !recipients.includes(adminEmail)) recipients.push(adminEmail)

    if (recipients.length === 0) { skipped++; continue }

    // Construit l'email
    const candidatName = link.candidat_name || mission.candidat_nom || 'Candidat'
    const clientName = link.client_name || mission.client_nom || '—'
    const metier = mission.metier_display || mission.metier || '—'
    const subject = `📋 Rapport hebdo — ARRÊT · ${candidatName} (sem. du ${frDate(weekStart)})`

    const html = `
<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #ffffff; color: #1f2937;">
  <div style="background: linear-gradient(135deg, #fef3c7, #fde68a); border-radius: 12px; padding: 18px; margin-bottom: 20px;">
    <div style="font-size: 12px; font-weight: 700; color: #92400e; letter-spacing: 0.5px; text-transform: uppercase;">Rapport hebdomadaire automatique</div>
    <div style="font-size: 22px; font-weight: 700; color: #78350f; margin-top: 6px;">⚕️ Candidat en arrêt</div>
  </div>

  <p style="font-size: 14px; line-height: 1.6;">
    Le candidat <strong>${escapeHtml(candidatName)}</strong> est en arrêt sur la totalité de la semaine du
    <strong>${frDate(weekStart)} au ${frDate(weekEnd)}</strong>.
    Aucun rapport d'heures n'a été (et ne sera pas) demandé au candidat ni à l'entreprise pour cette semaine.
  </p>

  <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
    <tr>
      <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-weight: 600; width: 40%;">Candidat</td>
      <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${escapeHtml(candidatName)}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-weight: 600;">Client / Mission</td>
      <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${escapeHtml(clientName)} · ${escapeHtml(metier)}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-weight: 600;">Période de l'arrêt</td>
      <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">Du ${frDate(qualifyingArret.debut)} au ${frDate(qualifyingArret.fin)} (${diffDaysInclusive(qualifyingArret.debut, qualifyingArret.fin)} jours)</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-weight: 600;">Semaine concernée</td>
      <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">Du ${frDate(weekStart)} au ${frDate(weekEnd)}</td>
    </tr>
  </table>

  <div style="background: #f3f4f6; border-left: 3px solid #818cf8; padding: 12px 14px; border-radius: 6px; font-size: 12px; color: #4b5563; margin-top: 18px;">
    Rapport généré automatiquement par TalentFlow car l'arrêt couvre la totalité de la semaine et dure au moins ${MIN_ARRET_DAYS} jours.
    Vous recevrez un email similaire chaque dimanche soir tant que l'arrêt court.
  </div>

  <div style="margin-top: 24px; text-align: center;">
    <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://talent-flow.ch'}/sign/rapports/${link.id}"
       style="display: inline-block; padding: 10px 20px; background: #EAB308; color: #1c1a14; font-weight: 700; text-decoration: none; border-radius: 8px; font-size: 13px;">
      → Ouvrir le lien rapport
    </a>
  </div>
</div>`

    const text = `Rapport hebdomadaire automatique — Arrêt\n\nCandidat : ${candidatName}\nMission : ${clientName} · ${metier}\nArrêt : du ${frDate(qualifyingArret.debut)} au ${frDate(qualifyingArret.fin)}\nSemaine : du ${frDate(weekStart)} au ${frDate(weekEnd)}\n\nAucun rapport d'heures n'a été demandé pour cette semaine.\n\nLien rapport : ${process.env.NEXT_PUBLIC_APP_URL || 'https://talent-flow.ch'}/sign/rapports/${link.id}`

    // Envoi
    let emailOk = false
    if (resendKey) {
      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: FROM_DEFAULT,
            to: recipients,
            subject,
            html,
            text,
          }),
        })
        emailOk = r.ok
        if (!r.ok) {
          const err = await r.text().catch(() => `HTTP ${r.status}`)
          errors.push(`link ${link.id}: ${err.slice(0, 100)}`)
        }
      } catch (e) {
        errors.push(`link ${link.id}: ${e instanceof Error ? e.message : 'fetch error'}`)
      }
    } else {
      errors.push('RESEND_API_KEY manquant')
    }

    // Log (même si email a échoué, on dédup pour ne pas spammer en cas de retry)
    if (emailOk) {
      try {
        await (supabase as any).from('report_auto_arret_log').insert({
          link_id: link.id,
          mission_id: link.mission_id,
          week_start: weekStart,
          week_end: weekEnd,
          arret_debut: qualifyingArret.debut,
          arret_fin: qualifyingArret.fin,
          recipients,
        })
        sent++
      } catch (e) {
        errors.push(`link ${link.id}: log insert failed`)
      }
    }
  }

  return NextResponse.json({
    ok: true,
    week: { weekStart, weekEnd },
    processed,
    sent,
    skipped,
    errors: errors.slice(0, 20),
  })
}
