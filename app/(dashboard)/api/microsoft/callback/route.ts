import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokens, getMicrosoftUser } from '@/lib/microsoft'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivity } from '@/lib/activity-log'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const stateParam = searchParams.get('state') || ''

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').includes('localhost')
    ? 'https://www.talent-flow.ch'
    : (process.env.NEXT_PUBLIC_APP_URL || 'https://www.talent-flow.ch')

  // Décoder le state : "talentflow-ats:onedrive" ou "talentflow-ats:email:USER_ID"
  const stateParts = stateParam.split(':')
  const purpose = stateParts[1] || 'onedrive'
  const userId = stateParts[2] || null

  // Page de retour selon le purpose
  const errorRedirect = purpose === 'email' && userId
    ? `${appUrl}/parametres?error_email=`
    : `${appUrl}/integrations?error=`

  if (error) {
    return NextResponse.redirect(
      `${errorRedirect}${encodeURIComponent(searchParams.get('error_description') || error)}`
    )
  }

  if (!code) {
    return NextResponse.redirect(`${errorRedirect}Code+manquant`)
  }

  try {
    const tokens = await exchangeCodeForTokens(code)

    if (tokens.error) {
      return NextResponse.redirect(
        `${errorRedirect}${encodeURIComponent(tokens.error_description || tokens.error)}`
      )
    }

    const msUser = await getMicrosoftUser(tokens.access_token)
    const email = msUser.mail || msUser.userPrincipalName
    const displayName = msUser.displayName

    const supabase = createAdminClient()
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    if (purpose === 'email' && userId) {
      // ── Connexion Outlook personnelle (par user) ───────────────────────────
      const { data: existing } = await supabase
        .from('integrations')
        .select('id')
        .eq('type', 'microsoft_email' as any)
        .filter('metadata->>user_id', 'eq', userId)
        .maybeSingle()

      if (existing) {
        await supabase.from('integrations').update({
          email,
          nom_compte: displayName,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: expiresAt,
          actif: true,
          metadata: { purpose: 'email', user_id: userId },
          updated_at: new Date().toISOString(),
        }).eq('id', existing.id)
      } else {
        await supabase.from('integrations').insert({
          type: 'microsoft_email' as any,
          email,
          nom_compte: displayName,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: expiresAt,
          actif: true,
          metadata: { purpose: 'email', user_id: userId },
        })
      }

      await logActivity({ action: 'microsoft_onedrive_connecte' as any, user_email: email })
      return NextResponse.redirect(`${appUrl}/parametres?success=microsoft_email`)
    }

    // ── Connexion OneDrive partagée (admin seulement) ──────────────────────
    const integrationType = 'microsoft_onedrive'

    const { data: existing } = await supabase
      .from('integrations')
      .select('id, metadata')
      .eq('type', integrationType)
      .maybeSingle()

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

    return NextResponse.redirect(`${appUrl}/integrations?success=microsoft_onedrive`)

  } catch (err) {
    console.error('[MS Callback] Error:', err)
    return NextResponse.redirect(
      `${errorRedirect}${encodeURIComponent('Erreur lors de la connexion')}`
    )
  }
}
