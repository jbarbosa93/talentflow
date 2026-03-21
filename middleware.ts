import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// ── Rate limiting (in-memory, par IP) ────────────────────────────────────────
// Max 10 tentatives de login par IP sur une fenêtre de 5 minutes
const RATE_LIMIT_MAX      = 10
const RATE_LIMIT_WINDOW   = 5 * 60 * 1000  // 5 min en ms
const loginAttempts = new Map<string, { count: number; windowStart: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = loginAttempts.get(ip)

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    loginAttempts.set(ip, { count: 1, windowStart: now })
    return false
  }

  if (entry.count >= RATE_LIMIT_MAX) return true

  entry.count++
  return false
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Rate limiting sur les routes d'auth sensibles ─────────────────────────
  const isLoginRoute = pathname === '/login' || pathname.startsWith('/api/auth/send-otp')
  if (isLoginRoute && request.method === 'POST') {
    const ip = getClientIp(request)
    if (isRateLimited(ip)) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'Trop de tentatives. Réessayez dans 5 minutes.' },
          { status: 429 }
        )
      }
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('error', 'rate_limit')
      return NextResponse.redirect(url)
    }
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session - IMPORTANT: ne pas supprimer ce code
  const { data: { user } } = await supabase.auth.getUser()

  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register') || pathname.startsWith('/verify-email')
  const isApiRoute = pathname.startsWith('/api')
  const isPublicAsset = pathname.startsWith('/_next') || pathname.startsWith('/favicon')
  const isLandingPage = pathname === '/'

  const isProtectedRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/candidats') ||
    pathname.startsWith('/offres') ||
    pathname.startsWith('/pipeline') ||
    pathname.startsWith('/entretiens') ||
    pathname.startsWith('/messages') ||
    pathname.startsWith('/matching') ||
    pathname.startsWith('/integrations') ||
    pathname.startsWith('/parametres')

  // Si pas authentifié et sur une route protégée → redirection login
  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Si authentifié mais email non confirmé et sur une route protégée → redirection verify-email
  if (user && !user.email_confirmed_at && isProtectedRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/verify-email'
    return NextResponse.redirect(url)
  }

  // Restriction par domaine email
  const allowedDomainsEnv = process.env.ALLOWED_EMAIL_DOMAINS
  if (allowedDomainsEnv && user && user.email && isProtectedRoute) {
    const allowedDomains = allowedDomainsEnv.split(',').map(d => d.trim().toLowerCase()).filter(Boolean)
    const userEmailDomain = user.email.split('@')[1]?.toLowerCase() || ''
    const isDomainAllowed = allowedDomains.some(domain => userEmailDomain === domain)

    if (!isDomainAllowed) {
      await supabase.auth.signOut()
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('error', 'domain')
      return NextResponse.redirect(url)
    }
  }

  // Si authentifié avec email confirmé et sur une page auth → redirection dashboard
  if (user && user.email_confirmed_at && isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Exclure : fichiers statiques, assets, et toutes les routes /api/
    // Les API routes ont leur propre auth (createAdminClient) → le middleware n'est pas nécessaire
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
