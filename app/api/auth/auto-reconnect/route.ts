// POST: pose le cookie tf_remember après un auto-logout (timeout 2h)
// GET:  vérifie le cookie et reconnecte silencieusement via magic link
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@supabase/ssr'

const COOKIE_NAME = 'tf_remember'
const ALGO = 'aes-256-gcm'
const EXPIRY_MS = 2 * 60 * 60 * 1000 // 2h

function getKey(): Buffer {
  const hex = process.env.SMTP_ENCRYPTION_KEY
  if (!hex) throw new Error('SMTP_ENCRYPTION_KEY manquante')
  const key = Buffer.from(hex, 'hex')
  if (key.length !== 32) throw new Error('SMTP_ENCRYPTION_KEY doit faire 32 bytes')
  return key
}

function encryptEmail(email: string): string {
  const key = getKey()
  const iv = randomBytes(12)
  const payload = JSON.stringify({ email, exp: Date.now() + EXPIRY_MS })
  const cipher = createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

function decryptEmail(token: string): { email: string; exp: number } | null {
  try {
    const [ivHex, authTagHex, encryptedHex] = token.split(':')
    const key = getKey()
    const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
    const decrypted = decipher.update(Buffer.from(encryptedHex, 'hex')) + decipher.final('utf8')
    return JSON.parse(decrypted)
  } catch {
    return null
  }
}

// POST — appelé par useSessionTimeout avant le signOut (auto-logout uniquement)
export async function POST(request: Request) {
  try {
    const { email } = await request.json()
    if (!email) return NextResponse.json({ error: 'email requis' }, { status: 400 })

    const encrypted = encryptEmail(email)
    const cookieStore = await cookies()
    cookieStore.set(COOKIE_NAME, encrypted, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7200, // 2h en secondes
      path: '/',
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[auto-reconnect] POST error:', (e as Error).message)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

// GET — appelé par la page login au mount pour tenter la reconnexion
export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value

  if (!token) {
    return NextResponse.json({ reconnected: false })
  }

  // Déchiffrer et valider l'expiry
  const data = decryptEmail(token)
  if (!data || Date.now() > data.exp) {
    // Cookie expiré ou invalide → supprimer
    cookieStore.set(COOKIE_NAME, '', { httpOnly: true, maxAge: 0, path: '/' })
    return NextResponse.json({ reconnected: false })
  }

  try {
    // Générer un magic link silencieux via admin
    const admin = createAdminClient()
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: data.email,
    })

    if (linkError || !linkData?.properties?.hashed_token) {
      cookieStore.set(COOKIE_NAME, '', { httpOnly: true, maxAge: 0, path: '/' })
      return NextResponse.json({ reconnected: false })
    }

    // Consommer le magic link côté serveur pour créer la session
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {}
          },
        },
      }
    )

    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink',
    })

    // Supprimer le cookie tf_remember (consommé)
    cookieStore.set(COOKIE_NAME, '', { httpOnly: true, maxAge: 0, path: '/' })

    if (verifyError) {
      console.error('[auto-reconnect] verifyOtp error:', verifyError.message)
      return NextResponse.json({ reconnected: false })
    }

    return NextResponse.json({ reconnected: true, email: data.email })
  } catch (e) {
    console.error('[auto-reconnect] GET error:', (e as Error).message)
    cookieStore.set(COOKIE_NAME, '', { httpOnly: true, maxAge: 0, path: '/' })
    return NextResponse.json({ reconnected: false })
  }
}

// DELETE — supprimer le cookie (logout manuel)
export async function DELETE() {
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, '', { httpOnly: true, maxAge: 0, path: '/' })
  return NextResponse.json({ ok: true })
}
