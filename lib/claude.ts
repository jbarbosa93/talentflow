// src/lib/claude.ts
// Wrapper IA — analyse CV et scoring matching
// Utilise Groq (gratuit : 14 400 req/jour, modèles LLaMA 3.3 70B + vision)

import Groq from 'groq-sdk'

// Singleton client
let groqClient: Groq | null = null

function getClient(): Groq {
  if (!groqClient) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY manquant — obtenir une clé gratuite sur https://console.groq.com')
    }
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY })
  }
  return groqClient
}

// ─── Retry avec backoff pour les rate limits Groq (429) ─────────────────────

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      const status = err?.status || err?.statusCode || err?.error?.code
      const isRateLimit = status === 429 || err?.message?.includes('rate_limit')
      if (!isRateLimit || attempt === maxRetries) throw err

      // Extraire le délai suggéré par Groq ou utiliser un backoff exponentiel
      const retryAfterMatch = err?.message?.match(/try again in (\d+(?:\.\d+)?)(?:ms|s)/)
      let waitMs = 2000 * (attempt + 1) // backoff : 2s, 4s, 6s
      if (retryAfterMatch) {
        const val = parseFloat(retryAfterMatch[1])
        waitMs = err.message.includes('ms') ? Math.ceil(val) + 500 : Math.ceil(val * 1000) + 500
      }
      console.log(`[Groq] Rate limit — retry ${attempt + 1}/${maxRetries} dans ${waitMs}ms...`)
      await new Promise(r => setTimeout(r, waitMs))
    }
  }
  throw new Error('Unreachable')
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CVExperience {
  poste: string
  entreprise: string
  periode: string      // ex: "2020 - 2023" ou "Jan 2020 - présent"
  description: string
}

export interface CVFormationDetail {
  diplome: string
  etablissement: string
  annee: string        // ex: "2019" ou "2015 - 2019"
}

export interface CVAnalyse {
  nom: string
  prenom: string
  email: string
  telephone: string
  localisation: string
  titre_poste: string
  annees_exp: number
  competences: string[]
  formation: string
  resume: string
  langues: string[]
  linkedin: string
  permis_conduire: boolean
  date_naissance: string  // format "DD/MM/YYYY" ou "" si absent
  experiences: CVExperience[]
  formations_details: CVFormationDetail[]
}

export interface MatchingResult {
  score: number              // 0-100
  score_competences: number  // 0-100
  score_experience: number   // 0-100
  competences_matchees: string[]
  competences_manquantes: string[]
  explication: string
  recommandation: 'fort' | 'moyen' | 'faible'
}

// ─── Analyse de CV ──────────────────────────────────────────────────────────

const CV_JSON_PROMPT = `Tu es un assistant RH expert. Analyse ce CV et extrais les informations en JSON.

Retourne UNIQUEMENT un JSON valide avec cette structure exacte (sans markdown, sans backticks) :
{
  "nom": "Nom de famille",
  "prenom": "Prénom",
  "email": "email@exemple.com",
  "telephone": "+33 6 XX XX XX XX",
  "localisation": "Ville, Pays",
  "titre_poste": "Titre du poste principal",
  "annees_exp": 5,
  "competences": ["Compétence1", "Compétence2", "Compétence3"],
  "formation": "Diplôme le plus élevé, École",
  "resume": "Résumé professionnel en 2-3 phrases.",
  "langues": ["Français", "Anglais"],
  "linkedin": "https://linkedin.com/in/... ou chaîne vide",
  "permis_conduire": false,
  "date_naissance": "15/03/1990",
  "experiences": [
    {
      "poste": "Développeur Senior",
      "entreprise": "Nom de l'entreprise",
      "periode": "Jan 2020 - Mars 2023",
      "description": "Brève description des missions (1-2 phrases max)"
    }
  ],
  "formations_details": [
    {
      "diplome": "Master Informatique",
      "etablissement": "Nom de l'école / université",
      "annee": "2019"
    }
  ]
}

Règles :
- annees_exp : entier estimé (0 si non déterminable)
- competences : maximum 15, technologies/outils/méthodes clés uniquement
- langues : toutes les langues mentionnées dans le CV
- permis_conduire : true si le CV mentionne le permis B ou permis de conduire, sinon false
- date_naissance : format DD/MM/YYYY si la date exacte est dans le CV. Si seulement l'âge est mentionné (ex : "41 ans", "38 ans", "né en 1983", "age: 35"), calculer l'année approximative et retourner "01/01/AAAA" (ex : "41 ans" en 2026 → "01/01/1985"). Si ni date ni âge mentionné nulle part, retourner ""
- experiences : toutes les expériences professionnelles dans l'ordre chronologique inverse (plus récente en premier)
- formations_details : toutes les formations/diplômes dans l'ordre chronologique inverse
- Si une info est absente, utiliser une chaîne vide "" (ou false pour les booléens, [] pour les tableaux)
- Ne rien inventer, extraire uniquement ce qui est dans le CV`

