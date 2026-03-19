import { NextResponse } from 'next/server'
import { getMicrosoftAuthUrl } from '@/lib/microsoft'

export async function GET() {
  if (!process.env.MICROSOFT_CLIENT_ID) {
    return NextResponse.json(
      { error: 'MICROSOFT_CLIENT_ID manquant dans .env.local' },
      { status: 500 }
    )
  }
  const url = getMicrosoftAuthUrl()
  return NextResponse.redirect(url)
}
