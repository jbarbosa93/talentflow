import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokens, getMicrosoftUser } from '@/lib/microsoft'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivity } from '@/lib/activity-log'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').includes('localhost')
    ? 'https://www.talent-flow.ch'
    : (process.env.NEXT_PUBLIC_APP_URL || 'https://www.talent-flow.ch')

  if (error) {
    return NextResponse.redirect(
      `${appUrl}/integrations?error=${encodeURIComponent(searchParams.get('error_description') || error)}`
    )
  }

  if (!code) {
    return NextResponse.redirect(
      `${appUrl}/integrations?error=Code+manquant`
    )
  }

  try {
    const tokens = await exchangeCodeForTokens(code)

    if (tokens.error) {
      return NextResponse.redirect(
        `${appUrl}/integrations?error=${encodeURIComponent(tokens.error_description || tokens.error)}`
      )
    }

    // Get user info
    const user = await getMicrosoftUser(tokens.access_token)
    const email = user.mail || user.userPrincipalName
    const displayName = user.displayName

    const supabase = createAdminClient()
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    // OneDrive uniquement
    const integrationType = 'microsoft_onedrive'

    // Chercher si cette integration existe deja
    const { data: existing } = await supabase
      .from('integrations')
      .select('id, metadata')
      .eq('type', integrationType)
      .maybeSingle()

    // Preserver la config SharePoint si elle existe
    const existingMeta = (existing?.metadata as any) || {}

    console.log(`[MS Callback] type=${integrationType}, email=${email}, existing=${existing?.id || 'none'}`)

    if (existing) {
      const { error: updateErr } = await supabase.from('integrations').update({
        email,
        nom_compte: displayName,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        actif: true,
        metadata: { ...existingMeta, purpose: 'onedrive' },
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id)
      console.log('[MS Callback] Update result:', updateErr?.message || 'OK')
    } else {
      const { error: insertErr } = await supabase.from('integrations').insert({
        type: integrationType as any,
        email,
        nom_compte: displayName,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        actif: true,
        metadata: { purpose: 'onedrive' },
      })
      console.log('[MS Callback] Insert result:', insertErr?.message || 'OK')
    }

    await logActivity({ action: 'microsoft_onedrive_connecte' as any, user_email: email })

    // NOTE: la table emails_recus est deprecated et n'est plus utilisee.
    // Elle peut etre supprimee lors d'une future migration.

    return NextResponse.redirect(
      `${appUrl}/integrations?success=microsoft_onedrive`
    )
  } catch (err) {
    console.error('[MS Callback] Error:', err)
    return NextResponse.redirect(
      `${appUrl}/integrations?error=${encodeURIComponent('Erreur lors de la connexion')}`
    )
  }
}