function parseCV(text: string): CVAnalyse {
  let cleaned = text.replace(/```json|```/g, '').trim()

  // Tenter le parse direct
  let result: any
  try {
    result = JSON.parse(cleaned)
  } catch {
    // JSON tronqué → fermer les tableaux/objets ouverts et réessayer
    // Compter les { et [ non fermés
    let braces = 0, brackets = 0
    let inString = false, escape = false
    for (const ch of cleaned) {
      if (escape) { escape = false; continue }
      if (ch === '\\' && inString) { escape = true; continue }
      if (ch === '"') { inString = !inString; continue }
      if (inString) continue
      if (ch === '{') braces++
      else if (ch === '}') braces--
      else if (ch === '[') brackets++
      else if (ch === ']') brackets--
    }
    // Supprimer la dernière valeur incomplète (après la dernière virgule)
    cleaned = cleaned.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"}\]]*$/, '')
    // Fermer les structures ouvertes
    cleaned += ']'.repeat(Math.max(0, brackets)) + '}'.repeat(Math.max(0, braces))
    try {
      result = JSON.parse(cleaned)
    } catch {
      throw new Error(`JSON invalide même après réparation : ${text.slice(0, 200)}`)
    }
  }

  if (!result.nom && !result.prenom) result.nom = 'Candidat'
  if (!Array.isArray(result.competences)) result.competences = []
  if (!Array.isArray(result.langues)) result.langues = []
  if (typeof result.permis_conduire !== 'boolean') result.permis_conduire = false
  if (!result.linkedin) result.linkedin = ''
  if (!result.date_naissance) result.date_naissance = ''
  if (!Array.isArray(result.experiences)) result.experiences = []
  if (!Array.isArray(result.formations_details)) result.formations_details = []
  return result as CVAnalyse
}

// ─── Analyse depuis un PDF scanné ──────────────────────────────────────────
// Convertit les pages PDF en images PNG via mupdf (WASM pur, compatible Vercel)
// puis envoie chaque page au modèle vision Groq pour extraction

async function renderPDFPagesToImages(pdfBuffer: Buffer, maxPages: number): Promise<Buffer[]> {
  const mupdf = await import('mupdf')
  const doc = mupdf.Document.openDocument(pdfBuffer, 'application/pdf')
  const pageCount = Math.min(doc.countPages(), maxPages)
  const images: Buffer[] = []

  // Groq limite ~4MB par requête — JPEG 75% + scale 1x (rapide sur Vercel serverless)
  for (let i = 0; i < pageCount; i++) {
    const page = doc.loadPage(i)

    const pixmap = page.toPixmap(
      mupdf.Matrix.scale(1, 1), // 72 DPI — suffisant pour vision IA, rapide à rendre
      mupdf.ColorSpace.DeviceRGB,
      false,
      true
    )
    const jpegBytes = pixmap.asJPEG(75)
    const imgBuffer = Buffer.from(jpegBytes)
    pixmap.destroy()

    images.push(imgBuffer!)
    page.destroy()
  }

  doc.destroy()
  return images
}

