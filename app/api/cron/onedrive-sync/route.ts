// app/api/cron/onedrive-sync/route.ts
// Endpoint appelé automatiquement par Vercel Cron
// Synchronise les CVs du dossier OneDrive configuré → candidats TalentFlow

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getValidAccessToken } from '@/lib/microsoft'
import { listerFichiersCVs, telechargerFichier } from '@/lib/onedrive'
import { extractTextFromCV } from '@/lib/cv-parser'
import { analyserCV, analyserCVDepuisPDF } from '@/lib/claude'
import { logActivity } from '@/lib/activity-log'
import type { Integration } from '@/types/database'

export const runtime = 'nodejs'
export const maxDuration = 300

const DEFAULT_FOLDER_NAME = 'CVs TalentFlow'
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

export async function GET(request: Request) {
  // Vercel Cron authentifie avec Authorization: Bearer <CRON_SECRET>
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()

    // Try microsoft_onedrive first, fallback to legacy 'microsoft' for backward compat
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
      return NextResponse.json({ skipped: true, reason: 'Aucune intégration Microsoft OneDrive active' })
    }

    const meta = (integration.metadata as any) || {}

    // Vérifie si la sync automatique OneDrive est activée (true par défaut)
    if (meta.onedrive_auto_sync === false) {
      return NextResponse.json({ skipped: true, reason: 'Sync automatique OneDrive désactivée' })
    }

    const folderId = meta.onedrive_folder_id || null
    const folderName = meta.onedrive_folder_name || DEFAULT_FOLDER_NAME

    if (!folderId) {
      return NextResponse.json({
        skipped: true,
        reason: `Aucun dossier OneDrive configuré. Configurez-en un depuis la page Intégrations.`,
      })
    }

    const accessToken = await getValidAccessToken(integration.id)

    // Liste les fichiers CV dans le dossier
    let fichiers: any[] = []
    try {
      fichiers = await listerFichiersCVs(accessToken, folderId)
    } catch (err) {
      console.error('[Cron OneDrive] Erreur listage fichiers:', err)
      return NextResponse.json(
        { error: `Impossible de lister les fichiers OneDrive: ${err instanceof Error ? err.message : 'Erreur'}` },
        { status: 500 }
      )
    }

    let processed = 0
    let skipped = 0
    let errors = 0
    let duplicates = 0
    const created: string[] = []

    for (const fichier of fichiers) {
      try {
        // Vérifie si déjà traité
        let dejaTraite = false
        try {
          const { data: existing } = await (supabase as any)
            .from('onedrive_fichiers')
            .select('id')
            .eq('onedrive_item_id', fichier.id)
            .maybeSingle()

          if (existing) dejaTraite = true
        } catch (tableErr: any) {
          const msg = tableErr?.message || ''
          if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('42P01')) {
            console.warn('[Cron OneDrive] Table onedrive_fichiers manquante — arrêt du cron')
            return NextResponse.json({
              skipped: true,
              reason: 'Table onedrive_fichiers manquante. Exécutez la migration SQL.',
            })
          }
          throw tableErr
        }

        if (dejaTraite) {
          skipped++
          continue
        }

        // Vérifie taille < 10MB
        if (fichier.size > MAX_FILE_SIZE) {
          console.warn(`[Cron OneDrive] Fichier trop volumineux (${fichier.size} bytes): ${fichier.name}`)
          skipped++
          continue
        }

        // Télécharge le fichier
        const buffer = await telechargerFichier(accessToken, fichier.driveId, fichier.id)
        const filename = fichier.name
        const ext = filename.toLowerCase().split('.').pop() || ''
        const mimeType = ext === 'pdf'
          ? 'application/pdf'
          : ext === 'docx'
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/msword'

        // Extrait le texte
        let texteCV = ''
        try {
          texteCV = await extractTextFromCV(buffer, filename, mimeType)
        } catch { /* will try vision */ }

        const isPDF = ext === 'pdf' || mimeType === 'application/pdf'
        const isScanned = !texteCV || texteCV.trim().length < 50

        // Analyse avec Claude
        let analyse: any
        if (isScanned && isPDF) {
          analyse = await analyserCVDepuisPDF(buffer)
        } else if (!isScanned) {
          analyse = await analyserCV(texteCV)
        } else {
          throw new Error('Fichier illisible')
        }

        const candidatEmail = analyse.email || null
        const candidatNom = (analyse.nom || '').trim()
        const candidatPrenom = (analyse.prenom || '').trim()

        // Vérifie doublon par email
        if (candidatEmail) {
          const { data: existingCandidat } = await supabase
            .from('candidats')
            .select('id')
            .ilike('email', candidatEmail)
            .maybeSingle()

          if (existingCandidat) {
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

        // Upload vers Supabase Storage
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

        // Crée le candidat
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

        // Insert dans onedrive_fichiers
        try {
          await (supabase as any).from('onedrive_fichiers').insert({
            integration_id: integration.id,
            onedrive_item_id: fichier.id,
            nom_fichier: filename,
            traite: true,
            candidat_id: candidatId,
          })
        } catch { /* ignore */ }

        processed++
        created.push(`${candidatPrenom} ${candidatNom}`.trim() || 'Candidat')

      } catch (err) {
        console.error(`[Cron OneDrive] Erreur fichier ${fichier.name}:`, err)
        errors++
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

    // Sauvegarde la date du dernier sync
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

    const result = {
      success: true,
      folder: folderName,
      processed,
      skipped,
      duplicates,
      errors,
      created,
    }

    if (processed > 0) {
      console.log(`[Cron OneDrive] "${folderName}": ${processed} créés, ${duplicates} doublons, ${skipped} ignorés, ${errors} erreurs`)
      await logActivity({ action: 'onedrive_sync', details: result })
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('[Cron OneDrive] Erreur fatale:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
