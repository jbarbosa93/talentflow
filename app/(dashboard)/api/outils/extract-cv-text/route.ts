// POST /api/outils/extract-cv-text
// Batch-extract texte brut depuis les CVs où cv_texte_brut est NULL/vide
// Pipeline d'extraction par priorité :
//   1. Extraction locale  : pdfjs / mammoth / word-extractor
//   2. Vision IA PDF/image: Claude Haiku (PDF scanné, JPG, PNG, WEBP)
//   3. Vision IA DOCX     : JSZip extrait la 1re image → Vision (DOCX image-only)
//   4. Marqueurs finaux   : [pdf-chiffre] | [scan-non-lisible]

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractTextFromCV } from '@/lib/cv-parser'
import { extractTextFromScan } from '@/lib/claude'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'
export const maxDuration = 120
export const preferredRegion = 'dub1'

const MIN_TEXT_LENGTH = 50

// Extensions supportées par Vision IA
const VISION_MEDIA_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

// Extensions d'images extractibles depuis un DOCX (word/media/)
const DOCX_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'bmp', 'gif', 'tiff', 'tif']

export async function POST(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const body = await request.json().catch(() => ({}))
    const batchSize = Math.min(Math.max(body.batch_size ?? 5, 1), 20)

    const supabase = createAdminClient()

    // Filtre : NULL, vide ou scan-non-lisible (retente après améliorations) + doit avoir un CV
    // [pdf-chiffre] est exclu → ne jamais retenter les PDFs chiffrés
    const orFilter = 'cv_texte_brut.is.null,cv_texte_brut.eq.,cv_texte_brut.eq.[scan-non-lisible]'

    // Compter le total restant
    const { count: totalRestant } = await supabase
      .from('candidats')
      .select('id', { count: 'exact', head: true })
      .or(orFilter)
      .not('cv_url', 'is', null)

    // Recuperer le batch
    const { data: candidats, error: fetchErr } = await supabase
      .from('candidats')
      .select('id, cv_url, cv_nom_fichier')
      .or(orFilter)
      .not('cv_url', 'is', null)
      .limit(batchSize)

    if (fetchErr) {
      return NextResponse.json({ error: `Erreur DB : ${fetchErr.message}` }, { status: 500 })
    }

    if (!candidats || candidats.length === 0) {
      return NextResponse.json({ traites: 0, restants: 0, erreurs: [] })
    }

    let traites = 0
    let visionUsed = 0
    const erreurs: string[] = []

    for (const candidat of candidats) {
      try {
        const cvUrl = candidat.cv_url as string

        // ── Téléchargement ─────────────────────────────────────────────────
        const res = await fetch(cvUrl)
        if (!res.ok) {
          erreurs.push(`#${candidat.id}: HTTP ${res.status} — impossible de télécharger`)
          continue
        }

        const arrayBuf = await res.arrayBuffer()
        const buffer = Buffer.from(arrayBuf)

        const filename = (candidat.cv_nom_fichier as string | null)
          || cvUrl.split('?')[0].split('/').pop()
          || 'cv.pdf'

        const ext = filename.toLowerCase().split('.').pop() || 'pdf'
        const mimeType = ext === 'pdf'   ? 'application/pdf'
          : ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : ext === 'doc'  ? 'application/msword'
          : ext === 'txt'  ? 'text/plain'
          : undefined

        // ── Étape 1 : extraction locale ────────────────────────────────────
        let texte = ''
        try {
          texte = await extractTextFromCV(buffer, filename, mimeType) || ''
        } catch (err: any) {
          if (err?.message === 'PDF_ENCRYPTED') {
            // PDF chiffré → Vision ne peut rien faire non plus
            await supabase
              .from('candidats')
              .update({ cv_texte_brut: '[pdf-chiffre]' } as any)
              .eq('id', candidat.id)
            erreurs.push(`#${candidat.id}: PDF chiffré (${filename})`)
            traites++
            continue
          }
          texte = ''
        }

        // ── Étape 2 : Vision IA — PDF scan / JPG / PNG / WEBP ─────────────
        const visionMediaType = VISION_MEDIA_TYPES[ext] ?? null

        if (texte.trim().length < MIN_TEXT_LENGTH && visionMediaType) {
          try {
            const visionText = await extractTextFromScan(buffer, visionMediaType as any)
            if (visionText && visionText.trim().length >= MIN_TEXT_LENGTH) {
              texte = visionText
              visionUsed++
            }
          } catch (visionErr: any) {
            erreurs.push(`#${candidat.id}: Vision échoué (${ext.toUpperCase()}) — ${visionErr?.message || 'erreur'}`)
          }
        }

        // ── Étape 3 : DOCX image-only — extraire image via JSZip → Vision ──
        if (texte.trim().length < MIN_TEXT_LENGTH && ext === 'docx') {
          try {
            const JSZip = (await import('jszip')).default
            const zip = await JSZip.loadAsync(buffer)

            // Chercher la première image dans word/media/
            const mediaFiles = Object.keys(zip.files)
              .filter(f =>
                f.startsWith('word/media/') &&
                !zip.files[f].dir &&
                DOCX_IMAGE_EXTS.some(imgExt => f.toLowerCase().endsWith(`.${imgExt}`))
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
          } catch {
            // JSZip/Vision échoué → sera marqué [scan-non-lisible] ci-dessous
          }
        }

        // ── Échec final — marquer pour éviter boucle infinie ──────────────
        if (!texte || texte.trim().length < MIN_TEXT_LENGTH) {
          const raison =
            ext === 'doc'  ? 'DOC binaire image-only non lisible' :
            ext === 'docx' ? 'DOCX sans texte ni image extractible' :
            `texte insuffisant après toutes tentatives (${ext.toUpperCase()})`

          erreurs.push(`#${candidat.id}: ${raison} — ${filename}`)
          await supabase
            .from('candidats')
            .update({ cv_texte_brut: '[scan-non-lisible]' } as any)
            .eq('id', candidat.id)
          traites++
          continue
        }

        // ── Sauvegarder le texte extrait ───────────────────────────────────
        const { error: updateErr } = await supabase
          .from('candidats')
          .update({ cv_texte_brut: texte } as any)
          .eq('id', candidat.id)

        if (updateErr) {
          erreurs.push(`#${candidat.id}: erreur update DB — ${updateErr.message}`)
          continue
        }

        traites++
      } catch (err: any) {
        erreurs.push(`#${candidat.id}: ${err?.message || 'Erreur inconnue'}`)
      }
    }

    const restants = Math.max((totalRestant ?? 0) - traites, 0)

    return NextResponse.json({
      traites,
      restants,
      vision_used: visionUsed,
      erreurs,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: `Erreur serveur : ${err?.message || 'inconnue'}` },
      { status: 500 }
    )
  }
}
