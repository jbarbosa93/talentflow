#!/usr/bin/env node
/**
 * Nettoyage bucket Storage "cvs" — TalentFlow
 *
 * Phases :
 *  - DRY RUN (default)   : node --env-file=.env.local scripts/cleanup-storage.mjs
 *  - EXECUTE (réel)      : node --env-file=.env.local scripts/cleanup-storage.mjs --execute
 *
 * Cible :
 *  - temp_import/* (intégralité, sauf si encore référencé en DB)
 *  - racine cvs/<timestamp>_NOM_prenom_*.pdf : doublons par candidat
 *    (garde le timestamp le plus récent)
 *
 * Préservé absolument :
 *  - photos/   (photos candidats)
 *  - cdc/      (cahiers des charges)
 *  - documents/(documents officiels)
 *  - tout fichier dont le path apparaît dans une URL référencée en DB
 *    (candidats.cv_url, candidats.photo_url, candidats.documents[*].url,
 *     onedrive_fichiers.cv_url_temp, offres.cdc_url,
 *     anomalies_resolved.resolved_cv_url)
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Variables manquantes : NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

const DRY_RUN = process.argv[2] !== '--execute'
const BUCKET = 'cvs'
const LOG_FILE = 'cleanup-log.txt'

console.log(
  DRY_RUN
    ? '🔍 MODE DRY RUN — aucune suppression'
    : '⚠️  MODE EXECUTION — suppression réelle dans 3s… (Ctrl+C pour annuler)'
)

if (!DRY_RUN) {
  await new Promise((r) => setTimeout(r, 3000))
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Extrait le path Storage à partir d'une URL signée/publique Supabase
 *  ex: https://xxx.supabase.co/storage/v1/object/sign/cvs/1774_NOM.pdf?token=...
 *   -> "1774_NOM.pdf"
 *  ex: https://xxx.supabase.co/storage/v1/object/sign/cvs/photos/abc_NOM.jpg?token=...
 *   -> "photos/abc_NOM.jpg"
 */
