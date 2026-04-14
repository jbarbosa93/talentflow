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
    const { data: allFichiers } = await (supabase as any)
      .from('onedrive_fichiers')
      .select('id, onedrive_item_id, traite, created_at, erreur, candidat_id')
      .limit(10000)

    // Auto-reset des fichiers orphelins : traite:true mais candidat_id IS NULL
    // (marqués "traités" mais aucun candidat créé — ancien bug insert unique)
    const EXCLUSIONS = ['Abandonné', 'Document', 'Doublon', 'non-CV', 'sans candidat', 'Remis en file']
    const orphanIds = (allFichiers || [])
      .filter((f: any) => {
        if (!f.traite || f.candidat_id) return false
        const err = f.erreur || ''
        return !EXCLUSIONS.some(e => err.startsWith(e) || err.includes(e))
      })
      .map((f: any) => f.id)

    if (orphanIds.length > 0) {
      await (supabase as any)
        .from('onedrive_fichiers')
        .update({
          traite: false,
          erreur: 'Remis en file — re-sync auto (orphelin détecté)',
          created_at: new Date().toISOString(), // Reset du timer — évite l'abandon immédiat
        })
        .in('id', orphanIds)
      dbg(`[OneDrive Sync] ${orphanIds.length} fichier(s) orphelin(s) remis en file automatiquement`)
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

    // Catégorisation automatique des documents non-CV selon nom de fichier puis contenu extrait
    const detectDocCategory = (filename: string, textExtrait: string): string => {
      const check = (source: string) => {
        const s = source.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        if (/certificat|certificate|attestation|\bct\b/.test(s)) return 'certificat'
        if (/lettre|motivation|\blm\b/.test(s)) return 'lettre_motivation'
        if (/diplome|diplome|cfc|afp|formation|brevet/.test(s)) return 'diplome'
        if (/permis|licence/.test(s)) return 'permis'
        if (/reference|recommandation/.test(s)) return 'reference'
        if (/contrat|avenant/.test(s)) return 'contrat'
        if (/bulletin|salaire|fiche de paie/.test(s)) return 'bulletin_salaire'
        return null
      }
      return check(filename.replace(/\.[^.]+$/, ''))
        ?? check(textExtrait.slice(0, 200))
        ?? 'autre'
    }

    // Déduplication noms fichiers : si OneDrive crée "CV [45].pdf" en doublon de "CV.pdf"
    // → on garde uniquement le plus récent par nom de base normalisé
    const normalizeBaseName = (name: string): string =>
      name
        .replace(/\s*[\[(]\d+[\])]\s*/g, '') // supprime [45], (45), [1], etc.
        .replace(/\s+_\d+(\.[^.]+)$/, '$1')  // supprime _45 avant l'extension
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
    const retryQueue: typeof fichiers = [] // Non-CVs "introuvable" à retenter après le batch

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
            erreur: `Abandonné — bloqué depuis ${daysSince} jours, vérifier manuellement`,
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
          const buffer = Buffer.from(await dlRes.arrayBuffer())
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
          } else if (isPDF) {
            // PDF → essayer d'extraire le texte, sinon vision
            try { texteCV = await extractTextFromCV(buffer, filename, mimeType) } catch (err: any) {
              if (err?.message === 'PDF_ENCRYPTED') throw new Error('PDF chiffré — importez-le sans mot de passe')
              console.warn(`[OneDrive Sync] Extraction texte PDF "${filename}":`, err instanceof Error ? err.message : String(err))
            }
            if (texteCV && texteCV.trim().length >= 50) {
              analyse = await analyserCV(texteCV)
              // Si le texte était illisible (scan rotaté) → fallback vision avec correction rotation
              const estVide = !analyse.nom && !analyse.prenom && !analyse.titre_poste && !(analyse.competences?.length)
              if (estVide) {
                dbg(`[OneDrive Sync] Texte extrait mais résultat vide (PDF rotaté?) → fallback vision`)
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

          // ── Vérification analyse vide (CV rotaté / illisible) ──────────────────
          // Si l'analyse ne retourne ni nom, ni prénom, ni titre → réessayer avec vision PDF
          const analyseVide = !analyse.nom && !analyse.prenom && !analyse.titre_poste && !(analyse.competences?.length)
          if (analyseVide && isPDF) {
            dbg(`[OneDrive Sync] Analyse vide pour "${filename}" → retry forcé avec vision PDF (CV peut-être rotaté)`)
            try { analyse = await analyserCVDepuisPDF(buffer) } catch (err) { console.warn(`[OneDrive Sync] Vision PDF retry échoué "${filename}":`, err instanceof Error ? err.message : String(err)) }
            // Si toujours vide → tenter rotation 180° (PDF à l'envers)
            const encoreVide = !analyse.nom && !analyse.prenom && !analyse.titre_poste && !(analyse.competences?.length)
            if (encoreVide) {
              dbg(`[OneDrive Sync] Vision aussi vide → fallback rotation 180° pour "${filename}"`)
              try {
                const { PDFDocument, degrees: pdfDegrees } = await import('pdf-lib')
                const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true })
                for (let p = 0; p < pdfDoc.getPageCount(); p++) {
                  const page = pdfDoc.getPage(p)
                  const curr = page.getRotation().angle
                  page.setRotation(pdfDegrees((curr + 180) % 360))
                }
                const rotatedBuffer = Buffer.from(await pdfDoc.save())
                const retryAnalyse = await analyserCVDepuisPDF(rotatedBuffer)
                const retryHasName = retryAnalyse.nom && retryAnalyse.nom !== 'Candidat' && retryAnalyse.nom.length > 1
                if (retryHasName || retryAnalyse.email || retryAnalyse.telephone || retryAnalyse.competences?.length) {
                  dbg(`[OneDrive Sync] Rotation 180° réussie : ${retryAnalyse.nom} ${retryAnalyse.prenom}`)
                  analyse = retryAnalyse
                } else {
                  dbg(`[OneDrive Sync] Rotation 180° aussi vide`)
                }
              } catch (rotErr) { console.warn(`[OneDrive Sync] Rotation 180° échouée "${filename}":`, rotErr instanceof Error ? rotErr.message : String(rotErr)) }
            }
          }
          if (analyseVide && isImage) {
            dbg(`[OneDrive Sync] Analyse vide pour "${filename}" → image illisible, sera retentée`)
            throw new Error('Image illisible — analyse vide')
          }

          const candidatEmail = analyse.email || null
          const candidatNom = (analyse.nom || '').trim()
          const candidatPrenom = (analyse.prenom || '').trim()
          const candidatTel = (analyse.telephone || '').replace(/\D/g, '')
          let docType = analyse.document_type || 'cv'
          let isNotCV = docType && docType !== 'cv'

          // ── Second avis : si l'IA dit "cv", vérifier via detectDocCategory (nom fichier) + patterns stricts (contenu) ──
          // Rattrape les scans avec nom générique ("Scanné 6 janv...") où l'IA rate le type.
          // Le check par nom de fichier utilise detectDocCategory (assez fiable — un fichier nommé "certificat" en est un).
          // Le check par contenu utilise des patterns STRICTS (titres de document, pas de mots isolés)
          // pour éviter les faux positifs sur les CVs mentionnant "formation", "permis B", "CFC", etc.
          if (!isNotCV) {
            const filenameType = detectDocCategory(filename, '')
            if (filenameType && filenameType !== 'autre') {
              docType = filenameType
              isNotCV = true
            } else {
              // Check contenu strict — uniquement des formulations de TITRE de document
              const contentLower = texteCV.slice(0, 500).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
              const strictContentType =
                /certificat de travail|certificat d'emploi|arbeitszeugnis/.test(contentLower) ? 'certificat' :
                /lettre de motivation|bewerbungsschreiben/.test(contentLower) ? 'lettre_motivation' :
                /bulletin de salaire|fiche de paie|lohnabrechnung/.test(contentLower) ? 'bulletin_salaire' :
                /permis de travail|permis de sejour|autorisation de travail|aufenthaltsbewilligung/.test(contentLower) ? 'permis' :
                /lettre de recommandation|lettre de reference|referenzschreiben/.test(contentLower) ? 'reference' :
                /contrat de travail|avenant au contrat|arbeitsvertrag/.test(contentLower) ? 'contrat' :
                null
              if (strictContentType) {
                docType = strictContentType
                isNotCV = true
              }
            }
          }

          // ── Fix cvScore=0 : diplôme/certificat sans contenu CV → traiter comme non-CV ──
          if (!isNotCV) {
            const hasExperiences = Array.isArray(analyse.experiences) && analyse.experiences.length > 0
            const hasCompetences = Array.isArray(analyse.competences) && analyse.competences.length >= 2
            const hasContact     = !!(analyse.email || analyse.telephone)
            const hasTitle       = !!(analyse.titre_poste && analyse.titre_poste !== 'Candidat' && analyse.titre_poste.length > 1)
            const cvScore        = [hasExperiences, hasCompetences, hasContact, hasTitle].filter(Boolean).length
            const hasName        = !!(candidatNom && candidatNom !== 'Candidat' && candidatNom.length > 1)

            if (hasName && cvScore === 0) {
              dbg(`[OneDrive Sync] cvScore=0 pour "${filename}" (${candidatNom}) → traité comme non-CV (diplôme/certificat)`)
              docType = 'diplome'
              isNotCV = true
            }
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

          // f. Vérifie doublon candidat (5 méthodes, du plus fiable au moins fiable)
          let existingCandidat: any = null

          // Helper : retire accents + lowercase — utilisé dans toutes les comparaisons de noms
          const unaccent = (s: string): string =>
            (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

          // Helper : évite les faux positifs quand deux personnes différentes partagent un email/tel
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

          // 1. Par email
          if (candidatEmail && !existingCandidat) {
            const { data } = await supabase.from('candidats').select('id, nom, prenom')
              .ilike('email', candidatEmail).maybeSingle()
            if (data && nomsSimilaires(analyse, data)) existingCandidat = data
          }
          // 2. Par téléphone — comparaison normalisée côté JS (évite le problème des espaces/formats)
          //    Ex: "+41 77 423 99 95" en DB ne contient pas "774239995" en ilike → on normalise les deux
          if (!existingCandidat && candidatTel.length >= 8) {
            const tel9 = candidatTel.slice(-9)
            // ✅ FIX 1 : Suppression du filtre prenom en DB — trop restrictif pour les noms composés/inversés.
            // Ex: Claude extrait prenom="Marjorie Yanina" mais DB a prenom="Yanina" → filtre ilike('%marjorie%') éliminait le bon candidat.
            // Le téléphone sur 9 chiffres est quasi-unique → nomsSimilaires() suffit comme validation post-match.
            // Filtre optionnel par la dernière partie du nom (> 3 chars) pour limiter les résultats côté DB.
            let telQuery = supabase.from('candidats').select('id, nom, prenom, telephone').not('telephone', 'is', null)
            if (candidatNom) {
              const lastNomPart = unaccent(candidatNom.split(/\s+/).pop()!)
              if (lastNomPart.length >= 4) telQuery = (telQuery as any).ilike('nom', `%${lastNomPart}%`)
            }
            const { data: telCandidats } = await telQuery.limit(300)
            if (telCandidats) {
              const telMatch = telCandidats.find((c: any) => {
                const stored = (c.telephone || '').replace(/\D/g, '')
                return stored.length >= 8 && stored.slice(-9) === tel9
              })
              if (telMatch && nomsSimilaires(analyse, telMatch)) existingCandidat = telMatch
            }
          }
          // 3. Par nom + prénom (insensible aux accents — noms composés)
          //    Ex: Parsé "Marmolejo Zambrano" + "Marjorie Yanina" → DB nom="Marmolejo" prenom="Yanina"
          //    Requête: OR sur tous les mots du nom. Filtre strict: nom word match + prenom word match.
          if (!existingCandidat && candidatNom && candidatPrenom) {
            const nomNorm = unaccent(candidatNom)
            const prenomNorm = unaccent(candidatPrenom)
            // Requête DB avec TOUS les mots du nom via OR (pas juste le dernier)
            const nomParts = nomNorm.split(/\s+/).filter((p: string) => p.length >= 3)
            let byNomPrenom: any[] | null = null
            if (nomParts.length === 1) {
              const { data } = await supabase.from('candidats')
                .select('id, nom, prenom, telephone, email, localisation, experiences, formations_details')
                .ilike('nom', `%${nomParts[0]}%`)
                .limit(20)
              byNomPrenom = data
            } else if (nomParts.length > 1) {
              const orClauses = nomParts.map((p: string) => `nom.ilike.%${p}%`).join(',')
              const { data } = await supabase.from('candidats')
                .select('id, nom, prenom, telephone, email, localisation, experiences, formations_details')
                .or(orClauses)
                .limit(20)
              byNomPrenom = data
            }
            if (byNomPrenom) {
              // Filtre strict : nom word match + prenom word match
              // Évite faux positifs noms composés : "Zambrano" seul ne suffit pas sans prenom match
              const candidates = byNomPrenom.filter((c: any) => {
                const eNom = unaccent(c.nom || '')
                const ePrenom = unaccent(c.prenom || '')
                // Nom : au moins un mot du parsé correspond à un mot du DB (inclusion)
                const nomWords_p = nomNorm.split(/\s+/).filter((w: string) => w.length >= 3)
                const nomWords_e = eNom.split(/\s+/).filter((w: string) => w.length >= 3)
                const nomMatch = nomWords_p.some((p: string) => nomWords_e.some((e: string) => p.includes(e) || e.includes(p)))
                if (!nomMatch) return false
                // Prenom : au moins un mot exact ou startsWith (≥4 chars)
                // Ex: "Marjorie Yanina" vs "Yanina" → "yanina"="yanina" ✓
                // Ex: "Marjorie" vs "Marina" → "marjorie".startsWith("marina")=false ✗
                const prenomWords_p = prenomNorm.split(/\s+/).filter((w: string) => w.length >= 3)
                const prenomWords_e = ePrenom.split(/\s+/).filter((w: string) => w.length >= 3)
                if (prenomWords_p.length === 0 || prenomWords_e.length === 0) return true // pas assez d'info prenom
                return prenomWords_p.some((p: string) => prenomWords_e.some((e: string) =>
                  p === e || (p.length >= 4 && e.length >= 4 && (p.startsWith(e) || e.startsWith(p)))
                ))
              })

              if (candidates.length === 1) {
                // Un seul candidat → vérifier signal supplémentaire (éviter faux positifs homonymes)
                const c = candidates[0]
                const telOk = candidatTel.length >= 8 && c.telephone &&
                  c.telephone.replace(/\D/g, '').slice(-9) === candidatTel.slice(-9)
                const emailOk = candidatEmail && c.email &&
                  candidatEmail.toLowerCase() === c.email.toLowerCase()
                const locNorm = unaccent(analyse.localisation || '')
                const cLocNorm = unaccent(c.localisation || '')
                const titreNorm = unaccent(analyse.titre_poste || '')
                const cTitreNorm = unaccent(c.titre_poste || '')
                const locMetierOk = locNorm && cLocNorm && titreNorm && cTitreNorm &&
                  cLocNorm.includes(locNorm.split(/[\s,]+/)[0]) &&
                  titreNorm.includes(cTitreNorm.split(/[\s,\/]+/)[0])
                if (telOk || emailOk || locMetierOk) {
                  existingCandidat = c
                }
                // Sinon → pas de match, sera traité comme nouveau candidat
              } else if (candidates.length > 1) {
                // Plusieurs candidats → affiner par email, tel, localisation, expériences
                let refined: any = null

                // a. Email
                if (!refined && candidatEmail) {
                  refined = candidates.find((c: any) =>
                    c.email && c.email.toLowerCase() === candidatEmail.toLowerCase()
                  ) || null
                }
                // b. Téléphone
                if (!refined && candidatTel.length >= 8) {
                  refined = candidates.find((c: any) => {
                    const stored = (c.telephone || '').replace(/\D/g, '')
                    return stored.length >= 8 && stored.slice(-9) === candidatTel.slice(-9)
                  }) || null
                }
                // c. Localisation (ville)
                if (!refined && analyse.localisation) {
                  const locNorm = unaccent(analyse.localisation)
                  refined = candidates.find((c: any) =>
                    c.localisation && unaccent(c.localisation).includes(locNorm.split(/[\s,]+/)[0])
                  ) || null
                }
                // d. Nom de l'établissement dans experiences[] ou formations_details[]
                //    Utile pour les certificats/diplômes : "McDonald's" → chercher dans historique
                if (!refined && filename) {
                  const fileBase = unaccent(normalizeBaseName(filename).replace(/\.[^.]+$/, ''))
                  // Extraire mots significatifs du nom de fichier (≥4 chars, pas de mots vides)
                  const fileWords = fileBase.split(/[\s_-]+/).filter((w: string) => w.length >= 4)
                  if (fileWords.length > 0) {
                    refined = candidates.find((c: any) => {
                      const exps = JSON.stringify(c.experiences || []).toLowerCase()
                      const forms = JSON.stringify(c.formations_details || []).toLowerCase()
                      const haystack = exps + ' ' + forms
                      return fileWords.some((w: string) => haystack.includes(w))
                    }) || null
                  }
                }

                if (refined) {
                  existingCandidat = refined
                } else {
                  // Ambiguïté non résolue → erreur explicite, pas de rattachement automatique
                  const names = candidates.map((c: any) =>
                    `${c.prenom || ''} ${c.nom} (${c.id.slice(0, 8)})`.trim()
                  ).join(', ')
                  throw new Error(
                    `Ambiguïté — ${candidates.length} candidats correspondent : ${names}. ` +
                    `Rattachez manuellement depuis la fiche candidat.`
                  )
                }
              }
            }
          }
          // 4. Match partiel nom (dernière partie) + prénom + téléphone OU email confirmé
          //    Email et téléphone sont uniques → seuls signaux fiables pour confirmer l'identité
          //    Localisation / date_naissance volontairement exclues (pas uniques)
          //    Comparaison insensible aux accents via unaccent()
          if (!existingCandidat && candidatNom && candidatPrenom) {
            const lastNamePart = unaccent(candidatNom.split(/\s+/).pop()!) // ex: "tavares" depuis "Vieira Tavares"
            const firstNamePart = unaccent(candidatPrenom.split(/\s+/)[0])
            if (lastNamePart.length >= 4) {
              const { data: byPartialName } = await supabase.from('candidats')
                .select('id, nom, prenom, telephone, email')
                .ilike('nom', `%${lastNamePart}%`)
                .limit(30)
              if (byPartialName) {
                const match = byPartialName.find((c: any) => {
                  // 1. Prénom doit correspondre (premier mot) — insensible aux accents
                  const cPrenom = unaccent(c.prenom || '')
                  const prenomOk = cPrenom.includes(firstNamePart) || firstNamePart.includes(cPrenom.split(/\s+/)[0])
                  if (!prenomOk) return false
                  // 2. Obligatoirement : téléphone OU email correspondent
                  const telOk = candidatTel.length >= 8 && c.telephone &&
                    c.telephone.replace(/\D/g, '').slice(-9) === candidatTel.slice(-9)
                  const emailOk = candidatEmail && c.email &&
                    candidatEmail.toLowerCase() === c.email.toLowerCase()
                  return telOk || emailOk
                })
                if (match) existingCandidat = match
              }
            }
          }
          // 5. Par cv_nom_fichier (dernier recours — si l'IA a mal extrait email/tel/nom)
          //    Utile pour les re-syncs où le fichier est déjà connu en DB par son nom exact
          //    On normalise pour ignorer les suffixes OneDrive [45], (1), etc.
          if (!existingCandidat && filename) {
            const normalizedFilename = normalizeBaseName(filename)
            const { data: byFilename } = await supabase.from('candidats')
              .select('id, nom, prenom, cv_nom_fichier')
              .ilike('cv_nom_fichier', filename) // cherche d'abord le nom exact
              .maybeSingle()
            if (byFilename && nomsSimilaires(analyse, byFilename)) {
              existingCandidat = byFilename
            } else if (!byFilename && normalizedFilename !== filename.toLowerCase()) {
              // Si pas de match exact, essayer avec le nom normalisé (sans suffixe [45])
              const { data: byNormalizedFilename } = await supabase.from('candidats')
                .select('id, nom, prenom, cv_nom_fichier')
                .ilike('cv_nom_fichier', normalizedFilename)
                .maybeSingle()
              if (byNormalizedFilename && nomsSimilaires(analyse, byNormalizedFilename)) existingCandidat = byNormalizedFilename
            }
          }

          // ── Document non-CV (certificat, diplôme, etc.) SANS candidat correspondant ──
          // Mettre en file de retry — le candidat est peut-être en cours de création dans ce même batch
          if (isNotCV && !existingCandidat) {
            retryQueue.push(fichier)
            return { status: 'error', filename: fichier.name }
          }

          if (existingCandidat) {
            // Smart update: fetch existing candidate fields needed for update logic
            const { data: candidatExistant } = await supabase.from('candidats')
              .select('id, nom, prenom, cv_nom_fichier, cv_url, documents, titre_poste, competences, langues, experiences, formations_details, formation, resume_ia, permis_conduire, date_naissance, genre, linkedin, annees_exp, cv_texte_brut, created_at')
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

            // ── Décision mise à jour CV ───────────────────────────────────────────────
            // Comparaison contenu : 500 premiers chars de cv_texte_brut (suffisant pour détecter un vrai diff)
            const extrait500 = texteCV.slice(0, 500).replace(/\s+/g, ' ').trim()
            const stocke500 = (candidatExistant.cv_texte_brut || '').slice(0, 500).replace(/\s+/g, ' ').trim()
            const peutComparer = extrait500.length >= 100 && stocke500.length >= 100

            // Comparaison date : lastModifiedDateTime du fichier OneDrive vs last_modified_at en DB
            const rowFichier = (allFichiersUpdated || []).find((f: any) => f.onedrive_item_id === fichier.id)
            const dateDernierTraitement = rowFichier?.last_modified_at || null

            // Fix 1 — fallback images/scans : si fichier déjà lié à ce candidat → traiter comme contenu identique
            // Évite de réuploader le même scan/image à chaque changement de date OneDrive (OCR non déterministe)
            // v1.8.23 — élargi pour records legacy (pré-v1.8.21) où candidat_id est null :
            // si traite=true ET (candidat_id match OU candidat_id null) → même item
            const memeItemLiee = !!(rowFichier?.traite && (
              !rowFichier.candidat_id || rowFichier.candidat_id === existingCandidat.id
            ))
            // Fix v1.8.28 — normalisation complète : timestamp + espaces/underscores + lowercase
            const normFnOd = (n: string) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^(\d+_)+/, '').replace(/[_\s]+/g, '_').toLowerCase()
            const memeNomBase = normFnOd(filename) === normFnOd(candidatExistant.cv_nom_fichier || '')
            const contenuIdentique =
              memeNomBase ||
              (peutComparer ? extrait500 === stocke500 : normFnOd(filename) === normFnOd(candidatExistant.cv_nom_fichier || ''))
              || memeItemLiee
            // Comparaison via Date objects — les formats diffèrent : OneDrive "...Z" vs DB "...+00:00"
            const memeDate = !!(dateDernierTraitement && fileDate &&
              Math.abs(new Date(fileDate).getTime() - new Date(dateDernierTraitement).getTime()) < 1000)

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
                updated_at: new Date().toISOString(),
                has_update: true,
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
                  has_update: true,
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
                    erreur: `Réactivé (safety) — ${candidatDisplayName}`,
                  })
                } catch (err) { console.warn('[OneDrive Sync] upsertFichier (safety guard) échec:', err instanceof Error ? err.message : String(err)) }
                return { status: 'reactivated', name: candidatDisplayName }
              }

              // Fix 5 — ne jamais rétrograder : si le fichier importé est plus ancien → archiver dans documents[]
              const importedIsOlder = !!(candidatExistant.created_at && fileDate &&
                new Date(fileDate).getTime() < new Date(candidatExistant.created_at).getTime())

              if (importedIsOlder) {
                // CV plus ancien → archiver dans documents[], ne pas écraser cv_url ni created_at
                // Fix v1.8.27 — skip si même fichier de base
                const isSameBaseOlder = normFnOd(candidatExistant.cv_nom_fichier || '') === normFnOd(filename)
                const existingDocs = candidatExistant.documents || []
                if (newCvUrl && !isSameBaseOlder && !existingDocs.some((d: any) => d.url === newCvUrl || d.name === filename)) {
                  existingDocs.push({ name: `[Archive] ${filename}`, url: newCvUrl, type: 'cv', uploaded_at: new Date().toISOString() })
                }
                await (supabase as any).from('candidats').update({
                  documents: existingDocs,
                  updated_at: new Date().toISOString(),
                  has_update: true,
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

              // Move old CV to documents array
              const existingDocs = candidatExistant.documents || []
              if (candidatExistant.cv_url) {
                // ✅ FIX 2b : Déduplication — ne pas pusher l'ancien CV s'il est déjà dans documents[]
                // Fix v1.8.27 — aussi skip si même fichier de base (timestamp prefix différent)
                const isSameBaseOd = normFnOd(candidatExistant.cv_nom_fichier || '') === normFnOd(filename)
                const isOldCvDuplicate = isSameBaseOd || existingDocs.some((d: any) =>
                  d.url === candidatExistant.cv_url ||
                  d.name === (candidatExistant.cv_nom_fichier || 'Ancien CV')
                )
                if (!isOldCvDuplicate) {
                  existingDocs.push({
                    name: candidatExistant.cv_nom_fichier || 'Ancien CV',
                    url: candidatExistant.cv_url,
                    type: 'cv',
                    uploaded_at: new Date().toISOString(),
                  })
                }
              }

              // Extraction photo si le candidat n'en a pas encore
              let updatedPhotoUrl: string | null = null
              if (!candidatExistant.photo_url && (isPDF || isDocx || isDoc)) {
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
              await (supabase as any).from('candidats').update({
                titre_poste: analyse.titre_poste || candidatExistant.titre_poste,
                competences: analyse.competences || candidatExistant.competences,
                langues: analyse.langues || candidatExistant.langues,
                experiences: analyse.experiences || candidatExistant.experiences,
                formations_details: analyse.formations_details || candidatExistant.formations_details,
                formation: analyse.formation || candidatExistant.formation,
                resume_ia: analyse.resume || candidatExistant.resume_ia,
                permis_conduire: analyse.permis_conduire ?? candidatExistant.permis_conduire,
                date_naissance: analyse.date_naissance || candidatExistant.date_naissance,
                genre: normaliserGenre(analyse.genre) ?? candidatExistant.genre ?? null,
                linkedin: analyse.linkedin || candidatExistant.linkedin,
                annees_exp: analyse.annees_exp || candidatExistant.annees_exp,
                cv_url: newCvUrl || candidatExistant.cv_url,
                cv_nom_fichier: filename,
                cv_texte_brut: texteCV.slice(0, 10000) || candidatExistant.cv_texte_brut,
                documents: existingDocs,
                created_at: fileDate, // Date de candidature = date du fichier sur OneDrive (importedIsOlder déjà géré plus haut)
                updated_at: new Date().toISOString(),
                has_update: true,
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
          if (isPDF || isDocx || isDoc) {
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
                erreur: `Doublon détecté (race) — rattaché à ${lateCandidatEmail.prenom || ''} ${lateCandidatEmail.nom}`.trim(),
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
                erreur: `Doublon détecté (race) — rattaché à ${lateCandidatNom.prenom || ''} ${lateCandidatNom.nom}`.trim(),
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
                  erreur: `Doublon détecté (race tel) — rattaché à ${lateCandidatTel.prenom || ''} ${lateCandidatTel.nom}`.trim(),
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
              statut_pipeline: null, // JAMAIS d'ajout auto en pipeline
              import_status: 'a_traiter',
              has_update: true,
              source: 'ONEDRIVE',
              tags: [],
              created_at: fileDate, // Date de modification du fichier OneDrive
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
    if (retryQueue.length > 0) {
      dbg(`[OneDrive Sync] Retry ${retryQueue.length} documents non-CV après création de ${created.length} candidats`)
      for (const fichier of retryQueue) {
        try {
          const fileDate = fichier.lastModifiedDateTime || new Date().toISOString()
          const ext = fichier.name.split('.').pop()?.toLowerCase()
          const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext || '')
          const isPDF = ext === 'pdf'
          const mimeType = isPDF ? 'application/pdf' : isImage ? `image/${ext === 'jpg' ? 'jpeg' : ext}` : 'application/octet-stream'

          const dlRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${fichier.id}/content`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          if (!dlRes.ok) continue
          const buffer = Buffer.from(await dlRes.arrayBuffer())

          // Upload
          const timestamp = Date.now()
          const storageName = `${timestamp}_${fichier.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
          const { data: storageData } = await supabase.storage.from('cvs').upload(storageName, buffer, { contentType: mimeType, upsert: false })
          let docUrl: string | null = null
          if (storageData?.path) {
            const { data: urlData } = await supabase.storage.from('cvs').createSignedUrl(storageData.path, 60 * 60 * 24 * 365 * 10)
            docUrl = urlData?.signedUrl || null
          }
          if (!docUrl) continue

          // Extraction nom via IA (déjà fait au premier passage — on refait léger)
          let texteCV = ''
          try { texteCV = await extractTextFromCV(buffer, fichier.name) } catch {}
          const analyse = texteCV.length >= 50
            ? await analyserCV(texteCV.slice(0, 3000))
            : isImage
              ? await analyserCVDepuisImage(buffer, mimeType as any)
              : isPDF
                ? await analyserCVDepuisPDF(buffer, fichier.name)
                : { nom: '', prenom: '' } as any

          const candidatNom = analyse?.nom || ''
          const candidatPrenom = analyse?.prenom || ''
          if (!candidatNom) continue

          // Chercher le candidat (maintenant en DB)
          const unaccent = (s: string): string => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
          const { data: found } = await supabase.from('candidats')
            .select('id, nom, prenom, documents')
            .or(`nom.ilike.%${unaccent(candidatNom.split(/\s+/).pop() || candidatNom)}%`)
            .limit(20)
          const match = (found || []).find((c: any) => {
            const eNom = unaccent(c.nom || '')
            const ePrenom = unaccent(c.prenom || '')
            const pNom = unaccent(candidatNom)
            const pPrenom = unaccent(candidatPrenom)
            const nomOk = pNom.split(/\s+/).some((w: string) => w.length >= 3 && eNom.includes(w))
            const prenomOk = !pPrenom || !ePrenom || pPrenom.split(/\s+/).some((w: string) => w.length >= 2 && ePrenom.includes(w))
            return nomOk && prenomOk
          })

          if (match) {
            const existingDocs = (match.documents as any[]) || []
            const docType = analyse.document_type || 'autre'
            const docTypeLabel = docType === 'certificat' ? 'Certificat' : docType === 'diplome' ? 'Diplôme' : docType === 'permis' ? 'Permis' : docType === 'attestation' ? 'Attestation' : `Document (${docType})`
            if (!existingDocs.some((d: any) => d.url === docUrl || d.name === fichier.name)) {
              existingDocs.push({ name: fichier.name, url: docUrl, type: docTypeLabel, uploaded_at: new Date().toISOString() })
              await (supabase as any).from('candidats').update({ documents: existingDocs, updated_at: new Date().toISOString() }).eq('id', match.id)
            }
            await upsertFichier({ integration_id: integrationId, onedrive_item_id: fichier.id, nom_fichier: fichier.name, traite: true, traite_le: new Date().toISOString(), last_modified_at: fichier.lastModifiedDateTime || null, statut_action: 'document', candidat_id: match.id, erreur: `${docTypeLabel} rattaché (retry) — ${match.prenom || ''} ${match.nom}`.trim() })
            errors--
            const idx = errorFiles.indexOf(fichier.name)
            if (idx !== -1) errorFiles.splice(idx, 1)
            dbg(`[OneDrive Sync] Retry OK: ${fichier.name} → ${match.prenom} ${match.nom}`)
          } else {
            const nameStr = [candidatPrenom, candidatNom].filter(Boolean).join(' ') || 'inconnu'
            const docTypeLabel = analyse.document_type === 'certificat' ? 'Certificat' : analyse.document_type === 'permis' ? 'Permis' : `Document`
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

    const { data, error } = await (supabase as any)
      .from('onedrive_fichiers')
      .select('*, candidats(nom, prenom)')
      .order('traite_le', { ascending: false })
      .limit(500)

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
