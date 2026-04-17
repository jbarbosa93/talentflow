// app/(dashboard)/api/onedrive/sync-test/route.ts
// DRY-RUN STRICT — teste le pipeline d'import OneDrive SANS RIEN ÉCRIRE en DB ni Storage.
//
// Flow :
//   1. Télécharge le fichier OneDrive (driveId/itemId)
//   2. Analyse IA (Claude)
//   3. Match via findExistingCandidat
//   4. Retourne la décision qui serait prise (create / update / skip / ambiguous / none)
//
// POST { drive_id, item_id, filename } — admin only
//
// Utilisé par le composant TestFolderRunner côté /integrations pour valider
// le matching sans polluer la DB de production.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getAccessTokenForPurpose } from '@/lib/microsoft'
import { extractTextFromCV } from '@/lib/cv-parser'
import { analyserCV, analyserCVDepuisPDF, analyserCVDepuisImage } from '@/lib/claude'
import { findExistingCandidat } from '@/lib/candidat-matching'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'
export const maxDuration = 120

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'j.barbosa@l-agence.ch').trim()
const FORMATS_IMAGES = ['jpg', 'jpeg', 'png']

async function requireAdmin(): Promise<NextResponse | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    if (user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Accès réservé à l\'administrateur' }, { status: 403 })
    }
    return null
  } catch {
    return NextResponse.json({ error: 'Erreur d\'authentification' }, { status: 500 })
  }
}

function getExt(filename: string): string {
  return filename.toLowerCase().split('.').pop() || ''
}

function mimeForImage(ext: string): 'image/jpeg' | 'image/png' {
  return ext === 'png' ? 'image/png' : 'image/jpeg'
}

