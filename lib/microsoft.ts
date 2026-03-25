// lib/microsoft.ts
// Client Microsoft Graph API — OAuth 2.0 + appels API

import { createAdminClient } from './supabase/admin'
import type { Integration } from '@/types/database'

const TENANT = (process.env.MICROSOFT_TENANT_ID || 'common').trim()
const CLIENT_ID = (process.env.MICROSOFT_CLIENT_ID || '').trim()
const CLIENT_SECRET = (process.env.MICROSOFT_CLIENT_SECRET || '').trim()

function getRedirectUri() {
  const base = (process.env.NEXT_PUBLIC_APP_URL || '').trim()
  // Forcer production URL si localhost détecté
  const url = base.includes('localhost') ? 'https://www.talent-flow.ch' : (base || 'https://www.talent-flow.ch')
  return `${url}/api/microsoft/callback`
}

// Utiliser .default pour récupérer les permissions déjà consenties par l'admin
// Cela évite le blocage "Approbation administrateur requise" pour les apps non vérifiées
const SCOPES = 'https://graph.microsoft.com/.default offline_access'

export function getMicrosoftAuthUrl(purpose?: 'outlook' | 'onedrive'): string {
  const statePayload = purpose ? `talentflow-ats:${purpose}` : 'talentflow-ats'
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: getRedirectUri(),
    scope: SCOPES,
    response_mode: 'query',
    state: statePayload,
    prompt: 'select_account',
  })
  return `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize?${params}`
}

export async function exchangeCodeForTokens(code: string) {
  const response = await fetch(
    `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: getRedirectUri(),
        grant_type: 'authorization_code',
        scope: SCOPES,
      }),
    }
  )
  return response.json()
}

export async function refreshToken(refreshTokenValue: string) {
  const response = await fetch(
    `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: refreshTokenValue,
        grant_type: 'refresh_token',
        scope: SCOPES,
      }),
    }
  )
  return response.json()
}

export async function getValidAccessToken(integrationId: string): Promise<string> {
  const supabase = createAdminClient()
  const { data: integrationRaw, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('id', integrationId)
    .single()

  if (error || !integrationRaw) throw new Error('Intégration introuvable')
  const integration = integrationRaw as unknown as Integration

  if (!integration.expires_at) throw new Error('Token expiré manquant')
  if (!integration.access_token) throw new Error('Access token manquant')

  const expiresAt = new Date(integration.expires_at)
  const isExpired = expiresAt.getTime() - Date.now() < 5 * 60 * 1000

  if (isExpired) {
    if (!integration.refresh_token) throw new Error('Refresh token manquant. Reconnectez Microsoft.')
    const tokens = await refreshToken(integration.refresh_token)
    if (tokens.error) {
      throw new Error(`Refresh token invalide : ${tokens.error_description}. Reconnectez Microsoft.`)
    }
    const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    await supabase.from('integrations').update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || integration.refresh_token,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    }).eq('id', integrationId)
    return tokens.access_token as string
  }

  return integration.access_token
}

// Obtenir un token valide pour un purpose spécifique (outlook ou onedrive)
// Les tokens sont stockés dans metadata.outlook / metadata.onedrive
export async function getAccessTokenForPurpose(purpose: 'outlook' | 'onedrive'): Promise<{ token: string; integrationId: string }> {
  const supabase = createAdminClient()
  const targetType = purpose === 'outlook' ? 'microsoft_outlook' : 'microsoft_onedrive'

  // Chercher d'abord le nouveau type, puis fallback sur l'ancien 'microsoft'
  let { data: rowRaw } = await supabase.from('integrations').select('*').eq('type', targetType).eq('actif', true).maybeSingle()
  if (!rowRaw) {
    // Fallback : ancien type 'microsoft' avec metadata.purpose ou metadata[purpose]
    const { data: legacy } = await supabase.from('integrations').select('*').eq('type', 'microsoft').eq('actif', true).maybeSingle()
    rowRaw = legacy
  }
  const row = rowRaw as any
  if (!row) throw new Error(`Compte Microsoft ${purpose} non connecté`)

  // Les tokens sont directement dans la row (nouveau design)
  if (row.access_token) {
    return { token: await getValidAccessToken(row.id), integrationId: row.id }
  }

  // Legacy fallback : tokens dans metadata[purpose]
  const meta = row.metadata || {}
  const account = meta[purpose]

  if (!account?.access_token) {
    throw new Error(`Compte Microsoft ${purpose} non connecté`)
  }

  // Vérifier expiration
  const expiresAt = new Date(account.expires_at)
  const isExpired = expiresAt.getTime() - Date.now() < 5 * 60 * 1000

  if (isExpired && account.refresh_token) {
    const tokens = await refreshToken(account.refresh_token)
    if (tokens.error) throw new Error(`Token ${purpose} expiré. Reconnectez.`)
    const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    meta[purpose] = { ...account, access_token: tokens.access_token, refresh_token: tokens.refresh_token || account.refresh_token, expires_at: newExpiresAt }
    await supabase.from('integrations').update({ metadata: meta, updated_at: new Date().toISOString() }).eq('id', row.id)
    return { token: tokens.access_token, integrationId: row.id }
  }

  return { token: account.access_token, integrationId: row.id }
}

export async function callGraph(
  accessToken: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const response = await fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  if (response.status === 204) return null
  const data = await response.json()
  if (!response.ok) {
    throw new Error(`Graph API ${response.status}: ${data.error?.message || response.statusText}`)
  }
  return data
}

export async function getMicrosoftUser(accessToken: string) {
  return callGraph(accessToken, '/me?$select=displayName,mail,userPrincipalName')
}
