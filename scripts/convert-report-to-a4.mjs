// Script one-shot v2.3.x — Convertit le PDF source du template "Rapport d'heures"
// du format custom 607×431pt vers A4 portrait standard 595×842pt.
//
// Usage : node --env-file=.env.local scripts/convert-report-to-a4.mjs
//
// Étapes :
//   1. Download PDF original depuis bucket talentflow-sign
//   2. Charge avec pdf-lib + récupère taille réelle
//   3. Crée un nouveau PDF A4 portrait (595×842)
//   4. Embed la page originale + draw centré en haut (scale-fit-width avec marge)
//   5. Re-upload au même path (upsert: true) pour remplacer l'ancien
//
// Effet : le storage_path reste le même → le template DB n'a pas besoin d'update.
// Les fields existants devront être REPOSITIONNÉS dans l'éditeur car les coords
// normalisées (0-1) ne pointent plus au même endroit.

import { PDFDocument } from 'pdf-lib'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const STORAGE_PATH = 'templates/draft/1778145746490_rapport_heures.pdf'
const BUCKET = 'talentflow-sign'
const A4_W = 595
const A4_H = 842

console.log('=== Conversion PDF rapport vers A4 portrait ===')
console.log('Bucket:', BUCKET)
console.log('Path:', STORAGE_PATH)
console.log('')

// 1. Download PDF original
console.log('1. Download PDF original...')
const { data: blob, error: dlErr } = await supabase.storage
  .from(BUCKET)
  .download(STORAGE_PATH)
if (dlErr || !blob) {
  console.error('❌ Download failed:', dlErr?.message)
  process.exit(1)
}
const originalBytes = await blob.arrayBuffer()
console.log(`   ✅ ${originalBytes.byteLength} bytes téléchargés`)

// 2. Charger PDF original
console.log('')
console.log('2. Charge PDF original...')
const originalPdf = await PDFDocument.load(originalBytes)
const originalPages = originalPdf.getPages()
console.log(`   Nombre de pages: ${originalPages.length}`)
const [originalPage] = originalPages
const { width: origW, height: origH } = originalPage.getSize()
console.log(`   Original size: ${origW.toFixed(1)} × ${origH.toFixed(1)} pt`)
console.log(`   Ratio: ${(origW / origH).toFixed(3)}`)
console.log(`   Orientation: ${origW > origH ? 'paysage' : 'portrait'}`)

// 3. Créer nouveau PDF A4 portrait
console.log('')
console.log('3. Crée nouveau PDF A4 portrait...')
const newPdf = await PDFDocument.create()
console.log(`   Cible: ${A4_W} × ${A4_H} pt (A4 portrait)`)

// 4. Embed la page originale (pour pouvoir la dessiner avec scale)
console.log('')
console.log('4. Embed la page originale...')
const embeddedPage = await newPdf.embedPage(originalPage)
console.log('   ✅ Page embedée')

// 5. Calculer scale pour fit dans A4 portrait avec marge 20pt
// Le rapport est paysage (607×431) → on scale-to-fit-width et on centre verticalement
//   en plaçant le rapport en haut de la page A4 (avec une marge de 20pt en haut).
const scale = Math.min(A4_W / origW, A4_H / origH) * 0.95
const scaledW = origW * scale
const scaledH = origH * scale
const xOffset = (A4_W - scaledW) / 2
const yOffset = A4_H - scaledH - 20  // 20pt de marge en haut

console.log('')
console.log('5. Calcul du placement...')
console.log(`   Scale: ${scale.toFixed(4)}`)
console.log(`   Scaled size: ${scaledW.toFixed(1)} × ${scaledH.toFixed(1)} pt`)
console.log(`   xOffset: ${xOffset.toFixed(1)} (centré horizontalement)`)
console.log(`   yOffset: ${yOffset.toFixed(1)} (depuis le bas — donc en haut de la page)`)

// 6. Créer page A4 et dessiner le rapport dedans
console.log('')
console.log('6. Crée page A4 + draw page embedée...')
const newPage = newPdf.addPage([A4_W, A4_H])
newPage.drawPage(embeddedPage, {
  x: xOffset,
  y: yOffset,
  width: scaledW,
  height: scaledH,
})
console.log('   ✅ Page dessinée')

// 7. Sauvegarder
console.log('')
console.log('7. Sauvegarde du nouveau PDF...')
const newBytes = await newPdf.save()
console.log(`   ✅ ${newBytes.byteLength} bytes générés`)

// 8. Re-uploader au même path (replace l'ancien)
console.log('')
console.log('8. Upload au même path (upsert)...')
const { error: upErr } = await supabase.storage
  .from(BUCKET)
  .upload(STORAGE_PATH, new Blob([newBytes], { type: 'application/pdf' }), {
    upsert: true,
    contentType: 'application/pdf',
  })

if (upErr) {
  console.error('❌ Upload failed:', upErr.message)
  process.exit(1)
}

console.log('')
console.log('=== ✅ TERMINÉ ===')
console.log('PDF converti :')
console.log(`  Avant : ${origW.toFixed(0)} × ${origH.toFixed(0)} pt (${originalBytes.byteLength} B)`)
console.log(`  Après : ${A4_W} × ${A4_H} pt (${newBytes.byteLength} B)`)
console.log('')
console.log('⚠️ IMPORTANT — Étape suivante manuelle :')
console.log('   Ouvrir https://talent-flow.ch/sign/templates/289b3bc0-df1d-423b-a771-a6c02f6c0303/edit')
console.log('   Repositionner les fields (les coords ne pointent plus au bon endroit).')
console.log('   Élargir les zones signature à minimum 200×80 pt.')
