// Cron extract-cv-text — appelé par Vercel toutes les 5 min
// Extrait cv_texte_brut pour les candidats dont il est NULL ou vide
// Pipeline : extraction locale (pdfjs/mammoth) → Vision IA (Haiku) → DOCX image-only → [scan-non-lisible]

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractTextFromCV } from '@/lib/cv-parser'
import { extractTextFromScan } from '@/lib/claude'

export const runtime = 'nodejs'
export const maxDuration = 300

const MIN_TEXT_LENGTH = 50
const BATCH_SIZE = 50

// Extensions supportées par Vision IA
const VISION_MEDIA_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

// Extensions d'images dans un DOCX (word/media/)
const DOCX_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'bmp', 'gif', 'tiff', 'tif']

export async function GET(request: Request) {
  // Auth Vercel Cron
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Filtre : NULL ou vide uniquement — exclut [scan-non-lisible] et [pdf-chiffre] (déjà traités)
  const orFilter = 'cv_texte_brut.is.null,cv_texte_brut.eq.'

  // Early return si rien à traiter
  const { count: totalRestant } = await supabase
    .from('candidats')
    .select('id', { count: 'exact', head: true })
    .or(orFilter)
    .not('cv_url', 'is', null)

  if (!totalRestant || totalRestant === 0) {
    return NextResponse.json({ traites: 0, restants: 0, message: 'Rien à traiter' })
  }

  // Récupérer le batch
  const { data: candidats, error: fetchErr } = await supabase
    .from('candidats')
    .select('id, cv_url, cv_nom_fichier')
    .or(orFilter)
    .not('cv_url', 'is', null)
    .limit(BATCH_SIZE)

  if (fetchErr || !candidats?.length) {
    return NextResponse.json({ traites: 0, restants: totalRestant, erreurs: [fetchErr?.message] })
  }

  let traites = 0
  let visionUsed = 0
  const erreurs: string[] = []

  for (const candidat of candidats) {
    try {
      const cvUrl = candidat.cv_url as string

      // ── Téléchargement ──────────────────────────────────────────────────────
      const res = await fetch(cvUrl)
      if (!res.ok) {
        erreurs.push(`#${candidat.id}: HTTP ${res.status}`)
        continue
      }

      const buffer = Buffer.from(await res.arrayBuffer())
      const filename = (candidat.cv_nom_fichier as string | null)
        || cvUrl.split('?')[0].split('/').pop()
        || 'cv.pdf'

      const ext = filename.toLowerCase().split('.').pop() || 'pdf'
      const mimeType = ext === 'pdf'   ? 'application/pdf'
        : ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : ext === 'doc'  ? 'application/msword'
        : ext === 'txt'  ? 'text/plain'
        : undefined

      // ── Étape 1 : extraction locale ─────────────────────────────────────────
      let texte = ''
      try {
        texte = await extractTextFromCV(buffer, filename, mimeType) || ''
      } catch (err: any) {
        if (err?.message === 'PDF_ENCRYPTED') {
          await supabase
            .from('candidats')
            .update({ cv_texte_brut: '[pdf-chiffre]' } as any)
            .eq('id', candidat.id)
          traites++
          continue
        }
        texte = ''
      }

      // ── Étape 2 : Vision IA — PDF scanné / JPG / PNG / WEBP ────────────────
      const visionMediaType = VISION_MEDIA_TYPES[ext] ?? null

      if (texte.trim().length < MIN_TEXT_LENGTH && visionMediaType) {
        try {
          const isImageExt = ext !== 'pdf'
          const visionOptions = isImageExt ? { sourceUrl: cvUrl } : undefined
          const visionText = await extractTextFromScan(buffer, visionMediaType as any, visionOptions)
          if (visionText && visionText.trim().length >= MIN_TEXT_LENGTH) {
            texte = visionText
            visionUsed++
          }
        } catch { /* Vision échoué → marqueur ci-dessous */ }
      }

      // ── Étape 3 : DOCX image-only — extraire image via JSZip → Vision ───────
      if (texte.trim().length < MIN_TEXT_LENGTH && ext === 'docx') {
        try {
          const JSZip = (await import('jszip')).default
          const zip = await JSZip.loadAsync(buffer)

          const mediaFiles = Object.keys(zip.files).filter(f =>
            f.startsWith('word/media/') &&
            !zip.files[f].dir &&
            DOCX_IMAGE_EXTS.some(e => f.toLowerCase().endsWith(`.${e}`))
          )

          if (mediaFiles.length > 0) {
            const imgBuffer = Buffer.from(await zip.files[mediaFiles[0]].async('arraybuffer'))
            const imgExt = mediaFiles[0].split('.').pop()?.toLowerCase() || 'jpg'
            const imgMediaType: any = imgExt === 'png' ? 'image/png' : 'image/jpeg'
            const visionText = await extractTextFromScan(imgBuffer, imgMediaType)
            if (visionText && visionText.trim().length >= MIN_TEXT_LENGTH) {
              texte = visionText
              visionUsed++
            }
          }
        } catch { /* JSZip/Vision échoué */ }
      }

      // ── Marqueur final si toujours insuffisant ──────────────────────────────
      if (!texte || texte.trim().length < MIN_TEXT_LENGTH) {
        await supabase
          .from('candidats')
          .update({ cv_texte_brut: '[scan-non-lisible]' } as any)
          .eq('id', candidat.id)
        traites++
        continue
      }

      // ── Sauvegarder le texte extrait ────────────────────────────────────────
      const { error: updateErr } = await supabase
        .from('candidats')
        .update({ cv_texte_brut: texte } as any)
        .eq('id', candidat.id)

      if (!updateErr) traites++
      else erreurs.push(`#${candidat.id}: erreur DB — ${updateErr.message}`)

    } catch (err: any) {
      erreurs.push(`#${candidat.id}: ${err?.message || 'Erreur inconnue'}`)
    }
  }

  const restants = Math.max(totalRestant - traites, 0)

  console.log(`[Cron extract-cv-text] traités: ${traites}, restants: ${restants}, vision: ${visionUsed}`)

  return NextResponse.json({ traites, restants, vision_used: visionUsed, erreurs })
}
