// app/(dashboard)/api/sharepoint/import/route.ts
// Importe un fichier CV depuis SharePoint → Analyse IA → Candidat en base
// POST /api/sharepoint/import

import { NextRequest, NextResponse } from 'next/server'
import { getValidAccessToken } from '@/lib/microsoft'
import { telechargerFichier } from '@/lib/sharepoint'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractTextFromCV } from '@/lib/cv-parser'
import { analyserCV, analyserCVDepuisPDF, analyserCVDepuisImage } from '@/lib/claude'
import type { CandidatInsert } from '@/types/database'

export const runtime = 'nodejs'
export const maxDuration = 300

const FORMATS_IMAGES = ['jpg', 'jpeg', 'png']

function getExtension(filename: string): string {
  return filename.toLowerCase().split('.').pop() || ''
}

function getMimeTypeForImage(ext: string): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' {
  if (ext === 'png') return 'image/png'
  return 'image/jpeg'
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { integration_id, drive_id, item_id, filename, offre_id } = body
    // statut_pipeline JAMAIS défini lors d'un import — uniquement via action manuelle

    if (!integration_id || !drive_id || !item_id || !filename) {
      return NextResponse.json(
        { error: 'Champs requis : integration_id, drive_id, item_id, filename' },
        { status: 400 }
      )
    }

    console.log(`[SharePoint Import] Début : ${filename}`)

    const accessToken = await getValidAccessToken(integration_id)
    const buffer = await telechargerFichier(accessToken, drive_id, item_id)

    const ext = getExtension(filename)
    const isImage = FORMATS_IMAGES.includes(ext)
    const isPDF = ext === 'pdf'

    let analyse

    if (isImage) {
      analyse = await analyserCVDepuisImage(buffer, getMimeTypeForImage(ext))
    } else {
      const texteCV = await extractTextFromCV(buffer, filename)
      const isScanned = !texteCV || texteCV.trim().length < 50

      if (isScanned && isPDF) {
        analyse = await analyserCVDepuisPDF(buffer)
      } else if (isScanned) {
        return NextResponse.json(
          { error: 'Fichier vide ou illisible. Vérifiez que le document contient du texte.' },
          { status: 422 }
        )
      } else {
        analyse = await analyserCV(texteCV)
      }
    }

    console.log(`[SharePoint Import] Analyse terminée : ${analyse.nom} ${analyse.prenom}`)

    // Upload vers Supabase Storage
    const supabase = createAdminClient()
    const timestamp = Date.now()
    const nomStorage = `sp_${timestamp}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`

    let cvUrl: string | null = null
    const { data: storageData } = await supabase.storage
      .from('cvs')
      .upload(nomStorage, buffer, {
        contentType: isImage ? getMimeTypeForImage(ext) : 'application/octet-stream',
        upsert: false,
      })

    if (storageData?.path) {
      const { data: urlData } = await supabase.storage
        .from('cvs')
        .createSignedUrl(storageData.path, 60 * 60 * 24 * 365 * 10)
      cvUrl = urlData?.signedUrl || null
    }

    // Créer le candidat
    const nouveauCandidat: CandidatInsert = {
      nom: analyse.nom || 'Candidat',
      prenom: analyse.prenom || null,
      email: analyse.email || null,
      telephone: analyse.telephone || null,
      localisation: analyse.localisation || null,
      titre_poste: analyse.titre_poste || null,
      annees_exp: analyse.annees_exp || 0,
      competences: analyse.competences || [],
      formation: analyse.formation || null,
      cv_url: cvUrl,
      cv_nom_fichier: filename,
      resume_ia: analyse.resume || null,
      cv_texte_brut: null,
      statut_pipeline: null,
      tags: [],
      notes: null,
      source: 'sharepoint',
      import_status: 'a_traiter',
    }

    const { data: candidatRaw, error: dbError } = await supabase
      .from('candidats')
      .insert(nouveauCandidat)
      .select()
      .single()

    if (dbError) {
      return NextResponse.json(
        { error: `Erreur BDD : ${dbError.message}` },
        { status: 500 }
      )
    }

    const candidat = candidatRaw as import('@/types/database').Candidat

    if (offre_id && candidat) {
      await supabase.from('pipeline').insert({
        candidat_id: candidat.id,
        offre_id,
        etape: 'nouveau',
        score_ia: null,
      })
    }

    console.log(`[SharePoint Import] Succès : candidat ${candidat.id}`)

    return NextResponse.json({
      success: true,
      candidat,
      analyse,
      message: `${analyse.prenom || ''} ${analyse.nom} importé depuis SharePoint`.trim(),
    })
  } catch (error) {
    console.error('[SharePoint Import] Erreur:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