// GET — liste les fichiers pour peupler le sélecteur UI.
// ?mode=db    → fichiers déjà scannés par le cron (onedrive_fichiers, max 30)
// ?mode=live  → listing direct Graph API du dossier surveillé (max 30, tri lastModified desc)
export async function GET(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError
  const denied = await requireAdmin()
  if (denied) return denied

  const mode = new URL(request.url).searchParams.get('mode') === 'live' ? 'live' : 'db'

  try {
    const supabase = createAdminClient()
    // Récupérer config intégration active
    const { data: integration } = await (supabase as any)
      .from('integrations')
      .select('metadata')
      .eq('type', 'microsoft_onedrive')
      .eq('actif', true)
      .maybeSingle()
    const meta = integration?.metadata || {}
    const driveId = meta.sharepoint_drive_id || null
    const folderId = meta.sharepoint_folder_id || null
    const folderName = meta.sharepoint_folder_name || null

    if (mode === 'live') {
      if (!driveId || !folderId) {
        return NextResponse.json({
          drive_id: driveId,
          folder_name: folderName,
          files: [],
          mode: 'live',
          error: !driveId ? 'sharepoint_drive_id manquant dans integrations.metadata' : 'sharepoint_folder_id manquant dans integrations.metadata',
        }, { status: 200 })
      }

      try {
        const { token } = await getAccessTokenForPurpose('onedrive')
        // Listing direct Graph, non récursif, tri par date de modification desc
        const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${folderId}/children?$select=name,id,file,size,lastModifiedDateTime&$top=30&$orderby=lastModifiedDateTime desc`
        const gr = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        if (!gr.ok) {
          const txt = await gr.text().catch(() => gr.statusText)
          return NextResponse.json({
            drive_id: driveId, folder_name: folderName, files: [], mode: 'live',
            error: `Graph API ${gr.status}: ${txt.slice(0, 200)}`,
          }, { status: 200 })
        }
        const data = await gr.json()
        const items: any[] = Array.isArray(data.value) ? data.value : []

        // Charger les candidat_id déjà rattachés pour indiquer "déjà importé"
        const itemIds = items.filter(it => it.file).map(it => it.id)
        const { data: linked } = itemIds.length > 0 ? await (supabase as any)
          .from('onedrive_fichiers')
          .select('onedrive_item_id, candidat_id, statut_action, traite_le')
          .in('onedrive_item_id', itemIds) : { data: [] as any[] }
        const linkedMap = new Map<string, any>((linked || []).map((l: any) => [l.onedrive_item_id, l]))

        const files = items
          .filter(it => it.file)
          .map(it => {
            const ext = (it.name || '').toLowerCase().split('.').pop() || ''
            const supported = ['pdf', 'docx', 'doc', 'jpg', 'jpeg', 'png', 'webp'].includes(ext)
            const known = linkedMap.get(it.id)
            return {
              id: it.id, // utiliser l'item_id comme key (pas de row DB)
              onedrive_item_id: it.id,
              nom_fichier: it.name,
              statut_action: known?.statut_action || (supported ? 'nouveau (live)' : 'extension ignorée'),
              traite_le: it.lastModifiedDateTime || null,
              candidat_id: known?.candidat_id || null,
              erreur: null,
              _supported: supported,
            }
          })

        return NextResponse.json({ drive_id: driveId, folder_name: folderName, files, mode: 'live' })
      } catch (e) {
        return NextResponse.json({
          drive_id: driveId, folder_name: folderName, files: [], mode: 'live',
          error: e instanceof Error ? e.message : 'Erreur Graph',
        }, { status: 200 })
      }
    }

    // mode === 'db'
    const { data: files } = await (supabase as any)
      .from('onedrive_fichiers')
      .select('id, onedrive_item_id, nom_fichier, statut_action, traite_le, candidat_id, erreur')
      .order('traite_le', { ascending: false, nullsFirst: false })
      .limit(30)

    return NextResponse.json({
      drive_id: driveId,
      folder_name: folderName,
      files: files || [],
      mode: 'db',
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError
  const denied = await requireAdmin()
  if (denied) return denied

  const t0 = Date.now()
  try {
    const { drive_id, item_id, filename } = await request.json()
    if (!drive_id || !item_id || !filename) {
      return NextResponse.json({ error: 'drive_id, item_id et filename requis' }, { status: 400 })
    }

    // 1. Token OneDrive
    const { token: accessToken } = await getAccessTokenForPurpose('onedrive')

    // 2. Download fichier via Graph
    const dlRes = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${drive_id}/items/${item_id}/content`,
      { headers: { Authorization: `Bearer ${accessToken}` }, redirect: 'follow' }
    )
    if (!dlRes.ok) {
      const txt = await dlRes.text().catch(() => dlRes.statusText)
      return NextResponse.json({ error: `Téléchargement OneDrive ${dlRes.status}: ${txt}` }, { status: 502 })
    }
    const buffer = Buffer.from(await dlRes.arrayBuffer())

    const ext = getExt(filename)
    const isImage = FORMATS_IMAGES.includes(ext)
    const isPDF = ext === 'pdf'

    // 3. Analyse IA
    let analyse: any
    let analyseSource: 'text' | 'pdf_vision' | 'image_vision' = 'text'
    if (isImage) {
      analyse = await analyserCVDepuisImage(buffer, mimeForImage(ext))
      analyseSource = 'image_vision'
    } else {
      const texteCV = await extractTextFromCV(buffer, filename)
      const isScanned = !texteCV || texteCV.trim().length < 50
      if (isScanned && isPDF) {
        analyse = await analyserCVDepuisPDF(buffer)
        analyseSource = 'pdf_vision'
      } else if (isScanned) {
        return NextResponse.json({
          dry_run: true,
          filename,
          decision: 'reject',
          reason: 'Fichier vide ou illisible — aucun texte extrait',
          duration_ms: Date.now() - t0,
        })
      } else {
        analyse = await analyserCV(texteCV)
      }
    }

    // 4. Match existant
    const supabase = createAdminClient()
    const match = await findExistingCandidat(supabase, {
      nom: analyse.nom,
      prenom: analyse.prenom,
      email: analyse.email,
      telephone: analyse.telephone,
      date_naissance: analyse.date_naissance,
    })

    // 5. Déterminer la décision qui serait prise
    let decision: 'create' | 'update' | 'skip_doublon' | 'ambiguous' | 'insufficient' = 'create'
    if (match.kind === 'match') decision = 'update'
    else if (match.kind === 'ambiguous') decision = 'ambiguous'
    else if (match.kind === 'insufficient') decision = 'insufficient'
    else decision = 'create'

    // Validation diplôme (mêmes règles que cv/parse)
    const hasExperiences = Array.isArray(analyse.experiences) && analyse.experiences.length > 0
    const hasCompetences = Array.isArray(analyse.competences) && analyse.competences.length >= 2
    const hasContact = !!(analyse.email || analyse.telephone)
    const hasTitle = !!(analyse.titre_poste && analyse.titre_poste !== 'Candidat' && analyse.titre_poste.length > 1)
    const cvScore = [hasExperiences, hasCompetences, hasContact, hasTitle].filter(Boolean).length
    const hasName = !!(analyse.nom && analyse.nom !== 'Candidat' && analyse.nom.length > 1)
    const isDiplome = hasName && cvScore === 0

    return NextResponse.json({
      dry_run: true,
      filename,
      analyse_source: analyseSource,
      decision: isDiplome ? 'reject_diplome' : decision,
      cv_score: cvScore,
      is_diplome: isDiplome,
      extracted: {
        nom: analyse.nom,
        prenom: analyse.prenom,
        email: analyse.email,
        telephone: analyse.telephone,
        date_naissance: analyse.date_naissance,
        titre_poste: analyse.titre_poste,
        annees_exp: analyse.annees_exp,
        competences_count: Array.isArray(analyse.competences) ? analyse.competences.length : 0,
        experiences_count: Array.isArray(analyse.experiences) ? analyse.experiences.length : 0,
      },
      match: match.kind === 'match' ? {
        kind: 'match',
        reason: match.reason,
        candidat_id: match.candidat.id,
        candidat_nom: `${match.candidat.prenom || ''} ${match.candidat.nom || ''}`.trim(),
        diffs: match.diffs,
      } : match.kind === 'ambiguous' ? {
        kind: 'ambiguous',
        reason: match.reason,
        candidates: match.candidates.map((c: any) => ({ id: c.id, nom: c.nom, prenom: c.prenom, email: c.email })),
      } : match.kind === 'insufficient' ? {
        kind: 'insufficient',
        reason: match.reason,
      } : {
        kind: 'none',
      },
      duration_ms: Date.now() - t0,
      // GARANTIE : aucune écriture DB, aucun upload Storage, aucun activites log.
      side_effects: 'none',
    })
  } catch (e) {
    console.error('[sync-test] Exception:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur serveur', duration_ms: Date.now() - t0 },
      { status: 500 }
    )
  }
}
