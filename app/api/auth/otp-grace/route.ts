// OTP Grace Period — évite de redemander le code si login récent (4h)
// Cookie httpOnly signé HMAC : email + expiry → impossible à falsifier côté client
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const SECRET  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const GRACE_MS = 4 * 60 * 60 * 1000 // 4 heures
const COOKIE_NAME = 'talentflow_otp_grace'

function sign(email: string, exp: number): string {
  return crypto
    .createHmac('sha256', SECRET)
    .update(`${email.toLowerCase()}:${exp}`)
    .digest('hex')
}

function parseGraceCookie(cookie: string): { email: string; exp: number } | null {
  try {
    const [payload, sig] = cookie.split('.')
    if (!payload || !sig) return null
    const { email, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!email || !exp) return null
    // Vérifier signature
    if (sign(email, exp) !== sig) return null
    return { email, exp }
  } catch { return null }
}

// GET ?email=xxx — vérifie si la grâce est active pour cet email
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email')?.toLowerCase()
  if (!email) return NextResponse.json({ skip: false })

  const cookieVal = req.cookies.get(COOKIE_NAME)?.value
  if (!cookieVal) return NextResponse.json({ skip: false })

  const parsed = parseGraceCookie(cookieVal)
  if (!parsed) return NextResponse.json({ skip: false })

  // Vérifier que c'est bien pour cet email ET pas expiré
  if (parsed.email !== email || Date.now() > parsed.exp) {
    return NextResponse.json({ skip: false })
  }

  return NextResponse.json({ skip: true })
}

// POST { email } — définit le cookie grace (appelé après login réussi)
export async function POST(req: NextRequest) {
  const { email } = await req.json()
  if (!email) return NextResponse.json({ ok: false }, { status: 400 })

  const exp = Date.now() + GRACE_MS
  const payload = Buffer.from(JSON.stringify({ email: email.toLowerCase(), exp })).toString('base64url')
  const sig = sign(email.toLowerCase(), exp)
  const cookieVal = `${payload}.${sig}`

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, cookieVal, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: GRACE_MS / 1000, // secondes
    path: '/',
  })
  return res
}

// DELETE — supprime la grâce (appelé au logout)
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  })
  return res
}
