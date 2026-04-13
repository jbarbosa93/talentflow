// POST /api/outils/extract-cv-text
// Batch-extract texte brut depuis les CVs ou cv_texte_brut est NULL
// 1. Extraction locale (pdfjs-dist, mammoth, word-extractor)
// 2. Fallback Vision IA pour les PDFs scannes (< 50 chars)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractTextFromCV } from '@/lib/cv-parser'
import { extractTextFromScan } from '@/lib/claude'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'
export const maxDuration = 120
export const preferredRegion = 'dub1'

const MIN_TEXT_LENGTH = 50

export async function POST(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const body = await request.json().catch(() => ({}))
    const batchSize = Math.min(Math.max(body.batch_size ?? 5, 1), 20)

    const supabase = createAdminClient()

    // Compter le total restant (NULL ou vide = à retraiter)
    const { count: totalNull } = await supabase
      .from('candidats')
      .select('id', { count: 'exact', head: true })
      .is('cv_texte_brut', null)
      .not('cv_url', 'is', null)

    const { count: totalVide } = await supabase
      .from('candidats')
      .select('id', { count: 'exact', head: true })
      .eq('cv_texte_brut' as any, '')
      .not('cv_url', 'is', null)

    const totalRestant = (totalNull ?? 0) + (totalVide ?? 0)

    // Recuperer le batch : d'abord les NULL, puis les vides (scans non traites)
    let candidats: any[] = []

    const { data: nullCandidats, error: fetchErr } = await supabase
      .from('candidats')
      .select('id, cv_url, cv_nom_fichier')
      .is('cv_texte_brut', null)
      .not('cv_url', 'is', null)
      .limit(batchSize)

    if (fetchErr) {
      return NextResponse.json({ error: `Erreur DB : ${fetchErr.message}` }, { status: 500 })
    }

    candidats = nullCandidats || []

    // S'il reste de la place dans le batch, prendre les vides (scans a retraiter avec Vision)
    if (candidats.length < batchSize) {
      const remaining = batchSize - candidats.length
      const { data: videCandidats } = await supabase
        .from('candidats')
        .select('id, cv_url, cv_nom_fichier')
        .eq('cv_texte_brut' as any, '')
        .not('cv_url', 'is', null)
        .limit(remaining)
      if (videCandidats) candidats = [...candidats, ...videCandidats]
    }

    if (candidats.length === 0) {
      return NextResponse.json({ traites: 0, restants: 0, erreurs: [] })
    }

    let traites = 0
    let visionUsed = 0
    const erreurs: string[] = []

    for (const candidat of candidats) {
      try {
        const cvUrl = candidat.cv_url as string

        // Telecharger le CV
        const res = await fetch(cvUrl)
        if (!res.ok) {
          erreurs.push(`#${candidat.id}: HTTP ${res.status} lors du telechargement`)
          continue
        }

        const arrayBuf = await res.arrayBuffer()
        const buffer = Buffer.from(arrayBuf)

        const filename = candidat.cv_nom_fichier
          || cvUrl.split('?')[0].split('/').pop()
          || 'cv.pdf'

        const ext = filename.toLowerCase().split('.').pop() || 'pdf'
        const mimeType = ext === 'pdf' ? 'application/pdf'
          : ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : ext === 'doc' ? 'application/msword'
          : ext === 'txt' ? 'text/plain'
          : undefined

        // Etape 1 : extraction locale
        let texte = ''
        try {
          texte = await extractTextFromCV(buffer, filename, mimeType) || ''
        } catch {
          texte = ''
        }

        // Etape 2 : si texte trop court et PDF → fallback Vision IA
        if (texte.trim().length < MIN_TEXT_LENGTH && ext === 'pdf') {
          try {
            console.log(`[extract-cv-text] Scan detecte pour ${candidat.id} (${filename}), fallback Vision...`)
            const visionText = await extractTextFromScan(buffer)
            if (visionText && visionText.trim().length >= MIN_TEXT_LENGTH) {
              texte = visionText
              visionUsed++
            }
          } catch (visionErr: any) {
            erreurs.push(`#${candidat.id}: Vision echoue — ${visionErr?.message || 'erreur'}`)
          }
        }

        // Si toujours vide apres Vision → marquer comme echec
        if (!texte || texte.trim().length < MIN_TEXT_LENGTH) {
          erreurs.push(`#${candidat.id}: texte insuffisant apres Vision (${filename})`)
          // Mettre un marqueur pour ne pas retraiter indefiniment
          await supabase
            .from('candidats')
            .update({ cv_texte_brut: '[scan-non-lisible]' } as any)
            .eq('id', candidat.id)
          traites++
          continue
        }

        // Sauvegarder le texte extrait
        const { error: updateErr } = await supabase
          .from('candidats')
          .update({ cv_texte_brut: texte } as any)
          .eq('id', candidat.id)

        if (updateErr) {
          erreurs.push(`#${candidat.id}: erreur update — ${updateErr.message}`)
          continue
        }

        traites++
      } catch (err: any) {
        erreurs.push(`#${candidat.id}: ${err?.message || 'Erreur inconnue'}`)
      }
    }

    const restants = totalRestant - traites

    return NextResponse.json({
      traites,
      restants: Math.max(restants, 0),
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
