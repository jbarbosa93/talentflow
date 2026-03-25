import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokens, getMicrosoftUser } from '@/lib/microsoft'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivity } from '@/lib/activity-log'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const state = searchParams.get('state') || ''

  // Extract purpose from state (format: "talentflow-ats:outlook" or "talentflow-ats:onedrive")
  const purposeFromState = state.includes(':') ? state.split(':')[1] : null
  // Determine integration type based on purpose
  const integrationType = purposeFromState === 'outlook'
    ? 'microsoft_outlook'
    : purposeFromState === 'onedrive'
      ? 'microsoft_onedrive'
      : 'microsoft_onedrive' // default to onedrive for backward compat

  if (error) {
    return NextResponse.redirect(
      `${(process.env.NEXT_PUBLIC_APP_URL || '').includes('localhost') ? 'https://www.talent-flow.ch' : (process.env.NEXT_PUBLIC_APP_URL || 'https://www.talent-flow.ch')}/integrations?error=${encodeURIComponent(searchParams.get('error_description') || error)}`
    )
  }

  if (!code) {
    return NextResponse.redirect(
      `${(process.env.NEXT_PUBLIC_APP_URL || '').includes('localhost') ? 'https://www.talent-flow.ch' : (process.env.NEXT_PUBLIC_APP_URL || 'https://www.talent-flow.ch')}/integrations?error=Code+manquant`
    )
  }

  try {
    const tokens = await exchangeCodeForTokens(code)

    if (tokens.error) {
      return NextResponse.redirect(
        `${(process.env.NEXT_PUBLIC_APP_URL || '').includes('localhost') ? 'https://www.talent-flow.ch' : (process.env.NEXT_PUBLIC_APP_URL || 'https://www.talent-flow.ch')}/integrations?error=${encodeURIComponent(tokens.error_description || tokens.error)}`
      )
    }

    // Get user info
    const user = await getMicrosoftUser(tokens.access_token)
    const email = user.mail || user.userPrincipalName
    const displayName = user.displayName

    const supabase = createAdminClient()
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    // Chercher si une intégration de ce type existe déjà
    const { data: existing } = await supabase
      .from('integrations')
      .select('id')
      .eq('type', integrationType)
      .limit(1)
      .maybeSingle()

    if (existing) {
      // Update l'existante
      const { error: updateErr } = await supabase.from('integrations').update({
        email,
        nom_compte: displayName,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        actif: true,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id)
      if (updateErr) console.error('[MS Callback] Update error:', updateErr)
    } else {
      // Insert nouvelle
      const { error: insertErr } = await supabase.from('integrations').insert({
        type: integrationType,
        email,
        nom_compte: displayName,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        actif: true,
      })
      if (insertErr) console.error('[MS Callback] Insert error:', insertErr)
    }

    const actionLabel = purposeFromState === 'outlook' ? 'microsoft_outlook_connecte' : 'microsoft_onedrive_connecte'
    await logActivity({ action: actionLabel as any, user_email: email })

    return NextResponse.redirect(
      `${(process.env.NEXT_PUBLIC_APP_URL || '').includes('localhost') ? 'https://www.talent-flow.ch' : (process.env.NEXT_PUBLIC_APP_URL || 'https://www.talent-flow.ch')}/integrations?success=${integrationType}`
    )
  } catch (err) {
    console.error('[MS Callback] Error:', err)
    return NextResponse.redirect(
      `${(process.env.NEXT_PUBLIC_APP_URL || '').includes('localhost') ? 'https://www.talent-flow.ch' : (process.env.NEXT_PUBLIC_APP_URL || 'https://www.talent-flow.ch')}/integrations?error=${encodeURIComponent('Erreur lors de la connexion')}`
    )
  }
}
