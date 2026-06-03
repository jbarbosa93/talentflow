// TalentFlow — Envoi de notifications push via Firebase Cloud Messaging (HTTP v1)
// v2.10.21 — Léger : signe un JWT de compte de service avec `jose` (déjà présent),
// échange contre un access token OAuth, puis POST sur l'API FCM v1. Pas de
// dépendance firebase-admin (lourde).
//
// Variable d'env requise (serveur uniquement) : FIREBASE_SERVICE_ACCOUNT
//   = le JSON complet de la clé de compte de service (une seule ligne).

import { SignJWT, importPKCS8 } from 'jose'

interface ServiceAccount {
  project_id: string
  client_email: string
  private_key: string
}

function getServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) return null
  try {
    const sa = JSON.parse(raw) as ServiceAccount
    if (!sa.private_key || !sa.client_email || !sa.project_id) return null
    return sa
  } catch {
    return null
  }
}

// Cache de l'access token (valide ~1h) pour éviter de re-signer à chaque envoi.
let cachedToken: { token: string; exp: number } | null = null

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedToken.exp > now + 60) return cachedToken.token

  const key = await importPKCS8(sa.private_key, 'RS256')
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key)

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  const json = await res.json() as { access_token?: string; expires_in?: number; error?: string }
  if (!json.access_token) throw new Error(`FCM auth échouée: ${json.error || res.status}`)
  cachedToken = { token: json.access_token, exp: now + (json.expires_in || 3600) }
  return json.access_token
}

export interface PushResult { ok: boolean; error?: string; invalidToken?: boolean }

/**
 * Envoie une notification push à UN appareil (token FCM).
 * Retourne { ok, error, invalidToken }. invalidToken=true → token à supprimer en DB.
 */
export async function sendPushToToken(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>,
  imageUrl?: string,
): Promise<PushResult> {
  const sa = getServiceAccount()
  if (!sa) return { ok: false, error: 'FIREBASE_SERVICE_ACCOUNT non configuré' }
  const img = (imageUrl && /^https:\/\//.test(imageUrl)) ? imageUrl : undefined
  try {
    const accessToken = await getAccessToken(sa)
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          // image cross-plateforme (grande image dépliable Android + pièce jointe iOS)
          notification: { title, body, ...(img ? { image: img } : {}) },
          data: data || undefined,
          // priority high + canal "importance haute" → bannière pop-up (heads-up) Android
          android: {
            priority: 'high',
            notification: { channel_id: 'tf_default', sound: 'default', ...(img ? { image: img } : {}) },
          },
          apns: {
            payload: { aps: { sound: 'default', 'mutable-content': 1 } },
            ...(img ? { fcm_options: { image: img } } : {}),
          },
        },
      }),
    })
    if (res.ok) return { ok: true }
    const err = await res.json().catch(() => ({})) as { error?: { status?: string; message?: string } }
    // Token mort/désinscrit → à purger en DB
    const status = err?.error?.status
    const invalidToken = status === 'NOT_FOUND' || status === 'UNREGISTERED' || status === 'INVALID_ARGUMENT'
    return { ok: false, error: err?.error?.message || `FCM ${res.status}`, invalidToken }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Erreur envoi push' }
  }
}

/** Envoie à plusieurs tokens (best-effort). Retourne les tokens invalides à purger. */
export async function sendPushToTokens(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
  imageUrl?: string,
): Promise<{ sent: number; failed: number; invalidTokens: string[] }> {
  let sent = 0, failed = 0
  const invalidTokens: string[] = []
  for (const t of tokens) {
    const r = await sendPushToToken(t, title, body, data, imageUrl)
    if (r.ok) sent++
    else { failed++; if (r.invalidToken) invalidTokens.push(t) }
  }
  return { sent, failed, invalidTokens }
}
