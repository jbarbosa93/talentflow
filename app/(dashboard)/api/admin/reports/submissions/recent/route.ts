// TalentFlow Rapports — Liste cross-link des dernières submissions (Phase 5)
// v2.2.6
// GET : N dernières submissions pour la page /sign/rapports/submissions

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { listRecentSubmissions } from '@/lib/report/queries'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const limit = Math.min(Number(searchParams.get('limit')) || 50, 200)
  const submissions = await listRecentSubmissions(limit)
  return NextResponse.json({ submissions })
}
