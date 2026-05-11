import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Extrait les images embarquées dans un fichier DOCX/DOC pour le modal PhotoCrop.
// Un .docx est un ZIP : les images sont dans word/media/imageN.jpg/png/etc.
// Retourne un tableau de dataURLs base64 triés par taille décroissante (les plus
// grandes en premier = plus probables d'être la photo du candidat).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')
  if (!url) return new NextResponse('Missing url', { status: 400 })

  try {
    const res = await fetch(url)
    if (!res.ok) return new NextResponse('Failed to fetch document', { status: 502 })
    const buffer = Buffer.from(await res.arrayBuffer())

    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(buffer)

    const mediaFiles = Object.keys(zip.files).filter(
      f => f.startsWith('word/media/') && /\.(jpg|jpeg|png|webp|gif)$/i.test(f)
    )

    const images: Array<{ name: string; dataUrl: string; size: number }> = []

    for (const path of mediaFiles) {
      try {
        const data = await zip.files[path].async('nodebuffer')
        if (!data || data.length < 500) continue
        const ext = path.split('.').pop()!.toLowerCase()
        const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg'
        images.push({
          name: path.split('/').pop() || path,
          dataUrl: `data:${mime};base64,${data.toString('base64')}`,
          size: data.length,
        })
      } catch { continue }
    }

    // Trier par taille décroissante (photo de CV = généralement le plus grand fichier)
    images.sort((a, b) => b.size - a.size)

    // Limiter à 20 pour ne pas saturer le client
    return NextResponse.json({ images: images.slice(0, 20) })
  } catch (err) {
    console.error('[docx-images]', err)
    return new NextResponse('Error extracting images', { status: 500 })
  }
}
