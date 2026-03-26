import { NextRequest, NextResponse } from 'next/server'
import { getMicrosoftAuthUrl } from '@/lib/microsoft'

export async function GET(request: NextRequest) {
  if (!process.env.MICROSOFT_CLIENT_ID) {
    return NextResponse.json(
      { error: 'MICROSOFT_CLIENT_ID manquant dans .env.local' },
      { status: 500 }
    )
  }
  const url = getMicrosoftAuthUrl('onedrive')
  return NextResponse.redirect(url)
}
