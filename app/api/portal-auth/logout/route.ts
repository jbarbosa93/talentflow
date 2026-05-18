// POST /api/portal-auth/logout — Supprime le cookie de session.
// Body: { accountType: 'client' | 'candidat' }

import { NextRequest, NextResponse } from 'next/server'
import { cookieName, type AccountType } from '@/lib/portal-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const accountType: AccountType = body.accountType === 'candidat' ? 'candidat' : 'client'

  const res = NextResponse.json({ ok: true })
  res.cookies.set(cookieName(accountType), '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  })
  return res
}
