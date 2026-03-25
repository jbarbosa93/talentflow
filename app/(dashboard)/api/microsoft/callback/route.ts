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
  // Toujours utiliser type='microsoft' (contrainte DB) — on distingue par metadata.purpose
  const integrationType = 'microsoft'
  const purpose = purposeFromState || 'onedrive'

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

    // UNE seule row type='microsoft' (contrainte UNIQUE sur type)
    // On stocke les 2 comptes (outlook + onedrive) dans metadata
    const { data: existingRow } = await supabase
      .from('integrations')
      .select('id, metadata, email, nom_compte, access_token, refresh_token')
      .eq('type', 'microsoft')
      .maybeSingle()

    const meta = (existingRow?.metadata as any) || {}

    // Stocker les tokens du compte connecté dans metadata[purpose]
    const accountData = {
      email,
      nom_compte: displayName,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
    }

    const newMeta = {
      ...meta,
      [purpose]: { ...(meta[purpose] || {}), ...accountData }, // merge sans écraser la config SharePoint
      purpose: meta.purpose || purpose,
    }

    console.log(`[MS Callback] purpose=${purpose}, email=${email}, existing=${existingRow?.id || 'none'}`)

    if (existingRow) {
      // Update la row existante — le champ principal (email, access_token) reste le premier connecté
      // Les tokens de chaque compte sont dans metadata.outlook / metadata.onedrive
      const { error: updateErr } = await supabase.from('integrations').update({
        metadata: newMeta,
        actif: true,
        updated_at: new Date().toISOString(),
        // Si c'est le même purpose que le principal, update aussi les champs principaux
        ...(meta.purpose === purpose || !existingRow.access_token ? {
          email,
          nom_compte: displayName,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: expiresAt,
        } : {}),
      }).eq('id', existingRow.id)
      console.log('[MS Callback] Update result:', updateErr?.message || 'OK')
    } else {
      const { error: insertErr } = await supabase.from('integrations').insert({
        type: 'microsoft' as any,
        email,
        nom_compte: displayName,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        actif: true,
        metadata: newMeta,
      })
      console.log('[MS Callback] Insert result:', insertErr?.message || 'OK')
    }

    const actionLabel = purposeFromState === 'outlook' ? 'microsoft_outlook_connecte' : 'microsoft_onedrive_connecte'
    await logActivity({ action: actionLabel as any, user_email: email })

    return NextResponse.redirect(
      `${(process.env.NEXT_PUBLIC_APP_URL || '').includes('localhost') ? 'https://www.talent-flow.ch' : (process.env.NEXT_PUBLIC_APP_URL || 'https://www.talent-flow.ch')}/integrations?success=microsoft_${purpose}`
    )
  } catch (err) {
    console.error('[MS Callback] Error:', err)
    return NextResponse.redirect(
      `${(process.env.NEXT_PUBLIC_APP_URL || '').includes('localhost') ? 'https://www.talent-flow.ch' : (process.env.NEXT_PUBLIC_APP_URL || 'https://www.talent-flow.ch')}/integrations?error=${encodeURIComponent('Erreur lors de la connexion')}`
    )
  }
}
