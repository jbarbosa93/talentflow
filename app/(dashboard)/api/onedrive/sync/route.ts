// app/(dashboard)/api/onedrive/sync/route.ts
// Sync manuelle OneDrive — importe les CVs déposés dans le dossier configuré

import { NextResponse, after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getAccessTokenForPurpose, callGraph } from '@/lib/microsoft'
import { extractTextFromCV } from '@/lib/cv-parser'
import { analyserCV, analyserCVDepuisPDF, analyserCVDepuisImage } from '@/lib/claude'
import { logActivity } from '@/lib/activity-log'
import { normaliserGenre } from '@/lib/normaliser-genre'
import { findExistingCandidat } from '@/lib/candidat-matching'
import { mergeCandidat, mergeReportToText } from '@/lib/merge-candidat'
import { normalizeCandidat } from '@/lib/normalize-candidat'
import { classifyDocument } from '@/lib/document-classification'
import { createHash } from 'crypto'

export const runtime = 'nodejs'
export const maxDuration = 300

const DEFAULT_FOLDER_NAME = 'CVs TalentFlow'
const MAX_FILE_SIZE = (parseInt(process.env.ONEDRIVE_MAX_FILE_SIZE_MB || '10', 10) || 10) * 1024 * 1024
const MAX_ERROR_DAYS = parseInt(process.env.ONEDRIVE_MAX_ERROR_DAYS || '7', 10) || 7
const PARALLEL = parseInt(process.env.ONEDRIVE_PARALLEL || '5', 10) || 5
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'j.barbosa@l-agence.ch').trim()
const dbg = (...args: Parameters<typeof console.log>) => { if (process.env.DEBUG_MODE === 'true') console.log(...args) }