export async function analyserCVDepuisPDF(pdfBuffer: Buffer): Promise<CVAnalyse> {
  // Convertir les pages en images JPEG
  const images = await renderPDFPagesToImages(pdfBuffer, 5)
  const totalPages = images.length

  console.log(`[CV Scan] PDF scanné : ${totalPages} pages converties en JPEG`)

  if (totalPages === 1) {
    console.log(`[CV Scan] Page 1 : ${(images[0].length / 1024).toFixed(0)} KB PNG`)
    return analyserCVDepuisImage(images[0], 'image/jpeg')
  }

  // Plusieurs pages → analyser chaque page puis fusionner les résultats
  const analyses: CVAnalyse[] = []
  for (let i = 0; i < totalPages; i++) {
    console.log(`[CV Scan] Analyse page ${i + 1}/${totalPages} (${(images[i].length / 1024).toFixed(0)} KB)...`)
    try {
      const pageAnalyse = await analyserCVDepuisImage(images[i], 'image/jpeg')
      analyses.push(pageAnalyse)
    } catch (err) {
      console.warn(`[CV Scan] Échec page ${i + 1}:`, err)
    }
  }

  if (analyses.length === 0) {
    throw new Error('Impossible de lire ce PDF scanné — aucune page n\'a pu être analysée')
  }

  // Fusionner : prendre les infos de base de la page 1, combiner expériences/compétences de toutes les pages
  const merged = { ...analyses[0] }
  for (let i = 1; i < analyses.length; i++) {
    const a = analyses[i]
    // Compléter les champs vides avec les pages suivantes
    if (!merged.nom && a.nom) merged.nom = a.nom
    if (!merged.prenom && a.prenom) merged.prenom = a.prenom
    if (!merged.email && a.email) merged.email = a.email
    if (!merged.telephone && a.telephone) merged.telephone = a.telephone
    if (!merged.localisation && a.localisation) merged.localisation = a.localisation
    if (!merged.titre_poste && a.titre_poste) merged.titre_poste = a.titre_poste
    if (!merged.formation && a.formation) merged.formation = a.formation
    if (!merged.linkedin && a.linkedin) merged.linkedin = a.linkedin
    if (!merged.date_naissance && a.date_naissance) merged.date_naissance = a.date_naissance
    if (a.annees_exp > merged.annees_exp) merged.annees_exp = a.annees_exp

    // Fusionner tableaux (sans doublons)
    const existingComps = new Set(merged.competences.map(c => c.toLowerCase()))
    for (const comp of a.competences) {
      if (!existingComps.has(comp.toLowerCase())) {
        merged.competences.push(comp)
        existingComps.add(comp.toLowerCase())
      }
    }

    const existingLangues = new Set(merged.langues.map(l => l.toLowerCase()))
    for (const lang of a.langues) {
      if (!existingLangues.has(lang.toLowerCase())) {
        merged.langues.push(lang)
        existingLangues.add(lang.toLowerCase())
      }
    }

    // Ajouter expériences et formations des pages suivantes
    if (a.experiences?.length) merged.experiences.push(...a.experiences)
    if (a.formations_details?.length) merged.formations_details.push(...a.formations_details)

    if (!merged.permis_conduire && a.permis_conduire) merged.permis_conduire = true
  }

  return merged
}

export async function analyserCV(texteCV: string): Promise<CVAnalyse> {
  const client = getClient()

  const prompt = `Tu es un assistant RH expert. Analyse ce CV et extrais les informations en JSON.\n\nCV à analyser :\n<cv>\n${texteCV.slice(0, 8000)}\n</cv>\n\n${CV_JSON_PROMPT}`

  const completion = await withRetry(() => client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 2048,
  }))

  const text = completion.choices[0]?.message?.content || ''

  try {
    return parseCV(text)
  } catch {
    throw new Error(`Groq a retourné un JSON invalide : ${text.slice(0, 200)}`)
  }
}

// ─── Analyse depuis une image (JPG, JPEG, PNG) ──────────────────────────────

