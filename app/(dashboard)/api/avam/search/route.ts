import { NextRequest, NextResponse } from 'next/server'
import avamCodes from '@/lib/avam-codes.json'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type AvamCode = { code: string; label: string }

// GET /api/avam/search?q=elec  → top 15 résultats
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim().toLowerCase() || ''

  if (q.length < 2) return NextResponse.json([])

  const results = (avamCodes as AvamCode[])
    .filter(item =>
      item.label.toLowerCase().includes(q) ||
      item.code.startsWith(q)
    )
    .slice(0, 15)

  return NextResponse.json(results)
}
