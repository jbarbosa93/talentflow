// lib/portal-auth.ts
// Auth email + mot de passe pour le portail client + rapports candidat.
// Périmètre : /client-portal/[slug] et /report/[slug] uniquement.
// Ne touche PAS Sign / signature contrat / validation client rapport (token email).

import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import { randomBytes } from 'crypto'
import { cookies, headers } from 'next/headers'
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

// ──────────────────────────────────────────────────────────────────────────
// v2.13.6 — Lecture du JWT de session : header Authorization (app native iOS)
// OU cookie (navigateurs).
//
// L'app TalentFlow Sign (WKWebView) ne persiste PAS de façon fiable le cookie
// httpOnly posé par la réponse d'un fetch() → on bascule l'app sur un token
// `Authorization: Bearer <jwt>` (le client le stocke et l'ajoute aux requêtes).
// Le cookie reste la voie normale pour les navigateurs (web inchangé).
// À appeler dans un contexte de requête (route handler) uniquement.
export async function getPortalJwt(type: AccountType): Promise<string | null> {
  // 1) Header Authorization: Bearer <jwt> (app)
  try {
    const h = await headers()
    const auth = h.get('authorization')
    if (auth && /^Bearer\s+/i.test(auth)) {
      const t = auth.replace(/^Bearer\s+/i, '').trim()
      if (t) return t
    }
  } catch { /* headers() indisponible hors requête */ }
  // 2) Cookie de session (navigateurs)
  try {
    const jar = await cookies()
    return jar.get(cookieName(type))?.value || null
  } catch {
    return null
  }
}

/** Session vérifiée depuis le header Bearer OU le cookie (null si absente/invalide). */
export async function getPortalSession(type: AccountType): Promise<PortalSession | null> {
  const jwt = await getPortalJwt(type)
  return jwt ? verifySession(jwt) : null
}

export function sessionCookieOptions(_userAgent?: string | null) {
  // v2.13.5 — SameSite=Lax (revient sur le None de v2.13.3). L'app native charge
  // désormais le site DIRECTEMENT comme origine (server.url → first-party), donc
  // les requêtes API sont same-origin et le cookie est first-party. En first-party,
  // SameSite=None est CONTRE-PRODUCTIF (cible n°1 de l'ITP iOS → cookie bloqué) ;
  // Lax est le bon réglage → cookie persisté + envoyé, exactement comme sur le site
  // dans Safari. Lax bloque toujours le CSRF cross-site POST.
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
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
