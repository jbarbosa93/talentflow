// Batch photo extraction for existing candidates
// Supports force mode to re-extract ALL photos (including already extracted ones)
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const supabase = createAdminClient()

  const { batchSize = 10, force = false, offset = 0, candidatId } = await request.json().catch(() => ({}))

  // ── Mode individuel : extraction photo pour un seul candidat ──
  if (candidatId) {
    const { data: cand, error: cErr } = await supabase
      .from('candidats')
      .select('id, cv_url, cv_nom_fichier, photo_url')
      .eq('id', candidatId)
      .single()

    if (cErr || !cand) return NextResponse.json({ error: 'Candidat introuvable' }, { status: 404 })
    if (!cand.cv_url) return NextResponse.json({ error: 'Pas de CV' }, { status: 400 })

    const ext = (cand.cv_nom_fichier || cand.cv_url || '').toLowerCase().split('.').pop()
    if (ext !== 'pdf') return NextResponse.json({ error: 'CV non-PDF, extraction photo non supportée' }, { status: 400 })

    const { extractPhotoFromPDF } = await import('@/lib/cv-photo')
    const cvRes = await fetch(cand.cv_url)
    if (!cvRes.ok) return NextResponse.json({ error: 'Impossible de télécharger le CV' }, { status: 502 })
    const buffer = Buffer.from(await cvRes.arrayBuffer())
    const photoBuffer = await extractPhotoFromPDF(buffer)

    if (!photoBuffer) {
      return NextResponse.json({ found: false, message: 'Aucune photo de visage détectée dans ce CV' })
    }

    // Supprimer ancienne photo si elle existe
    if (cand.photo_url && cand.photo_url !== 'checked') {
      try {
        const oldPath = cand.photo_url.split('/cvs/')[1]?.split('?')[0]
        if (oldPath) await supabase.storage.from('cvs').remove([decodeURIComponent(oldPath)])
      } catch {}
    }

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
        return NextResponse.json({ found: true, photo_url: urlData.signedUrl })
      }
    }
    return NextResponse.json({ found: false, message: 'Erreur upload photo' })
  }

  // ── Mode batch ──
  let candidates: any[] | null = null
  let error: any = null
  let totalToProcess = 0

  const FIELDS = 'id, nom, prenom, titre_poste, cv_url, cv_nom_fichier, photo_url'

  if (force) {
    // Force mode: re-extract ALL candidates with a CV (even those with photos)
    const countResult = await supabase
      .from('candidats')
      .select('*', { count: 'exact', head: true })
      .not('cv_url', 'is', null)
    totalToProcess = countResult.count || 0

    const result = await supabase
      .from('candidats')
      .select(FIELDS)
      .not('cv_url', 'is', null)
      .order('created_at', { ascending: true })
      .range(offset, offset + batchSize - 1)

    candidates = result.data
    error = result.error
  } else {
    // Normal mode: only candidates sans vraie photo (null OU 'checked')
    const { data: nullPhotos, error: e1 } = await supabase
      .from('candidats')
      .select(FIELDS)
      .is('photo_url', null)
      .not('cv_url', 'is', null)
      .limit(batchSize)

    const remaining = batchSize - (nullPhotos?.length || 0)
    let checkedPhotos: any[] = []
    if (remaining > 0) {
      const { data: cp } = await supabase
        .from('candidats')
        .select(FIELDS)
        .eq('photo_url', 'checked')
        .not('cv_url', 'is', null)
        .limit(remaining)
      checkedPhotos = cp || []
    }

    candidates = [...(nullPhotos || []), ...checkedPhotos]
    error = e1
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!candidates?.length) return NextResponse.json({ done: true, processed: 0, found: 0, remaining: 0 })

  const { extractPhotoFromPDF } = await import('@/lib/cv-photo')
  let processed = 0
  let found = 0
  const foundCandidats: { id: string; nom: string; prenom: string | null; titre_poste: string | null; photo_url: string }[] = []

  for (const cand of candidates) {
    try {
      const ext = (cand.cv_nom_fichier || cand.cv_url || '').toLowerCase().split('.').pop()
      if (!['pdf'].includes(ext || '')) {
        // Non-PDF: mark as checked (no photo extraction possible from non-PDF)
        if (!cand.photo_url || cand.photo_url === 'checked' || force) {
          await supabase.from('candidats').update({ photo_url: 'checked' }).eq('id', cand.id)
        }
        processed++
        continue
      }

      if (!cand.cv_url) { processed++; continue }

      // Download the CV
      const cvRes = await fetch(cand.cv_url)
      if (!cvRes.ok) { processed++; continue }
      const buffer = Buffer.from(await cvRes.arrayBuffer())

      const photoBuffer = await extractPhotoFromPDF(buffer)

      if (photoBuffer) {
        // Delete old photo from storage if it exists
        if (cand.photo_url && cand.photo_url !== 'checked') {
          try {
            const oldPath = cand.photo_url.split('/cvs/')[1]?.split('?')[0]
            if (oldPath) {
              await supabase.storage.from('cvs').remove([decodeURIComponent(oldPath)])
            }
          } catch {}
        }

        // Upload new photo
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
            foundCandidats.push({ id: cand.id, nom: cand.nom, prenom: cand.prenom, titre_poste: cand.titre_poste, photo_url: urlData.signedUrl })
          }
        }
      } else {
        // No headshot found → delete old bad photo if force mode, mark as checked
        if (force && cand.photo_url && cand.photo_url !== 'checked') {
          try {
            const oldPath = cand.photo_url.split('/cvs/')[1]?.split('?')[0]
            if (oldPath) {
              await supabase.storage.from('cvs').remove([decodeURIComponent(oldPath)])
            }
          } catch {}
        }
        await supabase.from('candidats').update({ photo_url: 'checked' }).eq('id', cand.id)
      }
      processed++
    } catch (e) {
      console.error(`Photo extraction failed for ${cand.id}:`, e)
      processed++
    }
  }

  // Calculate remaining
  let remaining = 0
  if (force) {
    remaining = Math.max(0, totalToProcess - offset - processed)
  } else {
    // Compter null + checked
    const { count: nullCount } = await supabase
      .from('candidats')
      .select('*', { count: 'exact', head: true })
      .is('photo_url', null)
      .not('cv_url', 'is', null)
    const { count: checkedCount } = await supabase
      .from('candidats')
      .select('*', { count: 'exact', head: true })
      .eq('photo_url', 'checked')
      .not('cv_url', 'is', null)
    remaining = (nullCount || 0) + (checkedCount || 0)
  }

  return NextResponse.json({
    done: remaining === 0,
    processed,
    found,
    remaining,
    nextOffset: force ? offset + processed : undefined,
    foundCandidats,
  })
}

export async function GET() {
  const supabase = createAdminClient()

  // Candidats avec une vraie photo (pas null, pas 'checked')
  const { count: withPhoto } = await supabase
    .from('candidats')
    .select('*', { count: 'exact', head: true })
    .not('photo_url', 'is', null)
    .neq('photo_url', 'checked')
    .not('cv_url', 'is', null)

  // Total candidats avec CV
  const { count: total } = await supabase
    .from('candidats')
    .select('*', { count: 'exact', head: true })
    .not('cv_url', 'is', null)

  // Sans photo = total - avec photo (inclut null ET 'checked')
  const withPhotoCount = withPhoto || 0
  const totalCount = total || 0

  return NextResponse.json({
    withoutPhoto: totalCount - withPhotoCount,
    withPhoto: withPhotoCount,
    total: totalCount,
  })
}
