/**
 * Batch rétroactif extraction photos — v1.9.106 post-F1bis
 *
 * Cible : candidats avec photo_url IS NULL OU 'checked' (badge initiales)
 * Volume estimé : ~2825 candidats
 * Coût Vision API : < $5
 * Durée : ~1h30 avec parallélisme 5
 *
 * Usage :
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/batch/retro-photo-extraction.ts          # DRY RUN par défaut
 *   npx tsx scripts/batch/retro-photo-extraction.ts --apply  # vrai run
 *
 * Garde-fous :
 *   - JAMAIS écraser photo_url non-null et != 'checked'
 *   - Re-vérification photo_url avant chaque UPDATE
 *   - Catch erreurs individuelles (1 échec ≠ stop)
 *   - Rapport JSON sauvegardé même en cas d'interruption
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

// ─── Fix Strategy 2 pdfjs en standalone Node ───────────────────────────
// En route Next.js, le worker pdfjs est setup par le framework.
// En script tsx standalone, on configure manuellement le workerSrc avant
// les imports lib/cv-photo (qui font des dynamic import de pdfjs-dist).
async function setupPdfjsWorker() {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const lib = (pdfjs as any).default ?? pdfjs
    if (lib.GlobalWorkerOptions) {
      // Try Option A : workerSrc pointing to the legacy worker file
      const workerPath = path.resolve(
        fileURLToPath(import.meta.url),
        '../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'
      )
      if (fs.existsSync(workerPath)) {
        lib.GlobalWorkerOptions.workerSrc = workerPath
        console.log(`[setup] pdfjs workerSrc = ${path.basename(workerPath)}`)
      } else {
        // Option B fallback — empty workerSrc (no worker, single-thread)
        lib.GlobalWorkerOptions.workerSrc = ''
        console.log('[setup] pdfjs workerSrc = "" (no worker mode)')
      }
    }
  } catch (e: any) {
    console.warn('[setup] pdfjs setup failed:', e.message)
  }
}

// Late-bound photo extraction modules (loaded after pdfjs setup)
let extractPhotoFromPDF: (b: Buffer) => Promise<Buffer | null>
let extractPhotoFromImage: (b: Buffer) => Promise<Buffer | null>
let extractPhotoFromDOCX: (b: Buffer) => Promise<Buffer | null>
let extractPhotoFromDOC: (b: Buffer) => Promise<Buffer | null>

// ─── Configuration ───────────────────────────────────────────────────────
const APPLY = process.argv.includes('--apply')
const DRY_RUN = !APPLY

const CONFIG = {
  DRY_RUN,
  BATCH_SIZE: 50,
  PARALLEL: 5,
  DELAY_BETWEEN_BATCHES: 2000,
  MAX_CANDIDATS: parseInt(process.env.MAX_CANDIDATS || '9999', 10),
  EXTENSIONS_VALIDES: ['pdf', 'jpg', 'jpeg', 'png', 'docx', 'doc'],
  RAPPORT_PATH: path.join(os.homedir(), 'Desktop', 'retro-photo-extraction-report.json'),
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── Types ────────────────────────────────────────────────────────────────
interface Candidat {
  id: string
  nom: string | null
  prenom: string | null
  cv_url: string | null
  cv_nom_fichier: string | null
  photo_url: string | null
}

interface Result {
  id: string
  nom: string
  ext: string
  status: 'success' | 'skip' | 'fail'
  reason?: string
  photo_size_bytes?: number
  duration_ms: number
}

// ─── Stats globales (sauvegardées même si interruption) ──────────────────
const stats = {
  date: new Date().toISOString(),
  config: CONFIG,
  cible_total: 0,
  traites: 0,
  succes: 0,
  echecs: 0,
  skips: 0,
  par_extension: {} as Record<string, { traites: number; succes: number; echecs: number; skips: number }>,
  echecs_details: [] as Array<{ id: string; nom: string; ext: string; raison: string }>,
  duree_totale_ms: 0,
}

// Sauvegarde rapport (utile en cas d'interruption Ctrl+C)
function saveReport() {
  const dir = path.dirname(CONFIG.RAPPORT_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(CONFIG.RAPPORT_PATH, JSON.stringify(stats, null, 2))
}

process.on('SIGINT', () => {
  console.log('\n\n⚠️  Interruption détectée — sauvegarde rapport partiel…')
  saveReport()
  console.log(`Rapport : ${CONFIG.RAPPORT_PATH}`)
  process.exit(130)
})

// ─── Helpers ──────────────────────────────────────────────────────────────
function getExt(filename: string | null): string {
  if (!filename) return ''
  return (filename.split('.').pop() || '').toLowerCase()
}

function bumpStat(ext: string, key: 'traites' | 'succes' | 'echecs' | 'skips') {
  if (!stats.par_extension[ext]) {
    stats.par_extension[ext] = { traites: 0, succes: 0, echecs: 0, skips: 0 }
  }
  stats.par_extension[ext][key]++
  if (key !== 'traites') stats[key]++
  if (key === 'traites') stats.traites++
}

async function downloadCV(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  return Buffer.from(await res.arrayBuffer())
}

async function extractPhoto(buffer: Buffer, ext: string): Promise<Buffer | null> {
  switch (ext) {
    case 'pdf': return await extractPhotoFromPDF(buffer)
    case 'jpg':
    case 'jpeg':
    case 'png': return await extractPhotoFromImage(buffer)
    case 'docx': return await extractPhotoFromDOCX(buffer)
    case 'doc': return await extractPhotoFromDOC(buffer)
    default: return null
  }
}

async function uploadPhoto(buffer: Buffer, candidatId: string, originalFilename: string): Promise<string | null> {
  const photoTs = Date.now()
  const safeName = (originalFilename || 'cv').replace(/[^a-zA-Z0-9._-]/g, '_')
  const photoName = `photos/retro-${photoTs}_${candidatId.slice(0, 8)}_${safeName}.jpg`
  const { data: uploadData, error: uploadErr } = await supabase.storage
    .from('cvs')
    .upload(photoName, buffer, { contentType: 'image/jpeg', upsert: false })
  if (uploadErr || !uploadData?.path) {
    throw new Error(`Storage upload échec : ${uploadErr?.message || 'no path'}`)
  }
  const { data: urlData, error: urlErr } = await supabase.storage
    .from('cvs')
    .createSignedUrl(uploadData.path, 60 * 60 * 24 * 365 * 10) // 10 ans
  if (urlErr || !urlData?.signedUrl) {
    throw new Error(`Signed URL échec : ${urlErr?.message || 'no url'}`)
  }
  return urlData.signedUrl
}

// ─── Pipeline pour un candidat ───────────────────────────────────────────
async function processCandidat(c: Candidat): Promise<Result> {
  const start = Date.now()
  const nomComplet = `${c.prenom || ''} ${c.nom || ''}`.trim() || c.id.slice(0, 8)
  const ext = getExt(c.cv_nom_fichier)

  if (!CONFIG.EXTENSIONS_VALIDES.includes(ext)) {
    return { id: c.id, nom: nomComplet, ext, status: 'fail', reason: `extension non gérée: ${ext}`, duration_ms: Date.now() - start }
  }
  if (!c.cv_url) {
    return { id: c.id, nom: nomComplet, ext, status: 'fail', reason: 'cv_url manquant', duration_ms: Date.now() - start }
  }

  try {
    // 1. Garde-fou — re-vérif photo_url avant traitement (autre process pourrait l'avoir extraite)
    const { data: latest } = await supabase
      .from('candidats')
      .select('photo_url')
      .eq('id', c.id)
      .single()
    if (latest?.photo_url && latest.photo_url !== 'checked') {
      return { id: c.id, nom: nomComplet, ext, status: 'skip', reason: 'photo extraite entre-temps', duration_ms: Date.now() - start }
    }

    // 2. Télécharger CV
    const cvBuffer = await downloadCV(c.cv_url)

    // 3. Extraire photo
    const photoBuffer = await extractPhoto(cvBuffer, ext)
    if (!photoBuffer) {
      return { id: c.id, nom: nomComplet, ext, status: 'fail', reason: 'extraction retournée null (aucune photo détectable)', duration_ms: Date.now() - start }
    }

    // 4. DRY RUN : on s'arrête ici (pas d'upload, pas d'UPDATE)
    if (CONFIG.DRY_RUN) {
      return { id: c.id, nom: nomComplet, ext, status: 'success', reason: '[DRY-RUN] photo aurait été extraite', photo_size_bytes: photoBuffer.length, duration_ms: Date.now() - start }
    }

    // 5. Upload vers Storage
    const photoUrl = await uploadPhoto(photoBuffer, c.id, c.cv_nom_fichier || 'cv')
    if (!photoUrl) {
      return { id: c.id, nom: nomComplet, ext, status: 'fail', reason: 'upload Storage échec', duration_ms: Date.now() - start }
    }

    // 6. Re-vérif photo_url juste avant UPDATE (race condition)
    const { data: latestBeforeUpdate } = await supabase
      .from('candidats')
      .select('photo_url')
      .eq('id', c.id)
      .single()
    if (latestBeforeUpdate?.photo_url && latestBeforeUpdate.photo_url !== 'checked') {
      return { id: c.id, nom: nomComplet, ext, status: 'skip', reason: 'photo extraite entre upload et UPDATE', duration_ms: Date.now() - start }
    }

    // 7. UPDATE candidats
    const { error: updateErr } = await supabase
      .from('candidats')
      .update({ photo_url: photoUrl })
      .eq('id', c.id)
    if (updateErr) {
      return { id: c.id, nom: nomComplet, ext, status: 'fail', reason: `UPDATE échec: ${updateErr.message}`, duration_ms: Date.now() - start }
    }

    return { id: c.id, nom: nomComplet, ext, status: 'success', photo_size_bytes: photoBuffer.length, duration_ms: Date.now() - start }
  } catch (e: any) {
    return { id: c.id, nom: nomComplet, ext, status: 'fail', reason: e.message || String(e), duration_ms: Date.now() - start }
  }
}

// ─── Process batch en parallèle (PARALLEL candidats à la fois) ───────────
async function processBatch(batch: Candidat[]): Promise<Result[]> {
  const results: Result[] = []
  for (let i = 0; i < batch.length; i += CONFIG.PARALLEL) {
    const chunk = batch.slice(i, i + CONFIG.PARALLEL)
    const chunkResults = await Promise.all(chunk.map(processCandidat))
    results.push(...chunkResults)
  }
  return results
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  // Setup pdfjs + load extraction modules (must be done before any extraction call)
  await setupPdfjsWorker()
  const cvPhoto = await import('../../lib/cv-photo')
  extractPhotoFromPDF = cvPhoto.extractPhotoFromPDF
  extractPhotoFromImage = cvPhoto.extractPhotoFromImage
  extractPhotoFromDOCX = cvPhoto.extractPhotoFromDOCX
  extractPhotoFromDOC = cvPhoto.extractPhotoFromDOC

  console.log('═'.repeat(72))
  console.log(`BATCH RÉTROACTIF EXTRACTION PHOTOS ${CONFIG.DRY_RUN ? '(DRY-RUN)' : '(LIVE)'}`)
  console.log('═'.repeat(72))
  console.log(`Mode         : ${CONFIG.DRY_RUN ? '🔵 DRY-RUN (aucune écriture DB/Storage)' : '🔴 LIVE (écritures réelles)'}`)
  console.log(`Batch size   : ${CONFIG.BATCH_SIZE}`)
  console.log(`Parallèle    : ${CONFIG.PARALLEL}`)
  console.log(`Max          : ${CONFIG.MAX_CANDIDATS}`)
  console.log(`Rapport      : ${CONFIG.RAPPORT_PATH}\n`)

  // 1. Récupérer cible
  // ORDER BY created_at ASC : candidats anciens d'abord (avant v1.9.105 / 2026-04-25)
  // → ces candidats n'ont jamais bénéficié de F1bis donc plus grand potentiel d'extraction.
  // Filtre temporaire DRY-RUN : seuls ceux antérieurs au déploiement v1.9.105.
  // Pour le LIVE, retirer le filtre date pour cibler tout le stock.
  const dateLimite = process.env.RETRO_PHOTO_DATE_BEFORE || '2026-04-25'
  console.log(`Récupération de la cible (créés avant ${dateLimite})…`)
  const { data: cible, error: cibleErr } = await supabase
    .from('candidats')
    .select('id, nom, prenom, cv_url, cv_nom_fichier, photo_url')
    .or('photo_url.is.null,photo_url.eq.checked')
    .not('cv_url', 'is', null)
    .lt('created_at', dateLimite)
    .order('created_at', { ascending: true })
    .limit(CONFIG.MAX_CANDIDATS)
  if (cibleErr) throw cibleErr
  const cibleArr = (cible as any[]) as Candidat[]
  stats.cible_total = cibleArr.length
  console.log(`Cible : ${cibleArr.length} candidats avec badge initiales\n`)

  if (cibleArr.length === 0) {
    console.log('Aucun candidat à traiter — sortie.')
    return
  }

  // 2. Parcourir par batches
  const totalBatches = Math.ceil(cibleArr.length / CONFIG.BATCH_SIZE)
  const startTime = Date.now()

  for (let b = 0; b < totalBatches; b++) {
    const batchStart = b * CONFIG.BATCH_SIZE
    const batch = cibleArr.slice(batchStart, batchStart + CONFIG.BATCH_SIZE)
    const batchNum = b + 1

    const elapsedMin = ((Date.now() - startTime) / 60000).toFixed(1)
    const progress = ((batchStart / cibleArr.length) * 100).toFixed(1)
    console.log(`[BATCH ${batchNum}/${totalBatches}] ${progress}% | ${elapsedMin} min écoulés | ${batch.length} candidats`)

    const results = await processBatch(batch)
    for (const r of results) {
      bumpStat(r.ext, 'traites')
      if (r.status === 'success') {
        bumpStat(r.ext, 'succes')
        const sizeKB = r.photo_size_bytes ? `${(r.photo_size_bytes / 1024).toFixed(0)} KB` : ''
        console.log(`  ✅ ${r.nom.padEnd(40)} → photo extraite ${sizeKB} (${r.ext}, ${r.duration_ms}ms)`)
      } else if (r.status === 'skip') {
        bumpStat(r.ext, 'skips')
        console.log(`  ⏭  ${r.nom.padEnd(40)} → ${r.reason}`)
      } else {
        bumpStat(r.ext, 'echecs')
        stats.echecs_details.push({ id: r.id, nom: r.nom, ext: r.ext, raison: r.reason || 'inconnu' })
        console.log(`  ❌ ${r.nom.padEnd(40)} → ${r.reason}`)
      }
    }

    // Sauvegarde rapport intermédiaire après chaque batch
    saveReport()

    // Pause entre batches (sauf dernier)
    if (b < totalBatches - 1) {
      await new Promise((r) => setTimeout(r, CONFIG.DELAY_BETWEEN_BATCHES))
    }
  }

  stats.duree_totale_ms = Date.now() - startTime
  saveReport()

  // 3. Synthèse
  console.log('\n' + '═'.repeat(72))
  console.log('RÉSUMÉ FINAL')
  console.log('═'.repeat(72))
  console.log(`Mode             : ${CONFIG.DRY_RUN ? 'DRY-RUN' : 'LIVE'}`)
  console.log(`Cible            : ${stats.cible_total}`)
  console.log(`Traités          : ${stats.traites}`)
  console.log(`✅ Succès         : ${stats.succes} (${(100 * stats.succes / Math.max(1, stats.traites)).toFixed(1)}%)`)
  console.log(`❌ Échecs         : ${stats.echecs}`)
  console.log(`⏭  Skips          : ${stats.skips}`)
  console.log(`Durée totale     : ${(stats.duree_totale_ms / 60000).toFixed(1)} min`)
  console.log('\nPar extension :')
  for (const [ext, s] of Object.entries(stats.par_extension)) {
    const tx = s.traites > 0 ? ((s.succes / s.traites) * 100).toFixed(0) : '0'
    console.log(`  ${ext.padEnd(6)} : ${s.succes}/${s.traites} succès (${tx}%) | ${s.echecs} échecs | ${s.skips} skips`)
  }
  console.log(`\nRapport JSON : ${CONFIG.RAPPORT_PATH}`)
}

main().catch((err) => {
  console.error('\n❌ Erreur fatale :', err)
  saveReport()
  process.exit(1)
})
