import { NextRequest, NextResponse } from 'next/server'
import { getMicrosoftAuthUrl } from '@/lib/microsoft'

export async function GET(request: NextRequest) {
  if (!process.env.MICROSOFT_CLIENT_ID) {
    return NextResponse.json(
      { error: 'MICROSOFT_CLIENT_ID manquant dans .env.local' },
      { status: 500 }
    )
  }
  const { searchParams } = new URL(request.url)
  const purpose = searchParams.get('purpose') as 'outlook' | 'onedrive' | null
  const url = getMicrosoftAuthUrl(purpose || undefined)
  return NextResponse.redirect(url)
}