async function requireAdmin(): Promise<NextResponse | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    if (user.email !== ADMIN_EMAIL) return NextResponse.json({ error: 'Accès réservé à l\'administrateur' }, { status: 403 })
    return null
  } catch {
    return NextResponse.json({ error: 'Erreur d\'authentification' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  // Exception cron Vercel — bypass auth si Authorization: Bearer $CRON_SECRET
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const isCronCall = !!(cronSecret && authHeader === `Bearer ${cronSecret}`)

  if (!isCronCall) {
    const authError = await requireAdmin()
    if (authError) return authError
  }
  try {
    const supabase = createAdminClient()

    // 1. Obtenir le token OneDrive (SharePoint)
    let accessToken: string
    let integrationId: string
    try {
      const result = await getAccessTokenForPurpose('onedrive')
      accessToken = result.token
      integrationId = result.integrationId
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }

    // 2. Lire la config SharePoint depuis metadata
    const { data: integrationRow } = await supabase.from('integrations').select('metadata').eq('id', integrationId).single()
    const meta = (integrationRow as any)?.metadata || {}

    // Check if sync should stop
    if (meta.sync_stop_requested) {
      await supabase.from('integrations').update({
        metadata: { ...meta, sync_stop_requested: false },
      }).eq('id', integrationId)
      return NextResponse.json({ stopped: true, message: 'Sync arrêtée' })
    }

    // Config SharePoint directement dans metadata de la row microsoft_onedrive
    const driveId = meta.sharepoint_drive_id
    const folderId = meta.sharepoint_folder_id
    const folderName = meta.sharepoint_folder_name || DEFAULT_FOLDER_NAME

    dbg(`[OneDrive Sync] Config: driveId=${driveId || 'MANQUANT'}, folderId=${folderId || 'MANQUANT'}, folderName=${folderName}`)

    if (!driveId || !folderId) {
      console.error('[OneDrive Sync] driveId ou folderId manquant dans metadata:', JSON.stringify(meta))
      return NextResponse.json(
        { error: 'Aucun dossier SharePoint configuré. Configurez dans Intégrations.' },
        { status: 400 }
      )
    }

    // 3. Charger tous les enregistrements onedrive_fichiers
    // v1.9.75 : ajout statut_action pour skip défensif pending_validation dans orphan detector
    const { data: allFichiers } = await (supabase as any)
      .from('onedrive_fichiers')
      .select('id, onedrive_item_id, traite, created_at, erreur, candidat_id, statut_action')
      .limit(10000)

    // Auto-reset des fichiers orphelins : traite:true mais candidat_id IS NULL
    // (marqués "traités" mais aucun candidat créé — ancien bug insert unique)
    // v1.9.75 : ajout 'À valider' (fichiers en attente de validation manuelle — ne sont PAS orphelins,
    //          ils ont un candidat suspect et attendent la décision user dans /integrations)
    //          + skip défensif sur statut_action='pending_validation'
    // v1.9.80 : ACTION_EXCLUSIONS — si statut_action indique que le fichier a été traité avec succès
    //          à un moment (created/updated/reactivated/...), un candidat_id NULL est le résultat de
    //          la FK `onedrive_fichiers.candidat_id → candidats.id ON DELETE SET NULL` déclenchée
    //          par une suppression/fusion manuelle du candidat. Ce n'est pas un "vrai orphan silencieux"
    //          — ces rows NE doivent PAS être remises en file (sinon boucle 404 Graph si fichier déplacé).
    const EXCLUSIONS = ['Abandonné', 'Document', 'Doublon', 'non-CV', 'sans candidat', 'Remis en file', 'À valider', 'Ignoré', 'Archivé', 'Candidat supprimé']
    const ACTION_EXCLUSIONS = new Set(['created', 'updated', 'reactivated', 'document', 'skipped', 'abandoned', 'pending_validation', 'error'])
    const orphanIds: string[] = []
    const deletedCandidatIds: string[] = []
    for (const f of (allFichiers || [])) {
      if (!f.traite || f.candidat_id) continue
      const err = (f.erreur || '') as string
      if (EXCLUSIONS.some(e => err.startsWith(e) || err.includes(e))) continue
      if (f.statut_action && ACTION_EXCLUSIONS.has(f.statut_action)) {
        // Candidat supprimé/fusionné après import — on n'y touche PLUS (retry inutile).
        // On annote seulement si erreur vide pour traçabilité dans l'UI.
        if (!err) deletedCandidatIds.push(f.id)
        continue
      }
      orphanIds.push(f.id)
    }

    if (orphanIds.length > 0) {
      await (supabase as any)
        .from('onedrive_fichiers')
        .update({
          traite: false,
          // v1.9.75 : message clair pour utilisateur non-dev
          erreur: 'Remis en file — incohérence interne (fichier marqué traité mais sans candidat associé). Nouvelle tentative automatique.',
          created_at: new Date().toISOString(), // Reset du timer — évite l'abandon immédiat
        })
        .in('id', orphanIds)
      dbg(`[OneDrive Sync] ${orphanIds.length} fichier(s) orphelin(s) remis en file automatiquement`)
    }

    if (deletedCandidatIds.length > 0) {
      // Annotation one-shot : message clair, pas de reset traite (on garde le succès d'origine).
      await (supabase as any)
        .from('onedrive_fichiers')
        .update({ erreur: 'Candidat supprimé ou fusionné après import — aucune action automatique' })
        .in('id', deletedCandidatIds)
      dbg(`[OneDrive Sync] ${deletedCandidatIds.length} fichier(s) avec candidat supprimé — annoté(s) sans reset`)
    }

    // Map: item_id → date de traitement la plus récente (traite: true uniquement)
    const doneMap = new Map<string, Date>()
    // Map: item_id → date du premier échec (traite: false)
    const errorDateMap = new Map<string, Date>()
    const retryAlwaysIds = new Set<string>()         // fichiers "introuvable" → jamais abandonnés
    const retryLastAttempt = new Map<string, Date>() // item_id → traite_le de la dernière tentative

    // Re-lire après reset orphelins pour avoir l'état à jour
    const { data: allFichiersUpdated } = await (supabase as any)
      .from('onedrive_fichiers')
      .select('onedrive_item_id, traite, traite_le, last_modified_at, created_at, erreur, candidat_id')
      .limit(10000)

    // Watchdog "pending orphelins" : fichier pré-enregistré il y a >24h mais jamais traité
    // (typiquement dropped par la dédup d'un cycle précédent)
    // → marquer erreur pour qu'il apparaisse dans l'UI + subisse MAX_ERROR_DAYS
    const WATCHDOG_THRESHOLD_MS = 24 * 60 * 60 * 1000
    const nowMs = Date.now()
    const orphanPendingIds = ((allFichiersUpdated || []) as any[])
      .filter(f =>
        f.traite === false &&
        !f.erreur &&
        f.created_at &&
        (nowMs - new Date(f.created_at).getTime()) > WATCHDOG_THRESHOLD_MS
      )
      .map(f => f.onedrive_item_id)
    if (orphanPendingIds.length > 0) {
      // v1.9.75 : message clair pour utilisateur non-dev
      const watchdogMsg = 'Fichier reçu mais pas encore traité après 24h (probablement bloqué par une erreur silencieuse ou un doublon) — nouvelle tentative automatique'
      await (supabase as any)
        .from('onedrive_fichiers')
        .update({ erreur: watchdogMsg })
        .in('onedrive_item_id', orphanPendingIds)
      dbg(`[OneDrive Sync] Watchdog : ${orphanPendingIds.length} pending orphelin(s) marqué(s) en erreur`)
      // Re-injecter l'erreur dans la collection locale pour ce cycle
      for (const f of (allFichiersUpdated as any[])) {
        if (orphanPendingIds.includes(f.onedrive_item_id)) {
          f.erreur = watchdogMsg
        }
      }
    }

    for (const row of (allFichiersUpdated || [])) {
      if (row.traite === true) {
        // Si last_modified_at est NULL → ancienne ligne sans date connue → ne pas ajouter au doneMap
        // → sera retraité au prochain sync (évite le skip aveugle sur fallback traite_le)
        if (!row.last_modified_at) continue
        const knownDate = new Date(row.last_modified_at)
        const existing = doneMap.get(row.onedrive_item_id)
        if (!existing || knownDate > existing) doneMap.set(row.onedrive_item_id, knownDate)
      } else {
        // N'ajouter au errorDateMap que si le fichier a déjà une erreur connue
        // Un fichier sans erreur (jamais essayé) ne doit pas être considéré "stuck"
        if (row.erreur) {
          errorDateMap.set(row.onedrive_item_id, new Date(row.created_at))
          // Candidat introuvable → jamais abandonné, mais retenté uniquement si nouveau candidat
          if (row.erreur.includes('introuvable dans la base')) {
            retryAlwaysIds.add(row.onedrive_item_id)
            if (row.traite_le) retryLastAttempt.set(row.onedrive_item_id, new Date(row.traite_le))
          }
        }
      }
    }

    // Optimisation boucle certificats/LM "introuvable" :
    // Ne consomment un slot que si un nouveau candidat a été créé depuis leur dernière tentative.
    if (retryAlwaysIds.size > 0) {
      const { data: latestCandidatRow } = await supabase
        .from('candidats')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const latestCandidatDate = latestCandidatRow?.created_at
        ? new Date(latestCandidatRow.created_at) : null

      for (const itemId of retryAlwaysIds) {
        const lastAttempt = retryLastAttempt.get(itemId)
        // Retenter si : pas de tentative connue OU nouveau candidat créé depuis
        const shouldRetry = !lastAttempt
          || (latestCandidatDate != null && latestCandidatDate > lastAttempt)
        if (!shouldRetry) {
          // Aucun nouveau candidat → skip ce cycle (sans abandonner le fichier)
          doneMap.set(itemId, lastAttempt)
        }
      }
    }

    // Helper upsert onedrive_fichiers — évite les violations de l'index UNIQUE sur onedrive_item_id
    // INSERT si nouveau, UPDATE si déjà présent (retry réussi, nouvel état, etc.)
    const upsertFichier = async (payload: Record<string, any>) => {
      try {
        await (supabase as any).from('onedrive_fichiers').upsert(payload, { onConflict: 'onedrive_item_id' })
      } catch (err) { console.warn('[OneDrive Sync] upsertFichier échec:', err instanceof Error ? err.message : String(err)) }
    }

    // 4. Lister les fichiers dans le dossier SharePoint (récursif jusqu'à 5 niveaux)
    // Inclut les fichiers jamais traités ET ceux modifiés depuis leur dernier traitement
    // rawCount = total fichiers CV trouvés dans OneDrive AVANT filtrage doneMap/errorMap
    let rawScannedCount = 0

    // Helper : appel Graph avec support pagination (@odata.nextLink est une URL absolue complète)
    // callGraph() préfixe toujours le base URL — il ne faut donc passer que le chemin relatif
    async function callGraphWithNextLink(token: string, relativeOrAbsolute: string): Promise<any> {
      // Si c'est une URL absolue (@odata.nextLink), extraire le chemin + query
      if (relativeOrAbsolute.startsWith('https://')) {
        const parsed = new URL(relativeOrAbsolute)
        // Enlever le préfixe https://graph.microsoft.com/v1.0
        const path = parsed.pathname.replace('/v1.0', '') + parsed.search
        return callGraph(token, path)
      }
      return callGraph(token, relativeOrAbsolute)
    }

    async function scanFolderRecursive(scanDriveId: string, scanFolderId: string, scanToken: string, depth = 0): Promise<any[]> {
      if (depth > 5) return []
      let result: any[] = []

      // Pagination : suivre @odata.nextLink jusqu'à la fin
      let url: string | null = `/drives/${scanDriveId}/items/${scanFolderId}/children?$select=name,id,file,folder,size,lastModifiedDateTime&$top=200`
      dbg(`[OneDrive Scan] Dossier: /drives/${scanDriveId}/items/${scanFolderId}/children (depth=${depth})`)

      while (url) {
        const data = await callGraphWithNextLink(scanToken, url)
        const items: any[] = data?.value || []
        dbg(`[OneDrive Scan] Réponse Graph: ${items.length} items (nextLink: ${!!data?.['@odata.nextLink']})`)

        // nextLink est une URL absolue — garder telle quelle pour callGraphWithNextLink
        url = data?.['@odata.nextLink'] || null

        for (const item of items) {
          if (item.file) {
            const ext = item.name.split('.').pop()?.toLowerCase()
            dbg(`[OneDrive Scan] Fichier trouvé: "${item.name}" (ext: ${ext})`)
            if (!['pdf', 'docx', 'doc', 'jpg', 'jpeg', 'png', 'webp'].includes(ext || '')) {
              dbg(`[OneDrive Scan] Extension ignorée: ${ext} — "${item.name}"`)
              continue
            }

            rawScannedCount++ // compte AVANT filtrage doneMap

            const lastDone = doneMap.get(item.id)
            const errorDate = errorDateMap.get(item.id)
            const ageMs = errorDate ? Date.now() - errorDate.getTime() : 0
            const isStuck = errorDate && ageMs > MAX_ERROR_DAYS * 24 * 60 * 60 * 1000 && !retryAlwaysIds.has(item.id)

            if (isStuck) {
              dbg(`[OneDrive Scan] Abandonné (>7j): "${item.name}"`)
              result.push({ ...item, _abandoned: true, _errorDate: errorDate })
            } else if (!lastDone) {
              dbg(`[OneDrive Scan] À traiter (nouveau): "${item.name}"`)
              result.push(item)
            } else {
              const lastModified = new Date(item.lastModifiedDateTime)
              if (lastModified > lastDone) {
                dbg(`[OneDrive Scan] À traiter (modifié): "${item.name}"`)
                result.push(item)
              } else {
                dbg(`[OneDrive Scan] Ignoré (déjà traité, non modifié): "${item.name}"`)
              }
            }
          }
          if (item.folder) {
            dbg(`[OneDrive Scan] Sous-dossier: "${item.name}" — scan récursif`)
            try {
              const subFiles = await scanFolderRecursive(scanDriveId, item.id, scanToken, depth + 1)
              result.push(...subFiles)
            } catch (subErr) {
              console.error(`[OneDrive Scan] Erreur sous-dossier "${item.name}":`, subErr)
            }
          }
        }
      }
      dbg(`[OneDrive Scan] Total à traiter (depth=${depth}): ${result.length} | rawScanned total: ${rawScannedCount}`)
      return result
    }

    let fichiers: any[] = []
    try {
      fichiers = await scanFolderRecursive(driveId, folderId, accessToken)
    } catch (err) {
      return NextResponse.json(
        { error: 'Impossible de lister les fichiers SharePoint' },
        { status: 500 }
      )
    }

    // Trier du plus récent au plus ancien avant traitement (Règle 5)
    fichiers.sort((a, b) =>
      new Date(b.lastModifiedDateTime || 0).getTime() - new Date(a.lastModifiedDateTime || 0).getTime()
    )

    // IDs trouvés dans le scan OneDrive ce tour-ci
    const scannedItemIds = new Set(fichiers.map((f: any) => f.id))

    // Pré-enregistrer TOUS les fichiers découverts qui ne sont pas encore dans la DB
    // Permet de les voir dans l'historique même si le traitement est en attente ou échoue
    const knownItemIds = new Set((allFichiersUpdated || []).map((f: any) => f.onedrive_item_id))
    const brandNewFiles = fichiers.filter((f: any) => !f._abandoned && !knownItemIds.has(f.id))
    if (brandNewFiles.length > 0) {
      for (const f of brandNewFiles) {
        await upsertFichier({
          integration_id: integrationId,
          onedrive_item_id: f.id,
          nom_fichier: f.name,
          traite: false,
          last_modified_at: f.lastModifiedDateTime || null,
          erreur: null,
        })
      }
    }

    // Détecter les fichiers en attente (traite:false) qui NE SONT PLUS dans le dossier OneDrive
    // → Fichier déplacé ou supprimé manuellement → marquer avec erreur explicite
    const missingFromOneDrive = (allFichiersUpdated || []).filter((f: any) => {
      if (f.traite !== false) return false          // déjà traités → ignorer
      const err = f.erreur || ''
      if (err.startsWith('Abandonné') || err.startsWith('Fichier introuvable')) return false // déjà marqués
      return !scannedItemIds.has(f.onedrive_item_id)  // pas trouvé dans le scan
    })
    if (missingFromOneDrive.length > 0) {
      const missingIds = missingFromOneDrive.map((f: any) => f.id)
      await (supabase as any)
        .from('onedrive_fichiers')
        .update({ erreur: 'Fichier introuvable dans OneDrive — déplacé ou supprimé du dossier surveillé' })
        .in('id', missingIds)
    }

    // v1.9.75 — Prévention future : fichiers "introuvable dans OneDrive" depuis ≥ MAX_ERROR_DAYS (7j)
    // → les abandonner définitivement pour ne plus polluer la liste d'erreurs.
    // Protection : si le fichier réapparait dans OneDrive, un nouveau cycle le recréera avec une nouvelle
    // ligne DB (car onedrive_item_id reste unique), donc zéro perte.
    const cutoffAbandonMs = Date.now() - MAX_ERROR_DAYS * 24 * 60 * 60 * 1000
    const longGoneIds = (allFichiersUpdated || []).filter((f: any) => {
      if (f.traite !== false) return false
      const err = f.erreur || ''
      if (!err.startsWith('Fichier introuvable')) return false
      if (scannedItemIds.has(f.onedrive_item_id)) return false  // réapparu → ne pas abandonner
      const lastErrDate = f.created_at ? new Date(f.created_at).getTime() : 0
      return lastErrDate > 0 && lastErrDate < cutoffAbandonMs
    })
    if (longGoneIds.length > 0) {
      await (supabase as any)
        .from('onedrive_fichiers')
        .update({
          traite: true,
          statut_action: 'abandoned',
          erreur: `Abandonné — fichier absent d'OneDrive depuis ${MAX_ERROR_DAYS} jours`,
          traite_le: new Date().toISOString(),
        })
        .in('onedrive_item_id', longGoneIds.map((f: any) => f.onedrive_item_id))
      dbg(`[OneDrive Sync] ${longGoneIds.length} fichier(s) absent(s) depuis ${MAX_ERROR_DAYS}j → abandonné(s) définitivement`)
    }

    let processed = 0
    let skipped = 0
    let errors = 0
    let updated = 0
    let reactivated = 0
    const created: string[] = []
    const updatedNames: string[] = []
    const reactivatedNames: string[] = []
    const errorFiles: string[] = []

    // 5. Pour chaque fichier CV NON traité (max 50 par batch, 5 en parallèle)
    const MAX_NEW = 50 // 50 CVs par batch (Vercel Pro 300s — ~100-140s max)

    // Catégorisation automatique des documents non-CV — CONTENU OCR UNIQUEMENT
    // Fix v1.9.14 : le nom de fichier n'est PLUS utilisé (faux positifs "CV_PASCALI..." classés non-CV)
    const detectDocCategory = (_filename: string, textExtrait: string): string => {
      const s = (textExtrait || '').slice(0, 500).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      if (/certificat|certificate|attestation/.test(s)) return 'certificat'
      if (/lettre de motivation|motivation/.test(s)) return 'lettre_motivation'
      if (/diplome|cfc|afp|brevet federal|certificat federal/.test(s)) return 'diplome'
      if (/permis de conduire|permis de travail|permis b|permis c/.test(s)) return 'permis'
      if (/lettre de reference|recommandation/.test(s)) return 'reference'
      if (/contrat de travail|avenant/.test(s)) return 'contrat'
      if (/bulletin de salaire|fiche de paie/.test(s)) return 'bulletin_salaire'
      return 'autre'
    }

    // Déduplication noms fichiers — UNIQUEMENT vraies copies user "nom (1).pdf"
    // Fix v1.9.14 : NE PLUS supprimer "[N]" — OneDrive ajoute [N] pour disambiguer
    //   des fichiers DIFFÉRENTS (candidats distincts avec même filename, ex CV[40].pdf ≠ CV.pdf)
    // La dédup inter-item repose déjà sur onedrive_item_id (unique Graph API).
    const normalizeBaseName = (name: string): string =>
      name
        .replace(/\s+\(\d+\)(\.[^.]+)$/, '$1') // supprime " (1)"/" (2)" avant l'extension
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()

    const dedupedFichiers: typeof fichiers = []
    const seenBaseNames = new Map<string, (typeof fichiers)[0]>()
    for (const f of fichiers) {
      const base = normalizeBaseName(f.name || '')
      const existing = seenBaseNames.get(base)
      if (!existing) {
        seenBaseNames.set(base, f)
      } else {
        const fDate = new Date((f as any).lastModifiedDateTime || 0)
        const eDate = new Date((existing as any).lastModifiedDateTime || 0)
        if (fDate > eDate) seenBaseNames.set(base, f)
      }
    }
    dedupedFichiers.push(...seenBaseNames.values())

    // Trier : CVs en premier, documents non-CV en dernier
    // Les non-CVs (certificat, permis, attestation) ont besoin que le candidat existe déjà en DB
    const nonCvPatterns = /certificat|permis|attestation|diplome|diplôme|lettre|motivation|bulletin|salaire|formation|contrat/i
    const sortedFichiers = dedupedFichiers.sort((a, b) => {
      const aIsNonCV = nonCvPatterns.test(a.name)
      const bIsNonCV = nonCvPatterns.test(b.name)
      if (aIsNonCV && !bIsNonCV) return 1  // non-CV après
      if (!aIsNonCV && bIsNonCV) return -1 // CV avant
      return 0
    })
    const fichiersToProcess = sortedFichiers.slice(0, MAX_NEW)
    // v1.9.26 — retryQueue cache l'analyse de la 1re passe (évite de ré-analyser un certificat
    // qui ferait extraire le nom de la société au lieu du candidat).
    type RetryItem = {
      fichier: typeof fichiers[number]
      analyse: any
      docType: string
      candidatNom: string
      candidatPrenom: string
      candidatEmail: string | null
      candidatTel: string
    }
    const retryQueue: RetryItem[] = []

    for (let i = 0; i < fichiersToProcess.length; i += PARALLEL) {
      const chunk = fichiersToProcess.slice(i, i + PARALLEL)
      const results = await Promise.all(chunk.map(async (fichier): Promise<{ status: 'created' | 'skipped' | 'updated' | 'reactivated' | 'error'; name?: string; candidatId?: string; filename?: string }> => {
        // Date de modification du fichier OneDrive = date d'ajout du candidat
        const fileDate = fichier.lastModifiedDateTime || new Date().toISOString()

        // Fichier bloqué depuis MAX_ERROR_DAYS jours → marquer traite:true pour stopper les retries
        if (fichier._abandoned) {
          const daysSince = fichier._errorDate ? Math.round((Date.now() - new Date(fichier._errorDate).getTime()) / 86400000) : '?'
          await upsertFichier({
            integration_id: integrationId,
            onedrive_item_id: fichier.id,
            nom_fichier: fichier.name,
            traite: true,
            traite_le: new Date().toISOString(),
            last_modified_at: fichier.lastModifiedDateTime || null,
            statut_action: 'abandoned',
            erreur: `Abandonné — bloqué depuis ${daysSince} jours malgré les tentatives. Vérifier le fichier manuellement dans OneDrive.`,
          })
          return { status: 'skipped', filename: fichier.name }
        }

        try {
          // b. Vérifie taille < 10MB
          if (fichier.size > MAX_FILE_SIZE) {
            const sizeMB = (fichier.size / 1024 / 1024).toFixed(1)
            await upsertFichier({
              integration_id: integrationId,
              onedrive_item_id: fichier.id,
              nom_fichier: fichier.name,
              traite: false,
              last_modified_at: fichier.lastModifiedDateTime || null,
              statut_action: 'error',
              erreur: `Fichier trop volumineux (${sizeMB} MB — max 10 MB)`,
            })
            return { status: 'error', filename: fichier.name }
          }

          // c. Télécharge le fichier
          const dlRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${fichier.id}/content`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          if (!dlRes.ok) {
            await upsertFichier({
              integration_id: integrationId,
              onedrive_item_id: fichier.id,
              nom_fichier: fichier.name,
              traite: false,
              last_modified_at: fichier.lastModifiedDateTime || null,
              statut_action: 'error',
              erreur: `Échec téléchargement OneDrive (HTTP ${dlRes.status}) — vérifier les permissions`,
            })
            return { status: 'error', filename: fichier.name }
          }
          let buffer = Buffer.from(await dlRes.arrayBuffer())
          const filename = fichier.name
          const ext = filename.toLowerCase().split('.').pop() || ''
          const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)
          const isPDF = ext === 'pdf'
          const isDocx = ext === 'docx'
          const isDoc  = ext === 'doc'
          const mimeType = isPDF ? 'application/pdf'
            : isDocx ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : isDoc   ? 'application/msword'
            : isImage ? `image/${ext === 'jpg' ? 'jpeg' : ext}`
            : 'application/octet-stream'

          // d. Analyse avec Claude
          let analyse: any
          let texteCV = ''

          if (isImage) {
            // Images (JPG, PNG, etc.) → envoi direct à Claude vision
            analyse = await analyserCVDepuisImage(buffer, mimeType as any)
            // Si quasi-vide → tenter rotations 90°, 180°, 270°
            const imgVide = !analyse?.nom && !analyse?.prenom && !analyse?.titre_poste && !(analyse?.competences?.length)
            if (imgVide) {
              const sharpR = (await import('sharp')).default
              for (const angle of [90, 180, 270]) {
                try {
                  const rotated = await sharpR(buffer).rotate(angle).jpeg({ quality: 85 }).toBuffer()
                  const retryAnalyse = await analyserCVDepuisImage(rotated, mimeType as any)
                  if (retryAnalyse?.nom && retryAnalyse.nom !== 'Candidat' && retryAnalyse.nom.length > 1) {
                    dbg(`[OneDrive Sync] Image rotation ${angle}° pour "${filename}"`)
                    analyse = retryAnalyse
                    break
                  }
                } catch { /* rotation failed */ }
              }
            }
          } else if (isPDF) {
            // PDF → extraction texte avec rotation automatique (0°, 90°, 180°, 270°)
            try {
              const { extractTextWithRotation } = await import('@/lib/cv-parser')
              const result = await extractTextWithRotation(buffer, filename)
              texteCV = result.text
              if (result.rotation !== 0) {
                dbg(`[OneDrive Sync] Rotation ${result.rotation}° pour "${filename}"`)
                buffer = result.rotatedBuffer as any
              }
            } catch (err: any) {
              if (err?.message === 'PDF_ENCRYPTED') throw new Error('PDF chiffré — importez-le sans mot de passe')
              console.warn(`[OneDrive Sync] Extraction texte PDF "${filename}":`, err instanceof Error ? err.message : String(err))
            }
            if (texteCV && texteCV.trim().length >= 50) {
              analyse = await analyserCV(texteCV)
              const estVide = !analyse.nom && !analyse.prenom && !analyse.titre_poste && !(analyse.competences?.length)
              if (estVide) {
                dbg(`[OneDrive Sync] Texte extrait mais résultat vide → fallback vision`)
                analyse = await analyserCVDepuisPDF(buffer)
              }
            } else {
              analyse = await analyserCVDepuisPDF(buffer)
            }
          } else if (isDocx) {
            // DOCX → extraire le texte
            try { texteCV = await extractTextFromCV(buffer, filename, mimeType) } catch (err) { console.warn(`[OneDrive Sync] Extraction texte DOCX "${filename}":`, err instanceof Error ? err.message : String(err)) }
            if (texteCV && texteCV.trim().length >= 50) {
              analyse = await analyserCV(texteCV)
            } else {
              throw new Error('DOCX illisible')
            }
          } else if (isDoc) {
            // DOC (Word 97-2003) → word-extractor via extractTextFromCV
            try { texteCV = await extractTextFromCV(buffer, filename, mimeType) } catch (err) { console.warn(`[OneDrive Sync] Extraction texte DOC "${filename}":`, err instanceof Error ? err.message : String(err)) }
            if (texteCV && texteCV.trim().length >= 50) {
              analyse = await analyserCV(texteCV)
            } else {
              throw new Error('DOC illisible')
            }
          } else {
            throw new Error(`Format non supporté: .${ext}`)
          }

          // ── Vérification analyse vide → fallback Vision PDF ──────────────────
          // Les rotations texte sont déjà gérées par extractTextWithRotation
          // Ici on retente avec Vision si l'analyse IA est vide malgré le texte extrait
          const analyseVide = !analyse.nom && !analyse.prenom && !analyse.titre_poste && !(analyse.competences?.length)
          if (analyseVide && isPDF) {
            dbg(`[OneDrive Sync] Analyse vide pour "${filename}" → retry forcé avec vision PDF`)
            try { analyse = await analyserCVDepuisPDF(buffer) } catch (err) { console.warn(`[OneDrive Sync] Vision PDF retry échoué "${filename}":`, err instanceof Error ? err.message : String(err)) }
          }
          if (analyseVide && isImage) {
            dbg(`[OneDrive Sync] Analyse vide pour "${filename}" → image illisible, sera retentée`)
            throw new Error('Image illisible — analyse vide')
          }

          // Normalisation identité avant matching et stockage
          normalizeCandidat(analyse)

          const candidatEmail = analyse.email || null
          const candidatNom = (analyse.nom || '').trim()
          const candidatPrenom = (analyse.prenom || '').trim()
          const candidatTel = (analyse.telephone || '').replace(/\D/g, '')
          // ── v1.9.33 — Classification unifiée via lib/document-classification.ts ──
          // Source unique partagée avec cv/parse et sync-test. Applique :
          // 1) IA document_type  2) patterns contenu 2000 chars  3) email générique  4) hasName && !hasExperiences
          const classification = classifyDocument({ analyse, texteCV })
          let docType = classification.docType
          let isNotCV = classification.isNotCV
          if (isNotCV && classification.reason !== 'ia') {
            dbg(`[OneDrive Sync] "${filename}" classifié non-CV (${docType}) via ${classification.reason}`)
          }

          // ── Si toujours vide après retry → erreur (traite: false → sera retenté) ──
          if (!candidatNom && !candidatPrenom && !candidatEmail && candidatTel.length < 8 && !isNotCV) {
            throw new Error('CV illisible — aucune donnée extraite (rotaté ou scan de mauvaise qualité)')
          }

          // e-bis. Si c'est un document non-CV (permis, certificat, etc.) SANS nom identifiable → skip
          if (isNotCV && !candidatNom && !candidatEmail && candidatTel.length < 8) {
            dbg(`[OneDrive Sync] Document "${docType}" sans candidat identifiable: ${filename}`)
            try {
              await upsertFichier({
                integration_id: integrationId,
                onedrive_item_id: fichier.id,
                nom_fichier: filename,
                traite: true,
                traite_le: new Date().toISOString(),
                last_modified_at: fichier.lastModifiedDateTime || null,
                statut_action: 'abandoned',
                erreur: `Document "${docType}" — aucun candidat identifiable`,
              })
            } catch (err) { console.warn('[OneDrive Sync] upsertFichier (document sans candidat) échec:', err instanceof Error ? err.message : String(err)) }

            // Log activité pour traçabilité
            try {
              await (supabase as any).from('activites').insert({
                type: 'onedrive_sync',
                description: `Document ignoré — "${docType}" sans candidat identifiable`,
                metadata: { filename, document_type: docType, source: 'onedrive' },
                created_at: new Date().toISOString(),
              })
            } catch (err) { console.warn('[OneDrive Sync] logActivity (doc sans candidat) échec:', err instanceof Error ? err.message : String(err)) }

            return { status: 'skipped', name: `⚠️ ${filename} (${docType})` }
          }

          // f. Vérifie doublon candidat via cascade unifiée (lib/candidat-matching.ts)
          // Identité (nom+prénom) en premier, email/tel/DDN pour désambiguïsation.
          // Aucune référence au nom de fichier — tout vient du contenu extrait par IA.
          let existingCandidat: any = null
          const matchResult = await findExistingCandidat(supabase, {
            nom: candidatNom,
            prenom: candidatPrenom,
            email: candidatEmail,
            telephone: candidatTel,
            date_naissance: analyse.date_naissance || null,
            localisation: (analyse as any).localisation || null,
          }, { selectColumns: 'id, nom, prenom, email, telephone, date_naissance, localisation, titre_poste' })

          if (matchResult.kind === 'match') {
            existingCandidat = matchResult.candidat
            // Log silencieux des diffs de coordonnées (homonymes parfaits avec coords différentes)
            if (matchResult.diffs && matchResult.diffs.length > 0) {
              try {
                const diffsText = matchResult.diffs
                  .map(d => `${d.field}: "${d.from || ''}" → "${d.to || ''}"`).join(', ')
                await (supabase as any).from('activites').insert({
                  type: 'candidat_modifie',
                  description: `Coordonnées mises à jour via import OneDrive — ${diffsText}`,
                  candidat_id: existingCandidat.id,
                  metadata: { source: 'onedrive', filename, diffs: matchResult.diffs, reason: matchResult.reason },
                  created_at: new Date().toISOString(),
                })
              } catch (err) { console.warn('[OneDrive Sync] log diff coords échec:', err instanceof Error ? err.message : String(err)) }
            }
            dbg(`[OneDrive Sync] Match ${matchResult.reason}: ${existingCandidat.prenom} ${existingCandidat.nom}`)
          } else if (matchResult.kind === 'uncertain' && !isNotCV) {
            // v1.9.31 — Pending validation : score 8-10 (strictExact + ville seule sans contact fort).
            // Cas type : 2 homonymes dans la même ville (ex: 2 "Daniel Costa" à Martigny) avec
            // emails/tels différents. On upload le CV, on stocke l'analyse IA, et on attend que
            // l'utilisateur valide dans /integrations (confirmer match, créer nouveau, ou ignorer).
            try {
              const timestamp = Date.now()
              const storageName = `${timestamp}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`
              const { data: storageData } = await supabase.storage
                .from('cvs')
                .upload(storageName, buffer, { contentType: mimeType, upsert: false })
              let cvUrlTemp: string | null = null
              if (storageData?.path) {
                const { data: urlData } = await supabase.storage
                  .from('cvs')
                  .createSignedUrl(storageData.path, 60 * 60 * 24 * 365 * 10)
                cvUrlTemp = urlData?.signedUrl || null
              }

              await upsertFichier({
                integration_id: integrationId,
                onedrive_item_id: fichier.id,
                nom_fichier: filename,
                traite: true,
                traite_le: new Date().toISOString(),
                last_modified_at: fichier.lastModifiedDateTime || null,
                statut_action: 'pending_validation',
                candidat_id: null,
                match_suspect_candidat_id: matchResult.candidat.id,
                match_suspect_score: matchResult.scoreBreakdown.score,
                cv_url_temp: cvUrlTemp,
                analyse_json: { ...analyse, _source_filename: filename, _file_date: fileDate },
                erreur: `⏳ À valider — match incertain avec ${matchResult.candidat.prenom || ''} ${matchResult.candidat.nom || ''}`.trim(),
              })

              try {
                await (supabase as any).from('activites').insert({
                  type: 'import_pending_validation',
                  description: `CV en attente de validation — match incertain avec ${matchResult.candidat.prenom || ''} ${matchResult.candidat.nom || ''}`.trim(),
                  candidat_id: matchResult.candidat.id,
                  metadata: {
                    source: 'onedrive',
                    filename,
                    match_score: matchResult.scoreBreakdown.score,
                    match_reason: matchResult.reason,
                    signals: matchResult.scoreBreakdown,
                  },
                  created_at: new Date().toISOString(),
                })
              } catch {}

              dbg(`[OneDrive Sync] PENDING_VALIDATION ${filename} — suspect ${matchResult.candidat.id} score=${matchResult.scoreBreakdown.score}`)
              return { status: 'skipped', name: `⏳ ${filename} — en attente validation`, filename }
            } catch (err) {
              console.warn('[OneDrive Sync] pending_validation échec:', err instanceof Error ? err.message : String(err))
              // Tombe dans le flow normal (création nouveau candidat) si l'upload/insert échoue
            }
          } else if (matchResult.kind === 'insufficient' && !isNotCV) {
            // CV sans identité extraite → erreur explicite (pas de création anonyme)
            throw new Error(`Identité non extractible — ${matchResult.reason}`)
          }
          // v1.9.20 — kind:'ambiguous' supprimé. kind === 'none' OU 'insufficient' → existingCandidat reste null.
          // v1.9.31 — kind:'uncertain' + isNotCV → même flow que 'none' (retryQueue attachmentMode).
          // Pour non-CV sans match : retryQueue ci-dessous. Pour CV : création nouveau candidat.

          // Helpers conservés pour anti-race check (lignes ~1320) — plus utilisés pour matching principal
          const unaccent = (s: string): string =>
            (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
          const nomsSimilaires = (parsed: any, existing: any): boolean => {
            // Si le parsé n'a pas de nom → on accepte (pas assez d'info pour rejeter)
            if (!parsed?.nom) return true
            // Si le candidat DB n'a pas de nom → on rejette (risque de faux positif sur n'importe quel match email/tel)
            if (!existing?.nom) return false
            const pNom = unaccent(parsed.nom), eNom = unaccent(existing.nom)
            const pPrenom = unaccent(parsed.prenom || ''), ePrenom = unaccent(existing.prenom || '')
            const nomOk = pNom.includes(eNom) || eNom.includes(pNom) ||
              pNom.split(/\s+/).some((p: string) => p.length >= 3 && eNom.split(/\s+/).some((e: string) => e.includes(p) || p.includes(e)))
            if (nomOk) return true
            if (!!pPrenom && !!ePrenom && pPrenom.slice(0, 3) === ePrenom.slice(0, 3)) return true
            // Noms composés / inversés (ex: parsé nom="Marjorie", prenom="Marmolejo Yanina" → DB "Marmolejo"+"Yanina")
            // Fallback : vérifier si BOTH nom ET prenom du DB apparaissent dans le nom complet parsé
            // (évite faux positif : "Zambrano" seul matcherait n'importe quel nom contenant "zambrano")
            const fullParsed = `${pNom} ${pPrenom}`
            const nomInFull = eNom.length >= 4 && fullParsed.includes(eNom)
            const prenomInFull = ePrenom.length >= 4 && fullParsed.includes(ePrenom)
            if (nomInFull && (prenomInFull || !ePrenom)) return true
            return false
          }

          // ── Les 5 anciennes méthodes de matching + branche non-CV ambiguïté ont été
          //    remplacées par findExistingCandidat() ci-dessus (cf. lib/candidat-matching.ts).
          //    Matching unifié identité-first, plus d'usage du nom de fichier. ──
          if (isNotCV && !existingCandidat) {
            // v1.9.26 — préserver l'analyse de la 1re passe pour le retry (évite ré-extraction de "Metalcolor")
            retryQueue.push({
              fichier,
              analyse,
              docType,
              candidatNom,
              candidatPrenom,
              candidatEmail,
              candidatTel,
            })
            return { status: 'error', filename: fichier.name }
          }

          if (existingCandidat) {
            // Smart update: fetch existing candidate fields needed for update logic
            const { data: candidatExistant } = await supabase.from('candidats')
              .select('id, nom, prenom, cv_nom_fichier, cv_url, documents, titre_poste, competences, langues, experiences, formations_details, formation, resume_ia, permis_conduire, date_naissance, genre, linkedin, annees_exp, cv_texte_brut, created_at, cv_sha256, cv_size_bytes')
              .eq('id', existingCandidat.id).single() as { data: any }

            if (!candidatExistant) {
              // Candidate disappeared, skip
              try {
                await upsertFichier({
                  integration_id: integrationId,
                  onedrive_item_id: fichier.id,
                  nom_fichier: filename,
                  traite: true,
                  traite_le: new Date().toISOString(),
                  last_modified_at: fichier.lastModifiedDateTime || null,
                  statut_action: 'error',
                  candidat_id: existingCandidat.id,
                  erreur: `Doublon — ${existingCandidat.prenom || ''} ${existingCandidat.nom}`.trim(),
                })
              } catch (err) { console.warn('[OneDrive Sync] upsertFichier (doublon) échec:', err instanceof Error ? err.message : String(err)) }
              return { status: 'skipped' }
            }

            const candidatDisplayName = `${existingCandidat.prenom || ''} ${existingCandidat.nom}`.trim()

            // Si document non-CV (permis, certificat, etc.) → ajouter comme document au candidat existant
            if (isNotCV) {
              const timestamp = Date.now()
              const storageName = `${timestamp}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`
              const { data: storageData } = await supabase.storage
                .from('cvs')
                .upload(storageName, buffer, { contentType: mimeType, upsert: false })

              let docUrl: string | null = null
              if (storageData?.path) {
                const { data: urlData } = await supabase.storage
                  .from('cvs')
                  .createSignedUrl(storageData.path, 60 * 60 * 24 * 365 * 10)
                docUrl = urlData?.signedUrl || null
              }

              const existingDocs = candidatExistant.documents || []
              // Utiliser le docType déjà détecté (IA ou second avis), pas recalculer avec detectDocCategory
              // Bug: pour les scans, texteCV est vide → detectDocCategory retournait "Autre" même si l'IA avait trouvé "certificat"
              // Map IA type → lowercase DocumentType (cohérent avec l'UI et l'import normal)
              const docTypeLabelMap: Record<string, string> = {
                'certificat': 'certificat', 'diplome': 'diplome', 'formation': 'formation',
                'attestation': 'certificat', 'permis': 'permis', 'contrat': 'contrat',
                'lettre_motivation': 'lettre_motivation', 'reference': 'reference',
                'bulletin_salaire': 'bulletin_salaire',
              }
              const docTypeLabel = (isNotCV && docType && docType !== 'cv')
                ? (docTypeLabelMap[docType.toLowerCase()] || docType)
                : detectDocCategory(filename, texteCV)
              // ✅ FIX 2a : Déduplication — ne pas pusher si même URL ou même nom de fichier déjà présent
              const isDocDuplicate = existingDocs.some((d: any) =>
                (docUrl && d.url === docUrl) || d.name === filename
              )
              if (!isDocDuplicate) {
                existingDocs.push({
                  name: filename,
                  url: docUrl,
                  type: docTypeLabel,
                  uploaded_at: new Date().toISOString(),
                })
              }

              await (supabase as any).from('candidats').update({
                documents: existingDocs,
                // Ne PAS mettre à jour created_at pour un document non-CV — évite de backdater le candidat
                updated_at: new Date().toISOString(),
              }).eq('id', candidatExistant.id)

              try {
                await upsertFichier({
                  integration_id: integrationId,
                  onedrive_item_id: fichier.id,
                  nom_fichier: filename,
                  traite: true,
                  traite_le: new Date().toISOString(),
                  last_modified_at: fichier.lastModifiedDateTime || null,
                  statut_action: 'document',
                  candidat_id: existingCandidat.id,
                  erreur: `${docTypeLabel} ajouté — ${candidatDisplayName}`,
                })
              } catch (err) { console.warn('[OneDrive Sync] upsertFichier (document ajouté) échec:', err instanceof Error ? err.message : String(err)) }

              return { status: 'updated', name: `📄 ${docTypeLabel} → ${candidatDisplayName}`, candidatId: existingCandidat.id, filename }
            }

            // ── v1.9.42 — Décision contenuIdentique SANS filename matching ─────────
            // Signaux primaires déterministes (par ordre de priorité) :
            //   1. SHA256 des bytes du fichier (déterministe, fiable, ne dépend pas de l'extraction)
            //   2. Taille en bytes (fallback pour le stock historique sans hash)
            //   3. Texte extrait (fallback final, bruité pour les scans Vision IA)
            //   4. memeItemLiee (same onedrive_item_id — rare car re-upload = nouveau id)
            const currentSha256 = createHash('sha256').update(buffer).digest('hex')
            const currentSize   = buffer.length

            const existingSha256 = (candidatExistant.cv_sha256 as string) || null
            const existingSize   = (candidatExistant.cv_size_bytes as number) || null

            const hashMatch = !!(existingSha256 && currentSha256 === existingSha256)
            const sizeMatch = !hashMatch && !existingSha256 && !!(existingSize && currentSize === existingSize)

            // Texte : comparaison texte ACTIVÉE même si hash/size présents (fix 20/04/2026).
            // Cas : même CV ré-encodé/re-téléchargé depuis autre source → hash+size différents
            // mais texte OCR identique. Ancien guard !existingSha256 && !existingSize rendait
            // textMatch inatteignable post-backfill v1.9.43 → duplication silencieuse (ex: Luce).
            // Seuil peutComparer 100 chars minimum garde la sécurité contre faux-positifs.
            const extrait500 = texteCV.slice(0, 500).replace(/\s+/g, ' ').trim()
            const stocke500 = (candidatExistant.cv_texte_brut || '').slice(0, 500).replace(/\s+/g, ' ').trim()
            const peutComparer = extrait500.length >= 100 && stocke500.length >= 100
            const textMatch = peutComparer && extrait500 === stocke500

            // Comparaison date : lastModifiedDateTime du fichier OneDrive vs last_modified_at en DB
            const rowFichier = (allFichiersUpdated || []).find((f: any) => f.onedrive_item_id === fichier.id)
            const dateDernierTraitement = rowFichier?.last_modified_at || null
            const memeItemLiee = !!(rowFichier?.traite && (
              !rowFichier.candidat_id || rowFichier.candidat_id === existingCandidat.id
            ))

            // ⚠️ Pas de memeNomBase : règle dure "jamais de filename matching" (feedback João)
            const contenuIdentique = hashMatch || sizeMatch || textMatch || memeItemLiee

            // Comparaison via Date objects — les formats diffèrent : OneDrive "...Z" vs DB "...+00:00"
            const memeDate = !!(dateDernierTraitement && fileDate &&
              Math.abs(new Date(fileDate).getTime() - new Date(dateDernierTraitement).getTime()) < 1000)

            // v1.9.42 — Trace diagnostic enrichi avec signaux hash/size
            console.error('[OneDrive Sync TRACE]', JSON.stringify({
              filename,
              candidat: `${candidatExistant.prenom || ''} ${candidatExistant.nom}`.trim(),
              sha256: { current: currentSha256.slice(0, 12), existing: existingSha256 ? existingSha256.slice(0, 12) : null, match: hashMatch },
              size: { current: currentSize, existing: existingSize, match: sizeMatch },
              text: { extrait_len: extrait500.length, stocke_len: stocke500.length, peutComparer, match: textMatch },
              memeItemLiee,
              contenuIdentique,
              memeDate,
            }))

            // Cas 1 : contenu identique + date identique → SKIP total (rien à faire)
            if (contenuIdentique && memeDate) {
              await upsertFichier({
                integration_id: integrationId,
                onedrive_item_id: fichier.id,
                nom_fichier: filename,
                traite: true,
                traite_le: new Date().toISOString(),
                last_modified_at: fichier.lastModifiedDateTime || null,
                statut_action: 'skipped',
                candidat_id: existingCandidat.id,
                erreur: `Ignoré — contenu et date identiques (${candidatDisplayName})`,
              })
              return { status: 'skipped', filename }
            }

            // Cas 2 : contenu identique + date plus récente → RÉACTIVATION (created_at uniquement)
            if (contenuIdentique && !memeDate) {
              // Fix 5 — ne rétrograder que si la date importée est plus récente
              const importedIsNewer = !candidatExistant.created_at || new Date(fileDate).getTime() > new Date(candidatExistant.created_at).getTime()
              await (supabase as any).from('candidats').update({
                ...(importedIsNewer ? { created_at: fileDate } : {}),
                // v1.9.42 — backfill opportuniste hash/size si absents (stock historique)
                ...(!existingSha256 ? { cv_sha256: currentSha256 } : {}),
                ...(!existingSize ? { cv_size_bytes: currentSize } : {}),
                updated_at: new Date().toISOString(),
                last_import_at: new Date().toISOString(),
                // NEW3 — badge coloré persistant jusqu'à ouverture fiche
                onedrive_change_type: 'reactive',
                onedrive_change_at: new Date().toISOString(),
              }).eq('id', candidatExistant.id)
              // Fix 3 — supprimer de candidats_vus pour faire réapparaître le badge
              try { await (supabase as any).from('candidats_vus').delete().eq('candidat_id', candidatExistant.id) } catch {}
              try {
                await upsertFichier({
                  integration_id: integrationId,
                  onedrive_item_id: fichier.id,
                  nom_fichier: filename,
                  traite: true,
                  traite_le: new Date().toISOString(),
                  last_modified_at: fichier.lastModifiedDateTime || null,
                  statut_action: 'reactivated',
                  candidat_id: existingCandidat.id,
                  erreur: `Réactivé — ${candidatDisplayName}`,
                })
              } catch (err) { console.warn('[OneDrive Sync] upsertFichier (réactivé) échec:', err instanceof Error ? err.message : String(err)) }
              return { status: 'reactivated', name: candidatDisplayName }
            }

            // Cas 3 & 4 : contenu différent → UPDATE complet (peu importe le nom du fichier)
            {
              // Nouveau CV → devient CV principal, ancien conservé dans documents[]
              const timestamp = Date.now()
              const storageName = `${timestamp}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`
              const { data: storageData } = await supabase.storage
                .from('cvs')
                .upload(storageName, buffer, { contentType: mimeType, upsert: false })

              let newCvUrl: string | null = null
              if (storageData?.path) {
                const { data: urlData } = await supabase.storage
                  .from('cvs')
                  .createSignedUrl(storageData.path, 60 * 60 * 24 * 365 * 10)
                newCvUrl = urlData?.signedUrl || null
              }

              // Safety guard : si contenuIdentique est vrai malgré les guards (OCR non déterministe, race)
              // → supprimer le fichier orphelin uploadé et traiter comme réactivation sans écraser cv_url
              if (contenuIdentique) {
                if (storageData?.path) {
                  await supabase.storage.from('cvs').remove([storageData.path]).catch(() => {})
                }
                // Fix 5 — ne rétrograder que si la date importée est plus récente
                const importedIsNewerSafety = !candidatExistant.created_at || new Date(fileDate).getTime() > new Date(candidatExistant.created_at).getTime()
                await (supabase as any).from('candidats').update({
                  ...(importedIsNewerSafety ? { created_at: fileDate } : {}),
                  updated_at: new Date().toISOString(),
                  last_import_at: new Date().toISOString(),
                  onedrive_change_type: 'reactive',
                  onedrive_change_at: new Date().toISOString(),
                }).eq('id', candidatExistant.id)
                // Fix 3 — supprimer de candidats_vus pour faire réapparaître le badge
                try { await (supabase as any).from('candidats_vus').delete().eq('candidat_id', candidatExistant.id) } catch {}
                try {
                  await upsertFichier({
                    integration_id: integrationId,
                    onedrive_item_id: fichier.id,
                    nom_fichier: filename,
                    traite: true,
                    traite_le: new Date().toISOString(),
                    last_modified_at: fichier.lastModifiedDateTime || null,
                    statut_action: 'reactivated',
                    candidat_id: existingCandidat.id,
                    erreur: `Réactivé (même CV que l'existant) — ${candidatDisplayName}`,
                  })
                } catch (err) { console.warn('[OneDrive Sync] upsertFichier (safety guard) échec:', err instanceof Error ? err.message : String(err)) }
                return { status: 'reactivated', name: candidatDisplayName }
              }

              // Fix 5 — ne jamais rétrograder : si le fichier importé est plus ancien → archiver dans documents[]
              const importedIsOlder = !!(candidatExistant.created_at && fileDate &&
                new Date(fileDate).getTime() < new Date(candidatExistant.created_at).getTime())

              if (importedIsOlder) {
                // CV plus ancien → archiver dans documents[], ne pas écraser cv_url ni created_at
                // v1.9.42 — dédup par URL uniquement (jamais filename matching)
                const existingDocs = candidatExistant.documents || []
                if (newCvUrl && !existingDocs.some((d: any) => d.url === newCvUrl || d.name === filename)) {
                  existingDocs.push({ name: `[Archive] ${filename}`, url: newCvUrl, type: 'cv', uploaded_at: new Date().toISOString() })
                }
                await (supabase as any).from('candidats').update({
                  documents: existingDocs,
                  updated_at: new Date().toISOString(),
                  last_import_at: new Date().toISOString(),
                }).eq('id', candidatExistant.id)
                // Fix 3 — supprimer de candidats_vus pour faire réapparaître le badge
                try { await (supabase as any).from('candidats_vus').delete().eq('candidat_id', candidatExistant.id) } catch {}
                try {
                  await upsertFichier({
                    integration_id: integrationId,
                    onedrive_item_id: fichier.id,
                    nom_fichier: filename,
                    traite: true,
                    traite_le: new Date().toISOString(),
                    last_modified_at: fichier.lastModifiedDateTime || null,
                    statut_action: 'updated',
                    candidat_id: existingCandidat.id,
                    erreur: `Archivé (plus ancien) — ${candidatDisplayName}`,
                  })
                } catch (err) { console.warn('[OneDrive Sync] upsertFichier (archivé plus ancien) échec:', err instanceof Error ? err.message : String(err)) }
                return { status: 'updated', name: candidatDisplayName, candidatId: existingCandidat.id, filename }
              }

              // Move old CV to documents array — v1.9.65 préfixe [Ancien] aligné avec cv/parse L951
              const existingDocs = candidatExistant.documents || []
              if (candidatExistant.cv_url) {
                const oldBaseName = candidatExistant.cv_nom_fichier || 'Ancien CV'
                const oldArchiveName = `[Ancien] ${oldBaseName}`
                // Dédup par URL OU nom brut OU nom préfixé (accepte les 3 variantes)
                const isOldCvDuplicate = existingDocs.some((d: any) =>
                  d.url === candidatExistant.cv_url ||
                  d.name === oldBaseName ||
                  d.name === oldArchiveName
                )
                if (!isOldCvDuplicate) {
                  existingDocs.push({
                    name: oldArchiveName,
                    url: candidatExistant.cv_url,
                    type: 'cv',
                    uploaded_at: new Date().toISOString(),
                  })
                }
              }

              // Extraction photo si le candidat n'en a pas encore
              let updatedPhotoUrl: string | null = null
              if (!candidatExistant.photo_url && (isPDF || isDocx || isDoc || isImage)) {
                try {
                  const timeoutPhoto = new Promise<null>((resolve) => setTimeout(() => resolve(null), 35000))
                  let photoBuffer: Buffer | null = null
                  if (isPDF) {
                    const { extractPhotoFromPDF } = await import('@/lib/cv-photo')
                    photoBuffer = await Promise.race([extractPhotoFromPDF(buffer), timeoutPhoto])
                  } else if (isDocx) {
                    const { extractPhotoFromDOCX } = await import('@/lib/cv-photo')
                    photoBuffer = await Promise.race([extractPhotoFromDOCX(buffer), timeoutPhoto])
                  } else if (isDoc) {
                    const { extractPhotoFromDOC } = await import('@/lib/cv-photo')
                    photoBuffer = await Promise.race([extractPhotoFromDOC(buffer), timeoutPhoto])
                  } else if (isImage) {
                    // Image CV (WhatsApp/scan) — Strategy 3 Vision pour localiser le portrait
                    const { extractPhotoFromImage } = await import('@/lib/cv-photo')
                    photoBuffer = await Promise.race([extractPhotoFromImage(buffer), timeoutPhoto])
                  }
                  if (photoBuffer) {
                    const photoTs = Date.now()
                    const photoName = `photos/${photoTs}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}.jpg`
                    const { data: photoData } = await supabase.storage.from('cvs').upload(photoName, photoBuffer, { contentType: 'image/jpeg', upsert: false })
                    if (photoData?.path) {
                      const { data: pUrl } = await supabase.storage.from('cvs').createSignedUrl(photoData.path, 60 * 60 * 24 * 365 * 10)
                      updatedPhotoUrl = pUrl?.signedUrl || null
                    }
                  }
                } catch { /* photo extraction on update failed */ }
              }

              // Update candidate with new CV data
              // created_at = date du fichier OneDrive = date de dernière candidature/disponibilité
              //
              // v1.9.30 : écrasement classique = enrichissement automatique voulu.
              // v1.9.32 : pour les matches à TRÈS haut score (≥ 16, ex: nom exact + DDN
              //   + email/tel + ville), on passe en merge intelligent — préserve les
              //   expériences/compétences existantes (union au lieu d'écrasement).
              //   En-dessous (score 11-15, match standard), on garde l'écrasement v1.9.30.
              const matchScore = matchResult.kind === 'match' ? (matchResult.scoreBreakdown?.score || 0) : 0
              const useMergeIntelligent = matchScore >= 16

              const basePayload: Record<string, any> = useMergeIntelligent
                ? (() => {
                    // Merge intelligent : uniquement les champs modifiés sont écrits.
                    // Les coords email/tel/localisation/DDN ne sont jamais touchées (immuables).
                    const { payload, report } = mergeCandidat(candidatExistant as any, analyse as any)
                    try {
                      const reportText = mergeReportToText(report)
                      if (report.merged.length || report.filledEmpty.length || report.replaced.length) {
                        dbg(`[OneDrive Sync] Merge intelligent (score=${matchScore}) : ${reportText}`)
                      }
                    } catch {}
                    return payload as Record<string, any>
                  })()
                : {
                    // Comportement classique v1.9.30 (écrasement enrichissement bio)
                    titre_poste: analyse.titre_poste || candidatExistant.titre_poste,
                    competences: analyse.competences || candidatExistant.competences,
                    langues: analyse.langues || candidatExistant.langues,
                    experiences: analyse.experiences || candidatExistant.experiences,
                    formations_details: analyse.formations_details || candidatExistant.formations_details,
                    formation: analyse.formation || candidatExistant.formation,
                    resume_ia: analyse.resume || candidatExistant.resume_ia,
                    permis_conduire: analyse.permis_conduire ?? candidatExistant.permis_conduire,
                    genre: normaliserGenre(analyse.genre) ?? candidatExistant.genre ?? null,
                    linkedin: analyse.linkedin || candidatExistant.linkedin,
                    annees_exp: analyse.annees_exp || candidatExistant.annees_exp,
                    // Fix 20/04/2026 (décision João) : email/tel/localisation écrasés si le
                    // nouveau CV fournit une valeur (candidat peut changer de mail / déménager).
                    // DDN reste IMMUABLE (règle métier absolue : DDN différente = 2 personnes).
                    email:          analyse.email          || candidatExistant.email          || null,
                    telephone:      analyse.telephone      || candidatExistant.telephone      || null,
                    localisation:   analyse.localisation   || candidatExistant.localisation   || null,
                    date_naissance: candidatExistant.date_naissance || analyse.date_naissance || null,
                  }

              await (supabase as any).from('candidats').update({
                ...basePayload,
                cv_url: newCvUrl || candidatExistant.cv_url,
                cv_nom_fichier: filename,
                cv_texte_brut: texteCV.slice(0, 10000) || candidatExistant.cv_texte_brut,
                cv_sha256: currentSha256,       // v1.9.42
                cv_size_bytes: currentSize,      // v1.9.42
                documents: existingDocs,
                created_at: fileDate, // Date de candidature = date du fichier sur OneDrive (importedIsOlder déjà géré plus haut)
                updated_at: new Date().toISOString(),
                last_import_at: new Date().toISOString(),
                // NEW3 — badge bleu "Actualisé" persistant jusqu'à ouverture
                onedrive_change_type: 'mis_a_jour',
                onedrive_change_at: new Date().toISOString(),
                ...(updatedPhotoUrl ? { photo_url: updatedPhotoUrl } : {}),
              }).eq('id', candidatExistant.id)
              // Fix 3 — supprimer de candidats_vus pour faire réapparaître le badge
              try { await (supabase as any).from('candidats_vus').delete().eq('candidat_id', candidatExistant.id) } catch {}

              try {
                await upsertFichier({
                  integration_id: integrationId,
                  onedrive_item_id: fichier.id,
                  nom_fichier: filename,
                  traite: true,
                  traite_le: new Date().toISOString(),
                  last_modified_at: fichier.lastModifiedDateTime || null,
                  statut_action: 'updated',
                  ancien_nom_fichier: candidatExistant.cv_nom_fichier || null,
                  candidat_id: existingCandidat.id,
                  erreur: `Mis à jour — ${candidatDisplayName}`,
                })
              } catch (err) { console.warn('[OneDrive Sync] upsertFichier (mis à jour) échec:', err instanceof Error ? err.message : String(err)) }

              return { status: 'updated', name: candidatDisplayName, candidatId: existingCandidat.id, filename }
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

          // Extraction photo du PDF, DOCX ou DOC (timeout 35s — Vercel Pro)
          let photoUrl: string | null = null
          if (isPDF || isDocx || isDoc || isImage) {
            try {
              const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 35000))
              let photoBuffer: Buffer | null = null
              if (isPDF) {
                const { extractPhotoFromPDF } = await import('@/lib/cv-photo')
                photoBuffer = await Promise.race([extractPhotoFromPDF(buffer), timeoutPromise])
              } else if (isDocx) {
                const { extractPhotoFromDOCX } = await import('@/lib/cv-photo')
                photoBuffer = await Promise.race([extractPhotoFromDOCX(buffer), timeoutPromise])
              } else if (isDoc) {
                const { extractPhotoFromDOC } = await import('@/lib/cv-photo')
                photoBuffer = await Promise.race([extractPhotoFromDOC(buffer), timeoutPromise])
              } else if (isImage) {
                const { extractPhotoFromImage } = await import('@/lib/cv-photo')
                photoBuffer = await Promise.race([extractPhotoFromImage(buffer), timeoutPromise])
              }
              if (photoBuffer) {
                const photoName = `photos/${timestamp}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}.jpg`
                const { data: photoData } = await supabase.storage.from('cvs').upload(photoName, photoBuffer, { contentType: 'image/jpeg', upsert: false })
                if (photoData?.path) {
                  const { data: pUrl } = await supabase.storage.from('cvs').createSignedUrl(photoData.path, 60 * 60 * 24 * 365 * 10)
                  photoUrl = pUrl?.signedUrl || null
                }
              }
            } catch { /* photo extraction failed */ }
          }

          // ── Validation minimum avant création (évite les "Candidat" vides) ──
          // Un candidat DOIT avoir au minimum un nom OU un prénom OU un email OU un téléphone
          const aDesInfosBase = candidatNom || candidatPrenom || candidatEmail || candidatTel.length >= 8
          const aDesInfosCV = analyse.titre_poste || (analyse.competences?.length > 0) || (analyse.experiences?.length > 0)
          if (!aDesInfosBase && !aDesInfosCV) {
            throw new Error(`Document vide ou illisible — aucune donnée exploitable extraite (${filename}). Vérifiez que le fichier contient bien un CV.`)
          }

          // h. Vérification anti-race juste avant INSERT
          // (deux fichiers du même batch peuvent passer les checks en parallèle)
          if (candidatEmail) {
            const { data: lateCandidatEmail } = await supabase.from('candidats').select('id, nom, prenom').ilike('email', candidatEmail).maybeSingle()
            if (lateCandidatEmail && nomsSimilaires(analyse, lateCandidatEmail)) {
              await upsertFichier({
                integration_id: integrationId,
                onedrive_item_id: fichier.id,
                nom_fichier: filename,
                traite: true,
                traite_le: new Date().toISOString(),
                last_modified_at: fichier.lastModifiedDateTime || null,
                statut_action: 'skipped',
                candidat_id: lateCandidatEmail.id,
                erreur: `Doublon détecté (import simultané) — rattaché à ${lateCandidatEmail.prenom || ''} ${lateCandidatEmail.nom}`.trim(),
              })
              return { status: 'skipped', filename }
            }
          }
          if (candidatNom && candidatPrenom) {
            const { data: lateCandidatNom } = await supabase.from('candidats').select('id, nom, prenom').ilike('nom', candidatNom).ilike('prenom', candidatPrenom).maybeSingle()
            if (lateCandidatNom) {
              await upsertFichier({
                integration_id: integrationId,
                onedrive_item_id: fichier.id,
                nom_fichier: filename,
                traite: true,
                traite_le: new Date().toISOString(),
                last_modified_at: fichier.lastModifiedDateTime || null,
                statut_action: 'skipped',
                candidat_id: lateCandidatNom.id,
                erreur: `Doublon détecté (import simultané) — rattaché à ${lateCandidatNom.prenom || ''} ${lateCandidatNom.nom}`.trim(),
              })
              return { status: 'skipped', filename }
            }
          }
          // Race check par téléphone — évite les doublons quand deux fichiers du même candidat
          // sont traités en parallèle et le match original était uniquement par téléphone
          if (candidatTel.length >= 8) {
            const tel9 = candidatTel.slice(-9)
            const { data: telCandidats } = await supabase.from('candidats').select('id, nom, prenom, telephone').not('telephone', 'is', null).limit(300)
            if (telCandidats) {
              const lateCandidatTel = telCandidats.find((c: any) => {
                const stored = (c.telephone || '').replace(/\D/g, '')
                return stored.length >= 8 && stored.slice(-9) === tel9
              })
              if (lateCandidatTel && nomsSimilaires(analyse, lateCandidatTel)) {
                await upsertFichier({
                  integration_id: integrationId,
                  onedrive_item_id: fichier.id,
                  nom_fichier: filename,
                  traite: true,
                  traite_le: new Date().toISOString(),
                  last_modified_at: fichier.lastModifiedDateTime || null,
                  statut_action: 'skipped',
                  candidat_id: lateCandidatTel.id,
                  erreur: `Doublon détecté (import simultané, même téléphone) — rattaché à ${lateCandidatTel.prenom || ''} ${lateCandidatTel.nom}`.trim(),
                })
                return { status: 'skipped', filename }
              }
            }
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
              date_naissance: analyse.date_naissance || null,
              permis_conduire: analyse.permis_conduire ?? false,
              genre: normaliserGenre(analyse.genre),
              cv_url: cvUrl,
              photo_url: photoUrl,
              cv_nom_fichier: filename,
              resume_ia: analyse.resume || null,
              cv_texte_brut: texteCV.slice(0, 10000),
              cv_sha256: createHash('sha256').update(buffer).digest('hex'), // v1.9.42
              cv_size_bytes: buffer.length,                                   // v1.9.42
              statut_pipeline: null, // JAMAIS d'ajout auto en pipeline
              import_status: 'a_traiter',
              last_import_at: new Date().toISOString(),
              source: 'ONEDRIVE',
              tags: [],
              created_at: fileDate, // Date de modification du fichier OneDrive
              // NEW3 — badge vert "Nouveau" persistant jusqu'à ouverture
              onedrive_change_type: 'nouveau',
              onedrive_change_at: new Date().toISOString(),
            } as any)
            .select()
            .single()

          if (dbError) throw dbError

          const candidatId = (candidat as any)?.id || null

          // i. Insert dans onedrive_fichiers
          try {
            await upsertFichier({
              integration_id: integrationId,
              onedrive_item_id: fichier.id,
              nom_fichier: filename,
              traite: true,
              traite_le: new Date().toISOString(),
              last_modified_at: fichier.lastModifiedDateTime || null,
              statut_action: 'created',
              candidat_id: candidatId,
            })
          } catch (tableErr: any) {
            const msg = tableErr?.message || ''
            if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('42P01')) {
              console.warn('[OneDrive Sync] Table onedrive_fichiers manquante — candidat créé mais non enregistré')
            }
          }

          return { status: 'created', name: `${candidatPrenom} ${candidatNom}`.trim() || 'Candidat', candidatId, filename }

        } catch (err) {
          // Sérialisation robuste — capture tous les types d'erreurs
          const errMsg = err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : (err as any)?.message
                ? (err as any).message
                : (err as any)?.error
                  ? String((err as any).error)
                  : JSON.stringify(err) || 'Erreur non sérialisable'

          console.error(`[OneDrive Sync] Erreur fichier ${fichier.name}:`, errMsg)

          // Enregistre l'erreur dans onedrive_fichiers (traite: false → sera retenté par le cron)
          // ✅ FIX : traite_le mis à jour à chaque tentative échouée.
          // Sans ce fix, retryLastAttempt reste null → shouldRetry = true en permanence →
          // les fichiers "introuvable" sont re-essayés à chaque batch du sync manuel.
          await upsertFichier({
            integration_id: integrationId,
            onedrive_item_id: fichier.id,
            nom_fichier: fichier.name,
            traite: false,
            traite_le: new Date().toISOString(),
            last_modified_at: fichier.lastModifiedDateTime || null,
            statut_action: 'error',
            erreur: errMsg,
          })
          return { status: 'error', filename: fichier.name }
        }
      }))

      // Accumulate results
      const individualLogs: any[] = []
      for (const r of results) {
        if (r.status === 'created') {
          processed++
          if (r.name) created.push(r.name)
          individualLogs.push({
            user_id: '00000000-0000-0000-0000-000000000000',
            user_name: 'Système (OneDrive)',
            type: 'cv_importe',
            titre: `CV importé — ${r.name}`,
            description: `Fichier: ${r.filename || 'inconnu'} · Dossier: ${folderName}`,
            candidat_id: r.candidatId || null,
            candidat_nom: r.name || null,
            metadata: { source: 'onedrive', folder: folderName },
          })
        }
        else if (r.status === 'updated') {
          updated++
          if (r.name) updatedNames.push(r.name)
          individualLogs.push({
            user_id: '00000000-0000-0000-0000-000000000000',
            user_name: 'Système (OneDrive)',
            type: 'cv_actualise',
            titre: `CV actualisé — ${r.name}`,
            description: `Fichier: ${r.filename || 'inconnu'} · Dossier: ${folderName}`,
            candidat_id: r.candidatId || null,
            candidat_nom: r.name || null,
            metadata: { source: 'onedrive', folder: folderName },
          })
        }
        else if (r.status === 'reactivated') {
          reactivated++
          if (r.name) reactivatedNames.push(r.name)
          individualLogs.push({
            user_id: '00000000-0000-0000-0000-000000000000',
            user_name: 'Système (OneDrive)',
            type: 'cv_doublon',
            titre: `CV réactivé — ${r.name || 'inconnu'}`,
            description: `Fichier: ${r.filename || 'inconnu'} · Dossier: ${folderName}`,
            candidat_id: r.candidatId || null,
            candidat_nom: r.name || null,
            metadata: { source: 'onedrive', folder: folderName },
          })
        }
        else if (r.status === 'skipped') skipped++
        else if (r.status === 'error') { errors++; if (r.filename) errorFiles.push(r.filename) }
      }

      // Log individual activities (batch insert)
      if (individualLogs.length > 0) {
        try {
          await (supabase as any).from('activites').insert(individualLogs)
        } catch (e) {
          console.error('[OneDrive Sync] Erreur log activites individuelles:', e)
        }
      }
    }

    // 5b. Retry non-CVs "introuvable" — le candidat a peut-être été créé dans ce même batch
    // v1.9.26 — on réutilise l'analyse de la 1re passe (évite ré-extraction "Metalcolor" sur
    // un certificat) et on passe par findExistingCandidat (même logique que la 1re passe).
    if (retryQueue.length > 0) {
      dbg(`[OneDrive Sync] Retry ${retryQueue.length} documents non-CV après création de ${created.length} candidats`)
      for (const item of retryQueue) {
        const { fichier, analyse, docType, candidatNom, candidatPrenom, candidatEmail, candidatTel } = item
        try {
          const ext = fichier.name.split('.').pop()?.toLowerCase()
          const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext || '')
          const isPDF = ext === 'pdf'
          const mimeType = isPDF ? 'application/pdf' : isImage ? `image/${ext === 'jpg' ? 'jpeg' : ext}` : 'application/octet-stream'

          // Re-matching avec la même logique que la 1re passe (identité-first)
          const matchInput = {
            nom: candidatNom,
            prenom: candidatPrenom,
            email: candidatEmail,
            telephone: candidatTel,
            date_naissance: analyse?.date_naissance || null,
            localisation: analyse?.localisation || null,
          }
          let matchResult = await findExistingCandidat(supabase, matchInput, { selectColumns: 'id, nom, prenom, documents' })

          // v1.9.27 — Fallback attachmentMode : si le stricte ne trouve rien, retenter avec
          // seuil relâché (strictExact|strictSubset à score ≥ 3) SEULEMENT si 1 seul candidat.
          // Couvre les cas où le CV a été importé avec nom tronqué (ex: "Costa" au lieu de
          // "Fragoso Costa") et les documents non-CV n'ont ni DDN/tel/email.
          if (matchResult.kind !== 'match') {
            matchResult = await findExistingCandidat(supabase, matchInput, {
              selectColumns: 'id, nom, prenom, documents',
              attachmentMode: true,
            })
          }

          const match = matchResult.kind === 'match' ? matchResult.candidat as any : null

          const docTypeMap: Record<string, string> = { 'certificat': 'certificat', 'diplome': 'diplome', 'formation': 'formation', 'attestation': 'certificat', 'permis': 'permis', 'contrat': 'contrat', 'lettre_motivation': 'lettre_motivation', 'reference': 'reference', 'bulletin_salaire': 'bulletin_salaire' }
          const mappedType = docTypeMap[docType] || 'autre'
          const docTypeLabel = docType === 'certificat' ? 'Certificat' : docType === 'diplome' ? 'Diplôme' : docType === 'permis' ? 'Permis' : docType === 'attestation' ? 'Attestation' : `Document (${docType})`

          if (match) {
            // Télécharger + uploader maintenant qu'on sait qu'on a un match
            const dlRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${fichier.id}/content`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            })
            if (!dlRes.ok) continue
            const buffer = Buffer.from(await dlRes.arrayBuffer())

            const timestamp = Date.now()
            const storageName = `${timestamp}_${fichier.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
            const { data: storageData } = await supabase.storage.from('cvs').upload(storageName, buffer, { contentType: mimeType, upsert: false })
            let docUrl: string | null = null
            if (storageData?.path) {
              const { data: urlData } = await supabase.storage.from('cvs').createSignedUrl(storageData.path, 60 * 60 * 24 * 365 * 10)
              docUrl = urlData?.signedUrl || null
            }
            if (!docUrl) continue

            const existingDocs = (match.documents as any[]) || []
            if (!existingDocs.some((d: any) => d.url === docUrl || d.name === fichier.name)) {
              existingDocs.push({ name: fichier.name, url: docUrl, type: mappedType, uploaded_at: new Date().toISOString() })
              await (supabase as any).from('candidats').update({ documents: existingDocs, updated_at: new Date().toISOString() }).eq('id', match.id)
            }
            await upsertFichier({ integration_id: integrationId, onedrive_item_id: fichier.id, nom_fichier: fichier.name, traite: true, traite_le: new Date().toISOString(), last_modified_at: fichier.lastModifiedDateTime || null, statut_action: 'document', candidat_id: match.id, erreur: `${docTypeLabel} rattaché (retry) — ${match.prenom || ''} ${match.nom}`.trim() })
            errors--
            const idx = errorFiles.indexOf(fichier.name)
            if (idx !== -1) errorFiles.splice(idx, 1)
            dbg(`[OneDrive Sync] Retry OK: ${fichier.name} → ${match.prenom} ${match.nom}`)
          } else {
            const nameStr = [candidatPrenom, candidatNom].filter(Boolean).join(' ') || 'inconnu'
            await upsertFichier({ integration_id: integrationId, onedrive_item_id: fichier.id, nom_fichier: fichier.name, traite: false, traite_le: new Date().toISOString(), last_modified_at: fichier.lastModifiedDateTime || null, statut_action: 'error', erreur: `${docTypeLabel} — candidat "${nameStr}" introuvable dans la base. Importez d'abord le CV de ce candidat, puis ce fichier sera rattaché automatiquement.` })
          }
        } catch (err) {
          dbg(`[OneDrive Sync] Retry échec: ${fichier.name} — ${err instanceof Error ? err.message : String(err)}`)
        }
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
      .eq('id', integrationId)

    // 7. Retourne les stats
    // `remaining` = fichiers trouvés dans le scan mais non traités ce batch (sera traité au prochain appel)
    const remaining = Math.max(0, fichiers.length - fichiersToProcess.length)
    const result = {
      success: true,
      folder: folderName,
      rawScanned: rawScannedCount,  // total CV trouvés dans OneDrive (avant filtrage doneMap)
      found: fichiers.length,       // après filtrage — à traiter réellement
      remaining,                    // reste à traiter dans les prochains batchs
      processed,
      skipped,
      updated,
      reactivated,
      errors,
      created,
      updatedNames,
      reactivatedNames,
      errorFiles,
    }

    dbg(`[OneDrive Sync] Dossier "${folderName}": ${processed} créés, ${updated} mis à jour, ${reactivated} réactivés, ${skipped} ignorés, ${errors} erreurs`)

    // Log activity if anything happened (created, updated, or reactivated)
    if (processed > 0 || updated > 0 || reactivated > 0) {
      // Log to logs_activite (legacy)
      await logActivity({ action: 'onedrive_sync', details: result })

      // NOTE: On ne log plus le résumé "onedrive_sync" global — seuls les logs individuels
      // (cv_importe, cv_actualise, cv_doublon) sont créés pour chaque fichier traité.
      // Cela évite les doublons dans la page activités.
      /*
      try {
        const parts: string[] = []
        if (processed > 0) parts.push(`${processed} importé${processed > 1 ? 's' : ''}`)
        if (updated > 0) parts.push(`${updated} mis à jour`)
        if (reactivated > 0) parts.push(`${reactivated} réactivé${reactivated > 1 ? 's' : ''}`)
        if (errors > 0) parts.push(`${errors} erreur${errors > 1 ? 's' : ''}`)

        await (supabase as any).from('activites').insert({
          user_id: '00000000-0000-0000-0000-000000000000',
          user_name: 'Système (OneDrive)',
          type: 'onedrive_sync',
          titre: `Sync OneDrive — ${parts.join(', ')}`,
          description: `Dossier: ${folderName}`,
          metadata: {
            folder: folderName,
            processed,
            updated,
            reactivated,
            skipped,
            errors,
            created: created.slice(0, 10),
            updatedNames: updatedNames.slice(0, 10),
            reactivatedNames: reactivatedNames.slice(0, 10),
          },
        })
      } catch (e) {
        console.error('[OneDrive Sync] Erreur log activites:', e)
      }
      */
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('[OneDrive Sync] Erreur fatale:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

// DELETE supprimé — ne jamais effacer l'historique (cause des re-doublons)

export async function GET() {
  const authError = await requireAdmin()
  if (authError) return authError
  try {
    const supabase = createAdminClient()

    // v1.9.36 — Désambiguïser la FK : deux relations vers candidats depuis v1.9.31
    // (candidat_id + match_suspect_candidat_id). Sans préfixe explicite, PostgREST
    // throw "Could not embed because more than one relationship was found".
    const { data, error } = await (supabase as any)
      .from('onedrive_fichiers')
      .select('*, candidats!onedrive_fichiers_candidat_id_fkey(nom, prenom)')
      .order('traite_le', { ascending: false })
      .limit(500)

    if (error) {
      // v1.9.33 — ne déclencher migration_needed QUE sur le code PostgreSQL strict 42P01
      // (undefined_table). Avant : `msg.includes('relation')` déclenchait des faux
      // positifs sur toute erreur mentionnant "relation" (colonne manquante, join cassé,
      // contrainte, etc.) → bandeau "Migration SQL" affiché à tort.
      console.error('[OneDrive Sync GET] Erreur query:', error.code, error.message, error.details)
      if (error.code === '42P01') {
        return NextResponse.json({
          fichiers: [],
          migration_needed: true,
          hint: 'Exécutez la migration SQL supabase/migrations/20260323_onedrive_fichiers.sql dans votre dashboard Supabase.',
        })
      }
      throw error
    }

    return NextResponse.json({ fichiers: data || [] })
  } catch (error) {
    console.error('[OneDrive Sync GET]', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: Request) {
  const authError = await requireAdmin()
  if (authError) return authError
  const { searchParams } = new URL(req.url)
  if (searchParams.get('action') !== 'clear-errors') {
    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  }
  const supabase = createAdminClient()
  const { count, error } = await (supabase as any)
    .from('onedrive_fichiers')
    .delete({ count: 'exact' })
    .eq('traite', false)
    .is('candidat_id', null)
    .not('erreur', 'is', null)
  if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  return NextResponse.json({ deleted: count })
}
