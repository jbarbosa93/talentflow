import { NextRequest, NextResponse } from 'next/server'
import { getMicrosoftAuthUrl } from '@/lib/microsoft'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  if (!process.env.MICROSOFT_CLIENT_ID) {
    return NextResponse.json(
      { error: 'MICROSOFT_CLIENT_ID manquant dans .env.local' },
      { status: 500 }
    )
  }

  const { searchParams } = new URL(request.url)
  const purpose = (searchParams.get('purpose') as 'onedrive' | 'email') || 'onedrive'

  // Pour connexion email personnelle : inclure le user_id dans le state OAuth
  if (purpose === 'email') {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }
    const url = getMicrosoftAuthUrl('email', user.id)
    return NextResponse.redirect(url)
  }

  const url = getMicrosoftAuthUrl('onedrive')
  return NextResponse.redirect(url)
}
