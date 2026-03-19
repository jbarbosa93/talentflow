import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
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

  const { pathname } = request.nextUrl
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register') || pathname.startsWith('/verify-email')
  const isApiRoute = pathname.startsWith('/api')
  const isPublicAsset = pathname.startsWith('/_next') || pathname.startsWith('/favicon')

  // Si pas authentifié et pas sur une page auth → redirection login
  if (!user && !isAuthPage && !isApiRoute && !isPublicAsset) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Si authentifié mais email non confirmé → redirection verify-email
  if (user && !user.email_confirmed_at && !isAuthPage && !isApiRoute && !isPublicAsset) {
    const url = request.nextUrl.clone()
    url.pathname = '/verify-email'
    return NextResponse.redirect(url)
  }

  // Si authentifié avec email confirmé et sur une page auth → redirection dashboard
  if (user && user.email_confirmed_at && isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
