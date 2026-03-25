// app/(dashboard)/api/onedrive/sync/route.ts
// Sync manuelle OneDrive — importe les CVs déposés dans le dossier configuré

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getValidAccessToken } from '@/lib/microsoft'
import { listerFichiersCVs, telechargerFichier } from '@/lib/onedrive'
import { extractTextFromCV } from '@/lib/cv-parser'
import { analyserCV, analyserCVDepuisPDF } from '@/lib/claude'
import { logActivity } from '@/lib/activity-log'
import type { Integration } from '@/types/database'

export const runtime = 'nodejs'
export const maxDuration = 120

const DEFAULT_FOLDER_NAME = 'CVs TalentFlow'
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

export async function POST() {
  try {
    const supabase = createAdminClient()

    // 1. Récupère l'intégration Microsoft OneDrive active (fallback legacy 'microsoft')
    let { data: integrationRaw } = await supabase
      .from('integrations')
      .select('*')
      .eq('type', 'microsoft_onedrive')
      .eq('actif', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!integrationRaw) {
      const { data: legacyRaw } = await supabase
        .from('integrations')
        .select('*')
        .eq('type', 'microsoft')
        .eq('actif', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      integrationRaw = legacyRaw
    }

    const integration = integrationRaw as unknown as Integration | null
    if (!integration) {
      return NextResponse.json(
        { error: 'Aucune intégration Microsoft OneDrive active. Connectez votre compte.' },
        { status: 404 }
      )
    }

    // 2. Récupère access token valide
    const accessToken = await getValidAccessToken(integration.id)
    const meta = (integration.metadata as any) || {}

    // 3. Lit le dossier configuré
    const folderId = meta.onedrive_folder_id || null
    const folderName = meta.onedrive_folder_name || DEFAULT_FOLDER_NAME

    if (!folderId) {
      return NextResponse.json(
        {
          error: `Aucun dossier OneDrive configuré.`,
          hint: `Configurez un dossier dans les intégrations (ex: "${DEFAULT_FOLDER_NAME}").`,
        },
        { status: 400 }
      )
    }

    // 4. Liste les fichiers CV dans ce dossier
    let fichiers: any[] = []
    try {
      fichiers = await listerFichiersCVs(accessToken, folderId)
    } catch (err) {
      return NextResponse.json(
        { error: `Impossible de lister les fichiers: ${err instanceof Error ? err.message : 'Erreur'}` },
        { status: 500 }
      )
    }

    let processed = 0
    let skipped = 0
    let errors = 0
    let duplicates = 0
    const created: string[] = []

    // 5. Pour chaque fichier CV
    for (const fichier of fichiers) {
      try {
        // a. Vérifie si déjà traité
        let dejaTraite = false
        try {
          const { data: existing } = await (supabase as any)
            .from('onedrive_fichiers')
            .select('id')
            .eq('onedrive_item_id', fichier.id)
            .maybeSingle()

          if (existing) {
            dejaTraite = true
          }
        } catch (tableErr: any) {
          const msg = tableErr?.message || ''
          if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('42P01')) {
            return NextResponse.json(
              {
                error: 'Table onedrive_fichiers manquante.',
                hint: 'Exécutez la migration SQL supabase/migrations/20260323_onedrive_fichiers.sql dans votre dashboard Supabase.',
              },
              { status: 500 }
            )
          }
          throw tableErr
        }

        if (dejaTraite) {
          skipped++
          continue
        }

        // b. Vérifie taille < 10MB
        if (fichier.size > MAX_FILE_SIZE) {
          console.warn(`[OneDrive Sync] Fichier trop volumineux (${fichier.size} bytes): ${fichier.name}`)
          skipped++
          continue
        }

        // c. Télécharge le fichier
        const buffer = await telechargerFichier(accessToken, fichier.driveId, fichier.id)
        const filename = fichier.name
        const ext = filename.toLowerCase().split('.').pop() || ''
        const mimeType = ext === 'pdf'
          ? 'application/pdf'
          : ext === 'docx'
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/msword'

        // d. Extrait le texte
        let texteCV = ''
        try {
          texteCV = await extractTextFromCV(buffer, filename, mimeType)
        } catch { /* will try vision */ }

        const isPDF = ext === 'pdf' || mimeType === 'application/pdf'
        const isScanned = !texteCV || texteCV.trim().length < 50

        // e. Analyse avec Claude
        let analyse: any
        if (isScanned && isPDF) {
          analyse = await analyserCVDepuisPDF(buffer)
        } else if (!isScanned) {
          analyse = await analyserCV(texteCV)
        } else {
          throw new Error('Fichier illisible — ni texte extrait, ni PDF pour vision')
        }

        const candidatEmail = analyse.email || null
        const candidatNom = (analyse.nom || '').trim()
        const candidatPrenom = (analyse.prenom || '').trim()

        // f. Vérifie doublon candidat par email
        if (candidatEmail) {
          const { data: existingCandidat } = await supabase
            .from('candidats')
            .select('id, nom, prenom')
            .ilike('email', candidatEmail)
            .maybeSingle()

          if (existingCandidat) {
            // Enregistre comme doublon dans onedrive_fichiers
            try {
              await (supabase as any).from('onedrive_fichiers').insert({
                integration_id: integration.id,
                onedrive_item_id: fichier.id,
                nom_fichier: filename,
                traite: true,
                candidat_id: existingCandidat.id,
                erreur: 'Doublon — candidat déjà existant',
              })
            } catch { /* ignore */ }
            duplicates++
            continue
          }
        }

        // g. Upload vers Supabase Storage bucket 'cvs'
        const timestamp = Date.now()
        const storageName = `${timestamp}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`
        const { data: storageData } = await supabase.storage
          .from('cvs')
          .upload(storageName, buffer, { contentType: mimeType, upsert: false })

        let cvUrl: string | null = null
        if (storageData?.path) {
          const { data: urlData } = await supabase.storage
            .from('cvs')
            .createSignedUrl(storageData.path, 60 * 60 * 24 * 365 * 10)
          cvUrl = urlData?.signedUrl || null
        }

        // h. Crée le candidat
        const { data: candidat, error: dbError } = await supabase
          .from('candidats')
          .insert({
            nom: candidatNom || 'Candidat',
            prenom: candidatPrenom || null,
            email: candidatEmail,
            telephone: analyse.telephone || null,
            localisation: analyse.localisation || null,
            titre_poste: analyse.titre_poste || null,
            annees_exp: analyse.annees_exp || 0,
            competences: analyse.competences || [],
            formation: analyse.formation || null,
            langues: analyse.langues || null,
            linkedin: analyse.linkedin || null,
            experiences: analyse.experiences || null,
            formations_details: analyse.formations_details || null,
            cv_url: cvUrl,
            cv_nom_fichier: filename,
            resume_ia: analyse.resume || null,
            cv_texte_brut: texteCV.slice(0, 10000),
            statut_pipeline: 'nouveau',
            import_status: 'a_traiter',
            source: 'ONEDRIVE',
            tags: [],
            notes: `Importé depuis OneDrive — dossier: ${folderName}\nFichier: ${filename}`,
          })
          .select()
          .single()

        if (dbError) throw dbError

        const candidatId = (candidat as any)?.id || null

        // i. Insert dans onedrive_fichiers
        try {
          await (supabase as any).from('onedrive_fichiers').insert({
            integration_id: integration.id,
            onedrive_item_id: fichier.id,
            nom_fichier: filename,
            traite: true,
            candidat_id: candidatId,
          })
        } catch (tableErr: any) {
          const msg = tableErr?.message || ''
          if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('42P01')) {
            console.warn('[OneDrive Sync] Table onedrive_fichiers manquante — candidat créé mais non enregistré')
          }
        }

        processed++
        created.push(`${candidatPrenom} ${candidatNom}`.trim() || 'Candidat')

      } catch (err) {
        console.error(`[OneDrive Sync] Erreur fichier ${fichier.name}:`, err)
        errors++

        // Enregistre l'erreur dans onedrive_fichiers
        try {
          await (supabase as any).from('onedrive_fichiers').insert({
            integration_id: integration.id,
            onedrive_item_id: fichier.id,
            nom_fichier: fichier.name,
            traite: false,
            erreur: err instanceof Error ? err.message : 'Erreur inconnue',
          })
        } catch { /* ignore */ }
      }
    }

    // 6. Met à jour onedrive_last_sync
    await supabase
      .from('integrations')
      .update({
        metadata: {
          ...meta,
          onedrive_last_sync: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', integration.id)

    // 7. Retourne les stats
    const result = {
      success: true,
      folder: folderName,
      processed,
      skipped,
      duplicates,
      errors,
      created,
    }

    console.log(`[OneDrive Sync] Dossier "${folderName}": ${processed} créés, ${duplicates} doublons, ${skipped} ignorés, ${errors} erreurs`)
    if (processed > 0) {
      await logActivity({ action: 'onedrive_sync', details: result })
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('[OneDrive Sync] Erreur fatale:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const supabase = createAdminClient()

    const { data, error } = await (supabase as any)
      .from('onedrive_fichiers')
      .select('*, candidats(nom, prenom)')
      .order('traite_le', { ascending: false })
      .limit(30)

    if (error) {
      const msg = error.message || ''
      if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('42P01')) {
        return NextResponse.json(
          {
            fichiers: [],
            migration_needed: true,
            hint: 'Exécutez la migration SQL supabase/migrations/20260323_onedrive_fichiers.sql dans votre dashboard Supabase.',
          }
        )
      }
      throw error
    }

    return NextResponse.json({ fichiers: data || [] })
  } catch (error) {
    console.error('[OneDrive Sync GET]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
