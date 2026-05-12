import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'

// Proxy qui sert le CV avec Content-Type correct + Content-Disposition: inline
// pour forcer l'affichage dans le viewer PDF natif du navigateur (pas téléchargement).
//
// v1.9.111 — Stream le body au lieu de buffer en RAM. Évite l'alerte Sentry
// "Large HTTP payload" (seuil ~500 KB) qui se déclenchait sur les CVs scannés
// pleine page (1-5 MB). Aucun changement fonctionnel : le navigateur reçoit
// exactement les mêmes octets, juste en transfer-encoding chunked.
export async function GET(request: Request) {
  const authError = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')

  if (!url) {
    return new NextResponse('Missing url parameter', { status: 400 })
  }

  // Whitelist : seules les URLs du projet Supabase sont autorisées (anti-SSRF)
  try {
    const supabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname
    const targetHost = new URL(url).hostname
    if (targetHost !== supabaseHost) {
      return new NextResponse('URL non autorisée', { status: 403 })
    }
  } catch {
    return new NextResponse('URL invalide', { status: 400 })
  }

  try {
    const res = await fetch(url)
    if (!res.ok || !res.body) {
      return new NextResponse('Failed to fetch CV', { status: res.status || 502 })
    }

    // Détecter le type depuis l'extension de l'URL (pas les headers Supabase qui renvoient octet-stream)
    const ext = url.split('?')[0].split('.').pop()?.toLowerCase() || 'pdf'
    const contentType = ext === 'pdf' ? 'application/pdf'
      : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
      : ext === 'png' ? 'image/png'
      : 'application/pdf'

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="cv.${ext}"`,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    }
    const upstreamLen = res.headers.get('content-length')
    if (upstreamLen) headers['Content-Length'] = upstreamLen

    return new NextResponse(res.body, { headers })
  } catch {
    return new NextResponse('Error fetching CV', { status: 500 })
  }
}
