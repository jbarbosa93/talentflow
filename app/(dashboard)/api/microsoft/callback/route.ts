import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokens, getMicrosoftUser } from '@/lib/microsoft'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivity } from '@/lib/activity-log'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=${encodeURIComponent(searchParams.get('error_description') || error)}`
    )
  }

  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=Code+manquant`
    )
  }

  try {
    const tokens = await exchangeCodeForTokens(code)

    if (tokens.error) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=${encodeURIComponent(tokens.error_description || tokens.error)}`
      )
    }

    // Get user info
    const user = await getMicrosoftUser(tokens.access_token)
    const email = user.mail || user.userPrincipalName
    const displayName = user.displayName

    const supabase = createAdminClient()
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    // Upsert integration (one per type)
    const { error: dbError } = await supabase.from('integrations').upsert({
      type: 'microsoft',
      email,
      nom_compte: displayName,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      actif: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'type' })

    if (dbError) {
      console.error('[MS Callback] DB error:', dbError)
      // Try insert if upsert fails
      await supabase.from('integrations').insert({
        type: 'microsoft',
        email,
        nom_compte: displayName,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        actif: true,
      })
    }

    await logActivity({ action: 'microsoft_connecte', user_email: email })

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/integrations?success=microsoft`
    )
  } catch (err) {
    console.error('[MS Callback] Error:', err)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=${encodeURIComponent('Erreur lors de la connexion')}`
    )
  }
}
