// TalentFlow Missions — Alertes (cloche) — v2.12
// Réservé à João (ADMIN_EMAIL) : Seb et les autres reçoivent des listes vides.
// 3 catégories :
//   - finsMission  : missions qui se terminent (déjà passées non renouvelées + aujourd'hui + dans 3 jours)
//                    + flag `a_replacer` (idée 5) : aucune mission ne prend le relais derrière.
//   - rapportsManquants : missions INDÉTERMINÉES dont le candidat est lié aux rapports
//                    mais sans soumission depuis STALE_DAYS jours (idée 6).

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const STALE_DAYS = 14 // "pas de rapport depuis 2 semaines" → suspect

function isoAddDays(base: Date, days: number): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysBetween(fromStr: string, toStr: string): number {
  const a = new Date(fromStr + 'T00:00:00')
  const b = new Date(toStr + 'T00:00:00')
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

export async function GET() {
  const authError = await requireAuth()
  if (authError) return authError

  // Gating João seul (côté serveur → impossible à contourner depuis le client)
  const server = await createServerClient()
  const { data: { user } } = await server.auth.getUser()
  const adminEmail = (process.env.ADMIN_EMAIL || 'j.barbosa@l-agence.ch').trim()
  if (!user || user.email !== adminEmail) {
    return NextResponse.json({ finsMission: [], rapportsManquants: [] })
  }

  const supabase = createAdminClient()
  const now = new Date()
  const todayStr = isoAddDays(now, 0)
  const in3Str = isoAddDays(now, 3)
  const staleBeforeStr = isoAddDays(now, -STALE_DAYS)

  // Toutes les missions en cours
  const { data: missionsRaw } = await (supabase as any)
    .from('missions')
    .select('id, candidat_id, candidat_nom, client_nom, metier, metier_display, date_debut, date_fin, statut')
    .eq('statut', 'en_cours')
  const all = (missionsRaw || []) as Array<{
    id: string; candidat_id: string | null; candidat_nom: string | null; client_nom: string | null
    metier: string | null; metier_display: string | null; date_debut: string | null; date_fin: string | null
  }>

  // ---------- FEATURE 4 + 5 : fins de mission ----------
  const finsMission = all
    .filter(m => m.date_fin && m.date_fin <= in3Str)
    .map(m => {
      const dfin = m.date_fin as string
      // idée 5 — relève : une autre mission du même candidat qui va AU-DELÀ de cette fin
      const aReplacer = !(m.candidat_id && all.some(o =>
        o.id !== m.id && o.candidat_id === m.candidat_id && (!o.date_fin || o.date_fin > dfin),
      ))
      const days = daysBetween(todayStr, dfin) // <0 = déjà passée, 0 = aujourd'hui, 1..3 = bientôt
      const severity: 'expired' | 'today' | 'soon' = dfin < todayStr ? 'expired' : dfin === todayStr ? 'today' : 'soon'
      return {
        mission_id: m.id,
        candidat_id: m.candidat_id,
        candidat_nom: m.candidat_nom || 'Candidat',
        client_nom: m.client_nom || '',
        metier: m.metier_display || m.metier || '',
        date_fin: dfin,
        days,
        severity,
        a_replacer: aReplacer,
      }
    })
    .sort((a, b) => a.date_fin.localeCompare(b.date_fin))

  // ---------- FEATURE 6 : missions indéterminées sans rapport récent ----------
  const indeterminees = all.filter(m => !m.date_fin && m.candidat_id)
  const candIds = [...new Set(indeterminees.map(m => m.candidat_id as string))]
  const rapportsManquants: Array<{
    mission_id: string; candidat_id: string; candidat_nom: string; client_nom: string
    metier: string; last_report: string | null; days_since: number | null
  }> = []

  if (candIds.length) {
    // Liens rapport ACTIFS de ces candidats (condition João : doit être lié aux rapports)
    const { data: linksRaw } = await (supabase as any)
      .from('report_links')
      .select('id, candidat_id')
      .in('candidat_id', candIds)
      .eq('status', 'active')
    const links = (linksRaw || []) as Array<{ id: string; candidat_id: string }>

    const linksByCand = new Map<string, string[]>()
    for (const l of links) {
      const arr = linksByCand.get(l.candidat_id) || []
      arr.push(l.id)
      linksByCand.set(l.candidat_id, arr)
    }

    // Dernière soumission par lien
    const lastByLink = new Map<string, string>()
    const linkIds = links.map(l => l.id)
    if (linkIds.length) {
      const { data: subsRaw } = await (supabase as any)
        .from('report_submissions')
        .select('link_id, week_start, created_at')
        .in('link_id', linkIds)
      for (const s of (subsRaw || []) as Array<{ link_id: string; week_start: string | null; created_at: string | null }>) {
        const val = s.week_start || (s.created_at ? s.created_at.slice(0, 10) : null)
        if (!val) continue
        const cur = lastByLink.get(s.link_id)
        if (!cur || val > cur) lastByLink.set(s.link_id, val)
      }
    }

    for (const m of indeterminees) {
      const cid = m.candidat_id as string
      const candLinks = linksByCand.get(cid)
      if (!candLinks || !candLinks.length) continue // pas lié aux rapports → on ignore
      let last: string | null = null
      for (const lid of candLinks) {
        const v = lastByLink.get(lid)
        if (v && (!last || v > last)) last = v
      }
      if (last && last >= staleBeforeStr) continue // rapport récent → OK
      rapportsManquants.push({
        mission_id: m.id,
        candidat_id: cid,
        candidat_nom: m.candidat_nom || 'Candidat',
        client_nom: m.client_nom || '',
        metier: m.metier_display || m.metier || '',
        last_report: last,
        days_since: last ? daysBetween(last, todayStr) : null,
      })
    }
    rapportsManquants.sort((a, b) => (b.days_since ?? 9999) - (a.days_since ?? 9999))
  }

  return NextResponse.json({ finsMission, rapportsManquants })
}
