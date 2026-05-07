// TalentFlow Sign — Audit log d'une enveloppe
// v2.2.0 — Phase 1
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { getAuditLog } from '@/lib/sign/audit'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth()
  if (authError) return authError

  const { id } = await ctx.params
  const log = await getAuditLog(id)
  return NextResponse.json({ audit: log })
}
