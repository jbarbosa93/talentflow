// TalentFlow Rapports — Historique des submissions d'un lien (Phase 5)
// v2.2.6
// GET : liste DESC par week_start des submissions du lien

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { listSubmissions } from '@/lib/report/queries'

export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  // v2.2.6 — Routes dashboard sous /api/admin/reports/[id] (namespace distinct).
  ctx: { params: Promise<{ id: string }> },
) {
  const authError = await requireAuth()
  if (authError) return authError

  const { id } = await ctx.params
  const submissions = await listSubmissions(id)
  return NextResponse.json({ submissions })
}
