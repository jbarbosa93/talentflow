// lib/portal-auth.ts
// Auth email + mot de passe pour le portail client + rapports candidat.
// Périmètre : /client-portal/[slug] et /report/[slug] uniquement.
// Ne touche PAS Sign / signature contrat / validation client rapport (token email).

import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import { randomBytes } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

// ──────────────────────────────────────────────────────────────────────────
// Constantes
// ──────────────────────────────────────────────────────────────────────────

export const BCRYPT_ROUNDS = 12
export const SESSION_TTL_DAYS = 30
export const INVITATION_TTL_DAYS = 7
export const RESET_TTL_HOURS = 1
export const COOKIE_NAME_CLIENT = 'tf_portal_client'
export const COOKIE_NAME_CANDIDAT = 'tf_portal_candidat'

// Rate limit
const RATE_LIMIT_MAX_ATTEMPTS = 5
const RATE_LIMIT_WINDOW_MINUTES = 15

export type AccountType = 'client' | 'candidat'

export interface PortalSession {
  accountId: string
  accountType: AccountType
  email: string
  portalId?: string | null
  reportLinkId?: string | null
}

// ──────────────────────────────────────────────────────────────────────────
// Secret JWT (env var obligatoire en prod)
// ──────────────────────────────────────────────────────────────────────────

function getJwtSecret(): Uint8Array {
  const secret = process.env.PORTAL_AUTH_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('PORTAL_AUTH_SECRET manquant ou trop court (32 chars min) dans .env.local')
  }
  return new TextEncoder().encode(secret)
}

// ──────────────────────────────────────────────────────────────────────────
// Password hashing
// ──────────────────────────────────────────────────────────────────────────

export async function hashPassword(plain: string): Promise<string> {
  if (!plain || plain.length < 8) throw new Error('Mot de passe trop court (8 caractères min)')
  return bcrypt.hash(plain, BCRYPT_ROUNDS)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!plain || !hash) return false
  try {
    return await bcrypt.compare(plain, hash)
  } catch {
    return false
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Tokens invitation / reset (stockés en DB, valeur opaque 32 chars hex)
// ──────────────────────────────────────────────────────────────────────────

export function generateOpaqueToken(): string {
  return randomBytes(32).toString('hex') // 64 chars hex, ~256 bits entropie
}

// ──────────────────────────────────────────────────────────────────────────
// JWT session (cookie HttpOnly, Secure, SameSite=Lax)
// ──────────────────────────────────────────────────────────────────────────

export async function signSession(payload: PortalSession): Promise<string> {
  const secret = getJwtSecret()
  return new SignJWT({
    aid: payload.accountId,
    typ: payload.accountType,
    email: payload.email,
    pid: payload.portalId || null,
    rlid: payload.reportLinkId || null,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_DAYS}d`)
    .sign(secret)
}

export async function verifySession(jwt: string): Promise<PortalSession | null> {
  if (!jwt) return null
  try {
    const secret = getJwtSecret()
    const { payload } = await jwtVerify(jwt, secret, { algorithms: ['HS256'] })
    return {
      accountId: payload.aid as string,
      accountType: payload.typ as AccountType,
      email: payload.email as string,
      portalId: (payload.pid as string) || null,
      reportLinkId: (payload.rlid as string) || null,
    }
  } catch {
    return null
  }
}

export function cookieName(type: AccountType): string {
  return type === 'client' ? COOKIE_NAME_CLIENT : COOKIE_NAME_CANDIDAT
}

export function sessionCookieOptions(userAgent?: string | null) {
  // v2.13.3 — App native iOS (TalentFlow Sign) : la webview démarre sur
  // `capacitor://localhost` puis charge le site distant. WKWebView traite alors
  // les requêtes XHR (`/api/portal-auth/me`, `/api/reports/...`) comme CROSS-SITE
  // → un cookie SameSite=Lax n'est PAS renvoyé → 401 → « connecté puis déconnecté ».
  // Pour l'app UNIQUEMENT (détectée par l'UA `TalentFlowSignApp`), on passe en
  // SameSite=None (envoyé en cross-site). Les navigateurs (Safari/desktop) restent
  // en Lax → aucune surface CSRF supplémentaire hors app.
  const isApp = !!userAgent && userAgent.includes('TalentFlowSignApp')
  return {
    httpOnly: true,
    // SameSite=None EXIGE Secure. En prod (https) secure=true → OK. L'app n'utilise
    // que la prod https, donc None+Secure est toujours valide pour elle.
    secure: process.env.NODE_ENV === 'production' || isApp,
    sameSite: (isApp ? 'none' : 'lax') as 'none' | 'lax',
    path: '/',
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60, // 30j en secondes
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Rate limit login (5 tentatives échouées par IP / 15 min)
// ──────────────────────────────────────────────────────────────────────────

export async function checkRateLimit(ip: string): Promise<{ allowed: boolean; remainingMinutes: number }> {
  if (!ip) return { allowed: true, remainingMinutes: 0 }
  const admin = createAdminClient()
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString()
  const { count } = await (admin as any)
    .from('portal_login_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip_address', ip)
    .eq('success', false)
    .gte('attempted_at', since)
  const failed = count || 0
  return {
    allowed: failed < RATE_LIMIT_MAX_ATTEMPTS,
    remainingMinutes: RATE_LIMIT_WINDOW_MINUTES,
  }
}

export async function logLoginAttempt(ip: string, email: string | null, success: boolean): Promise<void> {
  if (!ip) return
  try {
    const admin = createAdminClient()
    await (admin as any).from('portal_login_attempts').insert({
      ip_address: ip,
      email: email || null,
      success,
    })
  } catch {
    // best-effort, ne bloque pas le login
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers IP (extraction depuis NextRequest)
// ──────────────────────────────────────────────────────────────────────────

export function extractIp(headers: Headers): string {
  // Vercel / proxies : X-Forwarded-For en premier
  const xff = headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  const xri = headers.get('x-real-ip')
  if (xri) return xri.trim()
  return 'unknown'
}

// ──────────────────────────────────────────────────────────────────────────
// Normalisation email (toujours lowercase + trim)
// ──────────────────────────────────────────────────────────────────────────

export function normalizeEmail(email: string): string {
  return (email || '').trim().toLowerCase()
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