const extractCvsPath = (url) => {
  if (!url || typeof url !== 'string') return null
  const match = url.match(/\/(?:sign|public)\/cvs\/([^?]+)/)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

/** Liste paginée d'un préfixe Storage (la limite 1000 de .list()) */
async function listAllPaginated(prefix) {
  const all = []
  let offset = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, {
        limit: PAGE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
    if (error) {
      console.error(`❌ list("${prefix}") @ offset=${offset}:`, error)
      break
    }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    offset += PAGE
  }
  return all
}

/** Extrait clé candidat depuis un filename
 *  ex: "1774056721498_MOURA_leandro_20.08.2025.pdf" -> "moura_leandro"
 *  Gère aussi le double timestamp "1774_1773_NOM_prenom.pdf"
 */
const extractCandidatKey = (filename) => {
  const noTs = filename.replace(/^\d{13}_(?:\d{13}_)?/, '')
  const noExt = noTs.replace(/\.[^.]+$/, '')
  const parts = noExt.split('_').filter(Boolean)
  return parts.slice(0, 2).join('_').toLowerCase()
}

/** Extrait timestamp leader (ms epoch) du filename, ou 0 si absent */
const extractTimestamp = (filename) => {
  const m = filename.match(/^(\d{13})_/)
  return m ? parseInt(m[1], 10) : 0
}

const logDeletion = (path) => {
  fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} DELETED: ${path}\n`)
}

// ─── ÉTAPE 0 — Charger toutes les références DB en mémoire ──────────────────

console.log('\n📡 Chargement références DB en mémoire…')
const referenced = new Set()
const addRef = (url) => {
  const p = extractCvsPath(url)
  if (p) referenced.add(p)
}

// 1) candidats.cv_url + photo_url + documents
{
  const PAGE_SIZE = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('candidats')
      .select('cv_url, photo_url, documents')
      .range(from, from + PAGE_SIZE - 1)
    if (error) {
      console.error('❌ load candidats:', error)
      process.exit(1)
    }
    if (!data || data.length === 0) break
    for (const c of data) {
      addRef(c.cv_url)
      if (c.photo_url && c.photo_url !== 'checked') addRef(c.photo_url)
      if (Array.isArray(c.documents)) {
        for (const d of c.documents) {
          if (d && typeof d === 'object' && d.url) addRef(d.url)
        }
      }
    }
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
}

// 2) onedrive_fichiers.cv_url_temp
{
  const { data } = await supabase
    .from('onedrive_fichiers')
    .select('cv_url_temp')
    .not('cv_url_temp', 'is', null)
  ;(data || []).forEach((r) => addRef(r.cv_url_temp))
}

// 3) offres.cdc_url
{
  const { data } = await supabase
    .from('offres')
    .select('cdc_url')
    .not('cdc_url', 'is', null)
  ;(data || []).forEach((r) => addRef(r.cdc_url))
}

// 4) anomalies_resolved.resolved_cv_url
{
  const { data } = await supabase
    .from('anomalies_resolved')
    .select('resolved_cv_url')
    .not('resolved_cv_url', 'is', null)
  ;(data || []).forEach((r) => addRef(r.resolved_cv_url))
}

console.log(`✅ ${referenced.size.toLocaleString()} paths Storage référencés en DB`)

// ─── ÉTAPE 1 — temp_import/ ─────────────────────────────────────────────────

const toDelete = []
let totalBytes = 0
let tempImportSkipped = 0

console.log('\n📁 Inspection temp_import/…')
const tempFiles = await listAllPaginated('temp_import')
console.log(`   ${tempFiles.length} fichiers trouvés dans temp_import/`)

for (const f of tempFiles) {
  if (f.name === '.emptyFolderPlaceholder') continue
  const path = `temp_import/${f.name}`
  if (referenced.has(path)) {
    tempImportSkipped++
    continue
  }
  toDelete.push(path)
  totalBytes += f.metadata?.size || 0
}

console.log(`   🗑️  ${toDelete.length} candidats à supprimer (${tempImportSkipped} préservés car référencés)`)

const sizeAfterTemp = totalBytes
const countAfterTemp = toDelete.length

// ─── ÉTAPE 2 — Doublons CV à la racine ──────────────────────────────────────

console.log('\n📁 Inspection racine cvs/ (CVs candidats)…')
const rootFiles = await listAllPaginated('')
console.log(`   ${rootFiles.length} entrées à la racine`)

// Filtrer : ne garder que les fichiers .pdf/.doc[x] avec timestamp leader,
// EXCLURE les sous-dossiers (photos/, cdc/, documents/, temp_import/, etc.)
const cvRootFiles = rootFiles.filter((f) => {
  if (!f.name || !f.metadata) return false // sous-dossier
  if (f.name === '.emptyFolderPlaceholder') return false
  return /^\d{13}_/.test(f.name)
})
console.log(`   ${cvRootFiles.length} fichiers CV avec timestamp leader`)

// Grouper par candidat
const groups = new Map()
for (const f of cvRootFiles) {
  const key = extractCandidatKey(f.name)
  if (!key || key.length < 3) continue
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(f)
}

let groupsWithDuplicates = 0
let rootKept = 0
let rootDeleted = 0
let rootRefSkipped = 0

for (const [key, files] of groups.entries()) {
  if (files.length < 2) continue
  groupsWithDuplicates++

  // Tri timestamp décroissant — le plus récent en tête
  files.sort((a, b) => extractTimestamp(b.name) - extractTimestamp(a.name))
  const newest = files[0]
  const others = files.slice(1)

  // SÉCURITÉ : si le "newest" est référencé OU pas, on le garde toujours.
  // SÉCURITÉ : pour les "others", on les retire de toDelete s'ils sont référencés.
  rootKept++
  const toDel = []
  for (const f of others) {
    const path = f.name
    if (referenced.has(path)) {
      rootRefSkipped++
      continue
    }
    toDel.push({ path, size: f.metadata?.size || 0, name: f.name })
  }

  if (toDel.length === 0) continue

  console.log(
    `\n👤 ${key} — ${files.length} fichiers` +
      `\n   ✅ Garder : ${newest.name} (${((newest.metadata?.size || 0) / 1024 / 1024).toFixed(2)} MB)` +
      `\n   🗑️  Supprimer : ${toDel.map((d) => d.name).join(', ')}`
  )

  for (const d of toDel) {
    toDelete.push(d.path)
    totalBytes += d.size
    rootDeleted++
  }
}

// ─── ÉTAPE 3 — Récapitulatif ────────────────────────────────────────────────

const totalMB = totalBytes / 1024 / 1024
const tempMB = sizeAfterTemp / 1024 / 1024
const dupMB = (totalBytes - sizeAfterTemp) / 1024 / 1024

console.log(`
═══════════════════════════════════════════════════
📊 RÉCAPITULATIF
═══════════════════════════════════════════════════
📁 temp_import/      : ${countAfterTemp.toLocaleString()} fichiers à supprimer (${tempMB.toFixed(2)} MB)
                       ${tempImportSkipped} préservés car référencés en DB
📁 doublons racine   : ${rootDeleted.toLocaleString()} fichiers à supprimer (${dupMB.toFixed(2)} MB)
                       ${rootKept.toLocaleString()} candidats avec doublons (1 conservé chacun)
                       ${rootRefSkipped} doublons préservés car référencés
───────────────────────────────────────────────────
🗑️  Total à supprimer : ${toDelete.length.toLocaleString()} fichiers
💾 Espace récupéré   : ${totalMB.toFixed(2)} MB (${(totalMB / 1024).toFixed(2)} GB)
═══════════════════════════════════════════════════
`)

if (DRY_RUN) {
  // Échantillon des 20 premiers paths pour vérification
  console.log('\n📋 Échantillon (20 premiers) :')
  toDelete.slice(0, 20).forEach((p, i) => console.log(`   ${i + 1}. ${p}`))
  if (toDelete.length > 20) console.log(`   … et ${toDelete.length - 20} autres`)

  console.log(`
✅ DRY RUN terminé.
Pour supprimer réellement, relancer avec :
  node --env-file=.env.local scripts/cleanup-storage.mjs --execute
`)
  process.exit(0)
}

// ─── ÉTAPE 4 — Suppression réelle ───────────────────────────────────────────

console.log('\n🔥 Suppression en cours…')
let totalDeleted = 0
let totalErrors = 0

for (let i = 0; i < toDelete.length; i += 100) {
  const batch = toDelete.slice(i, i + 100)
  const { data, error } = await supabase.storage.from(BUCKET).remove(batch)
  if (error) {
    console.error(`❌ Erreur batch ${Math.floor(i / 100) + 1}:`, error)
    totalErrors += batch.length
  } else {
    const okCount = Array.isArray(data) ? data.length : batch.length
    totalDeleted += okCount
    batch.forEach(logDeletion)
    console.log(
      `✅ Batch ${Math.floor(i / 100) + 1}/${Math.ceil(toDelete.length / 100)} : ${okCount} fichiers supprimés`
    )
  }
  await new Promise((r) => setTimeout(r, 500))
}

console.log(`
🎉 Nettoyage terminé !
✅ ${totalDeleted.toLocaleString()} fichiers supprimés
❌ ${totalErrors} erreurs
💾 ${(totalMB / 1024).toFixed(2)} GB récupérés (estimé)
📝 Log détaillé : ${LOG_FILE}
`)
