// DRY-RUN batch parsing — teste tous les fichiers d'un dossier
// Pipeline identique à /api/cv/parse mais sans aucune écriture DB ni storage.
//
// Usage : set -a; source .env.local; set +a; npx tsx scripts/test-parsing-batch.ts

import fs from 'node:fs'
import path from 'node:path'
import { extractTextFromCV } from '../../lib/cv-parser'
import { analyserCV, analyserCVDepuisPDF, analyserCVDepuisImage } from '../../lib/claude'
import { classifyDocument } from '../../lib/document-classification'

const FOLDER = '/Users/joaobarbosa/Desktop/talentflow-test-fixtures/'

// Ordre aligné sur la route /api/cv/parse :
// 1. extractTextFromCV (pdfjs-dist pour PDF, mammoth pour DOCX, word-extractor pour DOC)
// 2. Si PDF avec texte vide/court (<30 chars) → analyserCVDepuisPDF (Vision Claude)
// 3. Si image → analyserCVDepuisImage (Vision Claude)
// 4. Sinon → analyserCV sur le texte extrait
async function parseFile(filePath: string, filename: string) {
  const ext = path.extname(filename).toLowerCase().replace('.', '')
  const buffer = fs.readFileSync(filePath)
  const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
  const isPDF = ext === 'pdf'

  let texteCV = ''
  let pipeline = ''
  let extractionError: string | null = null

  try {
    if (isImage) {
      // Images : pas d'extraction texte → Vision directement
      pipeline = 'vision-image'
    } else {
      texteCV = await extractTextFromCV(buffer, filename)
      pipeline = 'text-native'
    }
  } catch (e: any) {
    extractionError = e.message
  }

  // Analyse IA — router selon qualité du texte extrait
  let analyse: any = null
  let analyseError: string | null = null

  try {
    if (isImage) {
      analyse = await analyserCVDepuisImage(buffer, `image/${ext === 'jpg' ? 'jpeg' : ext}`)
      pipeline = 'vision-image'
    } else if (isPDF && texteCV.trim().length < 30) {
      // PDF scanné → Vision Claude
      analyse = await analyserCVDepuisPDF(buffer)
      pipeline = 'vision-pdf'
    } else if (texteCV.trim().length >= 30) {
      analyse = await analyserCV(texteCV)
      pipeline = isPDF ? 'text-pdf' : ext === 'docx' ? 'text-docx' : ext === 'doc' ? 'text-doc' : `text-${ext}`
    } else {
      analyseError = `Texte extrait trop court (${texteCV.length} chars) et format non-image`
    }
  } catch (e: any) {
    analyseError = e.message
  }

  // Classification
  let classif: any = null
  if (analyse) {
    try {
      classif = classifyDocument({ analyse, texteCV })
    } catch (e: any) {
      analyseError = (analyseError || '') + ` | classify: ${e.message}`
    }
  }

  return {
    filename,
    ext,
    size: buffer.length,
    pipeline,
    texteLen: texteCV.length,
    extractionError,
    analyseError,
    analyse,
    classif,
  }
}

// Normalisation pour comparaison nom fichier vs nom extrait
function norm(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Tokenise le nom de fichier pour en extraire les mots de nom probables
function filenameTokens(filename: string): string[] {
  const base = filename.replace(/\.[^.]+$/, '') // retire extension
  // retire les patterns dates (15.03.2024), numéros, mots-clés
  const cleaned = base
    .replace(/\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}/g, ' ')
    .replace(/\d{4,}/g, ' ')
    .replace(/\b(cv|curriculum|vitae|manutentionnaire|electricite|electricien|industriel|aide|en|attente|ok|a|100|ouvriere|usine|lettre|motivation|certificat|attestation|scanne|scanned|oblique|image|whatsapp|image|file|document)\b/gi, ' ')
  return norm(cleaned).split(/\s+/).filter(w => w.length >= 3)
}

