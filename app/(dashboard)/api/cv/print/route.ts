import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Proxy qui sert le CV avec Content-Type correct + Content-Disposition: inline
// pour forcer l'affichage dans le viewer PDF natif du navigateur (pas téléchargement)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')

  if (!url) {
    return new NextResponse('Missing url parameter', { status: 400 })
  }

  try {
    const res = await fetch(url)
    if (!res.ok) {
      return new NextResponse('Failed to fetch CV', { status: res.status })
    }

    const buffer = await res.arrayBuffer()

    // Détecter le type depuis l'extension de l'URL (pas les headers Supabase qui renvoient octet-stream)
    const ext = url.split('?')[0].split('.').pop()?.toLowerCase() || 'pdf'
    const contentType = ext === 'pdf' ? 'application/pdf'
      : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
      : ext === 'png' ? 'image/png'
      : 'application/pdf'

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': buffer.byteLength.toString(),
        'Content-Disposition': `inline; filename="cv.${ext}"`,
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return new NextResponse('Error fetching CV', { status: 500 })
  }
}
