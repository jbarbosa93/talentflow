// Batch photo extraction for existing candidates
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const supabase = createAdminClient()

  const { batchSize = 10 } = await request.json().catch(() => ({}))

  // Get candidates with cv_url but no photo_url, limit to batch size
  const { data: candidates, error } = await supabase
    .from('candidats')
    .select('id, cv_url, cv_nom_fichier')
    .is('photo_url', null)
    .not('cv_url', 'is', null)
    .limit(batchSize)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!candidates?.length) return NextResponse.json({ done: true, processed: 0 })

  const { extractPhotoFromPDF } = await import('@/lib/cv-photo')
  let processed = 0
  let found = 0

  for (const cand of candidates) {
    try {
      const ext = (cand.cv_nom_fichier || '').toLowerCase().split('.').pop()
      if (ext !== 'pdf') {
        // Non-PDF: skip but count as processed
        processed++
        continue
      }

      // Download the CV
      if (!cand.cv_url) { processed++; continue }
      const cvRes = await fetch(cand.cv_url)
      if (!cvRes.ok) { processed++; continue }
      const buffer = Buffer.from(await cvRes.arrayBuffer())

      const photoBuffer = await extractPhotoFromPDF(buffer)
      if (photoBuffer) {
        const timestamp = Date.now()
        const safeFileName = (cand.cv_nom_fichier || 'cv').replace(/[^a-zA-Z0-9._-]/g, '_')
        const photoFileName = `photos/${cand.id}_${timestamp}_${safeFileName}.jpg`

        const { data: photoData } = await supabase.storage
          .from('cvs')
          .upload(photoFileName, photoBuffer, { contentType: 'image/jpeg', upsert: true })

        if (photoData?.path) {
          const { data: urlData } = await supabase.storage
            .from('cvs')
            .createSignedUrl(photoData.path, 60 * 60 * 24 * 365 * 10)

          if (urlData?.signedUrl) {
            await supabase.from('candidats').update({ photo_url: urlData.signedUrl }).eq('id', cand.id)
            found++
          }
        }
      }
      // If no photo found, leave photo_url as null so it won't be re-fetched infinitely.
      // To avoid reprocessing, we accept that candidates without photos will be retried each batch.
      processed++
    } catch (e) {
      console.error(`Photo extraction failed for ${cand.id}:`, e)
      processed++
    }
  }

  // Count remaining candidates without photos
  const { count: remaining } = await supabase
    .from('candidats')
    .select('*', { count: 'exact', head: true })
    .is('photo_url', null)
    .not('cv_url', 'is', null)

  return NextResponse.json({ done: (remaining || 0) === 0, processed, found, remaining: remaining || 0 })
}

export async function GET() {
  const supabase = createAdminClient()

  const { count: withoutPhoto } = await supabase
    .from('candidats')
    .select('*', { count: 'exact', head: true })
    .is('photo_url', null)
    .not('cv_url', 'is', null)

  const { count: total } = await supabase
    .from('candidats')
    .select('*', { count: 'exact', head: true })

  return NextResponse.json({ withoutPhoto: withoutPhoto || 0, total: total || 0 })
}