export async function analyserCVDepuisImage(
  imageBuffer: Buffer,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
): Promise<CVAnalyse> {
  const client = getClient()
  const base64 = imageBuffer.toString('base64')

  const completion = await withRetry(() => client.chat.completions.create({
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${base64}` },
        },
        {
          type: 'text',
          text: CV_JSON_PROMPT,
        },
      ],
    }],
    temperature: 0.1,
    max_tokens: 4096,
  }))

  const text = completion.choices[0]?.message?.content || ''

  try {
    return parseCV(text)
  } catch {
    throw new Error(`Groq a retourné un JSON invalide (image) : ${text.slice(0, 200)}`)
  }
}

// ─── Matching candidat ↔ offre ──────────────────────────────────────────────

export async function calculerScoreMatching(
  candidat: {
    competences: string[]
    annees_exp: number
    titre_poste: string | null
    resume_ia: string | null
  },
  offre: {
    titre: string
    competences: string[]
    exp_requise: number
    description: string | null
  }
): Promise<MatchingResult> {
  const client = getClient()

  const prompt = `Tu es un expert en recrutement. Évalue la compatibilité entre ce candidat et cette offre.

CANDIDAT :
- Titre : ${candidat.titre_poste || 'Non renseigné'}
- Expérience : ${candidat.annees_exp} ans
- Compétences : ${candidat.competences.join(', ')}
- Résumé : ${candidat.resume_ia || 'Non disponible'}

OFFRE :
- Titre : ${offre.titre}
- Expérience requise : ${offre.exp_requise} ans minimum
- Compétences requises : ${offre.competences.join(', ')}
- Description : ${(offre.description || '').slice(0, 500)}

Retourne UNIQUEMENT ce JSON (sans markdown) :
{
  "score": 78,
  "score_competences": 80,
  "score_experience": 75,
  "competences_matchees": ["React", "TypeScript"],
  "competences_manquantes": ["GraphQL"],
  "explication": "Explication courte en 1-2 phrases.",
  "recommandation": "fort"
}

Règles de scoring :
- score_competences : % de compétences requises que le candidat possède (0-100)
- score_experience : 100 si exp >= requise, sinon (exp/requise)*100, max 100
- score : moyenne pondérée (60% compétences + 40% expérience)
- recommandation : "fort" si score >= 75, "moyen" si 50-74, "faible" si < 50`

  try {
    const completion = await withRetry(() => client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 512,
    }))
    const text = (completion.choices[0]?.message?.content || '').replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(text) as MatchingResult
    parsed.score = Math.min(100, Math.max(0, Math.round(parsed.score)))
    return parsed
  } catch {
    // Fallback : calcul algorithmique si Groq échoue
    return calculerScoreAlgorithmique(candidat, offre)
  }
}

// ─── Fallback algorithmique (sans IA) ──────────────────────────────────────

function calculerScoreAlgorithmique(
  candidat: { competences: string[]; annees_exp: number },
  offre: { competences: string[]; exp_requise: number }
): MatchingResult {
  const candComps = candidat.competences.map(c => c.toLowerCase())
  const offreComps = offre.competences.map(c => c.toLowerCase())

  const matchees = offreComps.filter(oc =>
    candComps.some(cc => cc.includes(oc) || oc.includes(cc))
  )

  const manquantes = offreComps.filter(oc =>
    !candComps.some(cc => cc.includes(oc) || oc.includes(cc))
  )

  const scoreComp = Math.round((matchees.length / Math.max(offreComps.length, 1)) * 100)
  const scoreExp = Math.min(100, Math.round((candidat.annees_exp / Math.max(offre.exp_requise, 1)) * 100))
  const score = Math.round(scoreComp * 0.6 + scoreExp * 0.4)

  return {
    score,
    score_competences: scoreComp,
    score_experience: scoreExp,
    competences_matchees: matchees,
    competences_manquantes: manquantes,
    explication: `${matchees.length}/${offreComps.length} compétences correspondantes, ${candidat.annees_exp} ans d'expérience.`,
    recommandation: score >= 75 ? 'fort' : score >= 50 ? 'moyen' : 'faible',
  }
}
