// API Route: Rotate a PDF and return the rotated version
// GET /api/cv/rotate?url=...&rotation=180
// Returns the rotated PDF as a blob

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  const rotation = parseInt(request.nextUrl.searchParams.get('rotation') || '0', 10)

  if (!url) {
    return NextResponse.json({ error: 'URL manquante' }, { status: 400 })
  }

  if (rotation === 0) {
    // No rotation needed, redirect to original
    return NextResponse.redirect(url)
  }

  try {
    // Download the PDF
    const response = await fetch(url)
    if (!response.ok) {
      return NextResponse.json({ error: 'Impossible de télécharger le PDF' }, { status: 502 })
    }

    const buffer = Buffer.from(await response.arrayBuffer())

    // Rotate using pdf-lib
    const { PDFDocument, degrees } = await import('pdf-lib')
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true })

    const pageCount = pdfDoc.getPageCount()
    for (let i = 0; i < pageCount; i++) {
      const page = pdfDoc.getPage(i)
      const currentRotation = page.getRotation().angle
      page.setRotation(degrees((currentRotation + rotation) % 360))
    }

    const rotatedBytes = await pdfDoc.save()

    return new NextResponse(Buffer.from(rotatedBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (error) {
    console.error('[CV Rotate] Error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la rotation du PDF' },
      { status: 500 }
    )
  }
}