// Diagnostic automatique : cohérence extraction vs fichier
function diagnose(r: any): { level: '✅' | '⚠️' | '❌'; issues: string[] } {
  const issues: string[] = []
  if (r.extractionError && !['jpg','jpeg','png','webp'].includes(r.ext)) {
    issues.push(`extraction échouée : ${r.extractionError}`)
  }
  if (r.analyseError) {
    issues.push(`analyse IA : ${r.analyseError}`)
  }
  if (!r.analyse) {
    return { level: '❌', issues: issues.length ? issues : ['aucune analyse IA produite'] }
  }

  const { analyse, classif } = r
  const nom = (analyse.nom || '').trim()
  const prenom = (analyse.prenom || '').trim()

  // 1. Nom extrait vs nom fichier
  const fileTokens = filenameTokens(r.filename)
  const extractedTokens = norm(`${nom} ${prenom}`).split(/\s+/).filter(w => w.length >= 3)
  if (fileTokens.length > 0) {
    const missed = fileTokens.filter(t => !extractedTokens.some(et => et.includes(t) || t.includes(et)))
    if (missed.length > 0 && classif?.isNotCV === false) {
      // Peut-être un nom composé tronqué ?
      // Si le fichier a 2+ tokens nom et l'extrait n'en a qu'1 → signaler
      if (fileTokens.length >= 2 && extractedTokens.filter(t => t.length >= 3).length < fileTokens.length) {
        issues.push(`nom possiblement tronqué — fichier suggère [${fileTokens.join(' ')}], extrait = "${prenom} ${nom}"`)
      }
    }
  }

  // 2. CV sans données critiques
  if (classif?.isNotCV === false) {
    if (!nom) issues.push('CV sans nom extrait')
    if (!prenom) issues.push('CV sans prénom extrait')
    const nbExp = Array.isArray(analyse.experiences) ? analyse.experiences.length : 0
    const nbComp = Array.isArray(analyse.competences) ? analyse.competences.length : 0
    if (nbExp === 0 && nbComp < 2) {
      issues.push(`CV sans expériences (${nbExp}) ni compétences (${nbComp}) — probablement OCR raté ou document peu rempli`)
    }
    if (!analyse.email && !analyse.telephone) {
      issues.push('CV sans email ni téléphone — pas de moyen de contact')
    }
  }

  // 3. Email vide sur document avec texte conséquent
  if (r.texteLen > 500 && classif?.isNotCV === false && !analyse.email) {
    // pas systématiquement bug mais à noter
  }

  // 4. Texte extrait anormalement court
  if (r.texteLen > 0 && r.texteLen < 200 && !['jpg','jpeg','png','webp'].includes(r.ext) && r.pipeline.startsWith('text-')) {
    issues.push(`texte natif extrait très court (${r.texteLen} chars) — document scanné mal reconnu`)
  }

  if (issues.length === 0) return { level: '✅', issues: [] }
  // issue sévère = ❌ sinon ⚠️
  const severe = issues.some(i => i.includes('aucune') || i.includes('échouée'))
  return { level: severe ? '❌' : '⚠️', issues }
}

async function main() {
  const files = fs.readdirSync(FOLDER)
    .filter(f => !f.startsWith('.'))
    .map(f => ({ path: path.join(FOLDER, f), name: f }))

  console.log(`\n━━━ DRY-RUN batch parsing — ${files.length} fichiers ━━━\n`)
  const results: any[] = []

  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    process.stdout.write(`[${i + 1}/${files.length}] ${f.name.slice(0, 60)} ... `)
    const r = await parseFile(f.path, f.name)
    const d = diagnose(r)
    ;(r as any).diagnostic = d
    results.push(r)
    console.log(`${d.level} (${r.pipeline})`)
  }

  // ── Table récapitulative ─────────────────────────────────────────────────
  console.log('\n━━━ RAPPORT RÉCAPITULATIF ━━━\n')
  for (const r of results) {
    const d = (r as any).diagnostic
    const a = r.analyse || {}
    const c = r.classif || {}
    console.log(`${d.level} ${r.filename}`)
    console.log(`   pipeline  : ${r.pipeline} · texte extrait ${r.texteLen} chars · taille ${(r.size/1024).toFixed(0)} KB`)
    if (r.analyse) {
      console.log(`   classé    : ${c.isNotCV ? 'NON-CV' : 'CV'} [${c.docType} via ${c.reason}]`)
      console.log(`   identité  : prenom="${a.prenom || ''}" nom="${a.nom || ''}" email="${a.email || ''}" tel="${a.telephone || ''}"`)
      console.log(`   données   : ${(a.experiences||[]).length} exp · ${(a.competences||[]).length} comp · ${(a.formations_details||[]).length} form · titre="${a.titre_poste || ''}"`)
    }
    if (d.issues.length > 0) {
      for (const iss of d.issues) console.log(`   ⚠ ${iss}`)
    }
    console.log()
  }

  // ── Synthèse ──────────────────────────────────────────────────────────────
  const ok = results.filter(r => (r as any).diagnostic.level === '✅').length
  const warn = results.filter(r => (r as any).diagnostic.level === '⚠️').length
  const fail = results.filter(r => (r as any).diagnostic.level === '❌').length
  console.log('━'.repeat(60))
  console.log(`✅ OK : ${ok}   ⚠️ Problème : ${warn}   ❌ Échec : ${fail}   (total ${results.length})`)
  console.log('━'.repeat(60))

  // Dump JSON (non lu par défaut mais utile si besoin)
  fs.writeFileSync(
    path.join(path.dirname(FOLDER.replace(/\/$/, '')), 'talentflow-tests-report.json'),
    JSON.stringify(results, null, 2)
  )
  console.log(`\nDump complet : ~/Desktop/talentflow-tests-report.json`)
}

main().catch(err => { console.error('\n❌ FATAL:', err); process.exit(1) })
