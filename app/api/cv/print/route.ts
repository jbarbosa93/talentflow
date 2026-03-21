import { NextResponse } from 'next/server'

// Proxy qui sert le CV avec Content-Disposition: inline
// pour que le navigateur l'affiche dans l'iframe et permette l'impression
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

    // Détecter le type depuis l'URL (pas depuis les headers Supabase qui peuvent être faux)
    const ext = url.split('?')[0].split('.').pop()?.toLowerCase()
    const contentType = ext === 'pdf' ? 'application/pdf'
      : ext === 'doc' || ext === 'docx' ? 'application/msword'
      : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
      : ext === 'png' ? 'image/png'
      : 'application/pdf'

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="cv.${ext || 'pdf'}"`,
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch {
    return new NextResponse('Error fetching CV', { status: 500 })
  }
}
