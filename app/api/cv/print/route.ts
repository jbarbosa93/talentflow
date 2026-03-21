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
    const contentType = res.headers.get('content-type') || 'application/pdf'

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch {
    return new NextResponse('Error fetching CV', { status: 500 })
  }
}
