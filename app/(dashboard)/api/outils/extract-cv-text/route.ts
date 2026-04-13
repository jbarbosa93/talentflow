// POST /api/outils/extract-cv-text
// Batch-extract texte brut depuis les CVs ou cv_texte_brut est NULL
// Utilise extractTextFromCV de lib/cv-parser (pdfjs-dist, mammoth, word-extractor)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractTextFromCV } from '@/lib/cv-parser'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'
export const maxDuration = 120
export const preferredRegion = 'dub1'

export async function POST(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const body = await request.json().catch(() => ({}))
    const batchSize = Math.min(Math.max(body.batch_size ?? 10, 1), 50)

    const supabase = createAdminClient()

    // Compter le total restant
    const { count: totalRestant } = await supabase
      .from('candidats')
      .select('id', { count: 'exact', head: true })
      .is('cv_texte_brut', null)
      .not('cv_url', 'is', null)

    // Recuperer le batch
    const { data: candidats, error: fetchErr } = await supabase
      .from('candidats')
      .select('id, cv_url, cv_nom_fichier')
      .is('cv_texte_brut', null)
      .not('cv_url', 'is', null)
      .limit(batchSize)

    if (fetchErr) {
      return NextResponse.json({ error: `Erreur DB : ${fetchErr.message}` }, { status: 500 })
    }

    if (!candidats || candidats.length === 0) {
      return NextResponse.json({ traites: 0, restants: 0, erreurs: [] })
    }

    let traites = 0
    const erreurs: string[] = []

    for (const candidat of candidats) {
      try {
        const cvUrl = candidat.cv_url as string

        // Telecharger le CV via la signed URL
        const res = await fetch(cvUrl)
        if (!res.ok) {
          erreurs.push(`#${candidat.id}: HTTP ${res.status} lors du telechargement`)
          continue
        }

        const arrayBuf = await res.arrayBuffer()
        const buffer = Buffer.from(arrayBuf)

        // Determiner le nom de fichier et extension
        const filename = candidat.cv_nom_fichier
          || cvUrl.split('?')[0].split('/').pop()
          || 'cv.pdf'

        // Determiner le MIME type depuis l'extension
        const ext = filename.toLowerCase().split('.').pop() || 'pdf'
        const mimeType = ext === 'pdf' ? 'application/pdf'
          : ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : ext === 'doc' ? 'application/msword'
          : ext === 'txt' ? 'text/plain'
          : undefined

        // Extraire le texte
        const texte = await extractTextFromCV(buffer, filename, mimeType)

        if (!texte || texte.trim().length === 0) {
          erreurs.push(`#${candidat.id}: texte vide (${filename} — probablement scanne)`)
          // Mettre une valeur vide pour ne pas retraiter ce candidat
          await supabase
            .from('candidats')
            .update({ cv_texte_brut: '' } as any)
            .eq('id', candidat.id)
          traites++
          continue
        }

        // Mettre a jour cv_texte_brut
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
        const msg = err?.message || 'Erreur inconnue'
        erreurs.push(`#${candidat.id}: ${msg}`)
      }
    }

    const restants = (totalRestant ?? 0) - traites

    return NextResponse.json({
      traites,
      restants: Math.max(restants, 0),
      erreurs,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: `Erreur serveur : ${err?.message || 'inconnue'}` },
      { status: 500 }
    )
  }
}
