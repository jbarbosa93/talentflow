// GET /api/document-alerts — Alertes documents conformité (cloche + page /alertes)
// v2.7.0
// Query params :
//   - mode=bell  → compact 8 alertes urgentes (default)
//   - mode=full  → liste complète (page /alertes)
//   - mine=1     → filtre par consultant assigné au candidat (l'utilisateur actuel)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getDocumentAlerts,
  getDocumentAlertsForBell,
} from '@/lib/compliance/alerts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const mode = req.nextUrl.searchParams.get('mode') || 'bell'
    const mine = req.nextUrl.searchParams.get('mine') === '1'

    const consultantEmail = mine ? (user.email || undefined) : undefined

    const summary = mode === 'full'
      ? await getDocumentAlerts({ limit: 500, consultantEmail })
      : await getDocumentAlertsForBell(consultantEmail)

    return NextResponse.json(summary)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
