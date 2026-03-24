// src/lib/claude.ts
// Wrapper IA — analyse CV et scoring matching
// Utilise Claude Haiku 4.5 (Anthropic) — rapide, précis, ~$0.008/CV

import Anthropic from '@anthropic-ai/sdk'

// Singleton client
let anthropicClient: Anthropic | null = null

function getClient(): Anthropic {
  if (!anthropicClient) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY manquant — ajouter la clé dans les variables d\'environnement')
    }
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return anthropicClient
}

// ─── Retry avec backoff pour les erreurs transitoires ────────────────────────

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      const status = err?.status || err?.statusCode || 0
      const isRetryable = status === 429 || status === 529 || status >= 500

      if (!isRetryable || attempt === maxRetries) throw err

      const waitMs = Math.min(2000 * (attempt + 1), 8000)
      console.log(`[Claude] Erreur ${status} — retry ${attempt + 1}/${maxRetries} dans ${waitMs}ms...`)
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
  document_type: 'cv' | 'certificat' | 'diplome' | 'lettre_motivation' | 'formation' | 'permis' | 'attestation' | 'autre'
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

// ─── Prompt commun ──────────────────────────────────────────────────────────

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
  ],
  "document_type": "cv"
}

Règles :
- annees_exp : entier estimé (0 si non déterminable)
- competences : maximum 15, technologies/outils/méthodes clés uniquement
- langues : toutes les langues mentionnées dans le CV
- permis_conduire : true si le CV mentionne le permis B ou permis de conduire, sinon false
- date_naissance : 4 cas selon ce qui est dans le CV : (1) date exacte → "15/03/1985" format DD/MM/YYYY ; (2) année de naissance seulement → "1983" ; (3) âge actuel de la PERSONNE uniquement (ex: "41 ans", "âge : 35", "a 35 ans") → retourner le chiffre seul ex: "41" ou "35" ; (4) aucune info → "". ATTENTION CRITIQUE : "X ans d'expérience", "X années d'expérience professionnelle" = durée de carrière, JAMAIS l'âge de la personne → ne pas utiliser pour date_naissance
- experiences : toutes les expériences professionnelles dans l'ordre chronologique inverse (plus récente en premier)
- formations_details : toutes les formations/diplômes dans l'ordre chronologique inverse
- Si une info est absente, utiliser une chaîne vide "" (ou false pour les booléens, [] pour les tableaux)
- document_type : Identifier le type de document. "cv" si c'est un curriculum vitae ou un résumé professionnel. "certificat" pour certificats de travail. "diplome" pour diplômes. "lettre_motivation" pour lettres de motivation. "formation" pour attestations de formation. "permis" pour permis de travail/séjour. "attestation" pour attestations diverses. "autre" si le type ne correspond à aucune catégorie. Un CV contient typiquement : données personnelles, expériences professionnelles, formations, compétences. Si le document est clairement PAS un CV (ex: attestation, certificat), le classifier correctement.
- Ne rien inventer, extraire uniquement ce qui est dans le CV`

// ─── Parser JSON robuste ─────────────────────────────────────────────────────

function parseCV(text: string): CVAnalyse {
  // Nettoyage agressif des backticks markdown (toutes variantes)
  let cleaned = text
    .replace(/^[\s\S]*?```(?:json|JSON)?\s*/m, '')  // Tout avant et incluant ```json
    .replace(/```\s*$/m, '')                          // ``` final
    .replace(/```json|```JSON|```/g, '')              // Résidus
    .trim()

  // Extraire le JSON entre le premier { et le dernier }
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1)
  }

  let result: any
  try {
    result = JSON.parse(cleaned)
  } catch {
    // JSON tronqué → fermer les structures ouvertes
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
    cleaned = cleaned.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"}\]]*$/, '')
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
  result.document_type = result.document_type || 'cv'
  return result as CVAnalyse
}

// ─── Limiter PDF aux N premières pages + normaliser les rotations ─────────────
// Un CV tient sur les premières pages — et on corrige les scans à l'envers (180°, 90°, 270°)

async function limitPDFPages(buffer: Buffer, maxPages = 5): Promise<Buffer> {
  try {
    const { PDFDocument, degrees } = await import('pdf-lib')
    const srcDoc = await PDFDocument.load(buffer, { ignoreEncryption: true })
    const totalPages = srcDoc.getPageCount()
    const pagesCount = Math.min(totalPages, maxPages)

    // Vérifier si des pages ont une rotation non nulle
    let hasRotation = false
    for (let i = 0; i < pagesCount; i++) {
      if (srcDoc.getPage(i).getRotation().angle !== 0) { hasRotation = true; break }
    }

    // Si pas de troncature ET pas de rotation → retour direct (optimisation)
    if (totalPages <= maxPages && !hasRotation) return buffer

    const newDoc = await PDFDocument.create()

    for (let i = 0; i < pagesCount; i++) {
      const srcPage = srcDoc.getPage(i)
      const angle = srcPage.getRotation().angle  // 0, 90, 180 ou 270

      if (angle === 0) {
        // Pas de rotation → copie directe
        const [copied] = await newDoc.copyPages(srcDoc, [i])
        newDoc.addPage(copied)
      } else {
        // Rotation détectée → on "bake in" la correction pour que Claude voie le bon sens
        const { width: w, height: h } = srcPage.getSize()
        const embedded = await newDoc.embedPage(srcPage)

        // Dimensions de la nouvelle page (swap si 90° / 270°)
        const [nw, nh] = (angle === 90 || angle === 270) ? [h, w] : [w, h]
        const page = newDoc.addPage([nw, nh])

        // Translation pour replacer le contenu après rotation inverse
        const pos: Record<number, { x: number; y: number }> = {
          90:  { x: 0,  y: w  },
          180: { x: w,  y: h  },
          270: { x: h,  y: 0  },
        }
        const { x, y } = pos[angle] ?? { x: 0, y: 0 }

        console.log(`[Claude] Page ${i + 1} : rotation ${angle}° détectée → correction automatique`)
        page.drawPage(embedded, { x, y, rotate: degrees((360 - angle) % 360) })
      }
    }

    if (totalPages > maxPages) {
      console.log(`[Claude] PDF ${totalPages} pages → limité aux ${pagesCount} premières pages`)
    }

    const trimmedBytes = await newDoc.save()
    return Buffer.from(trimmedBytes)
  } catch (e) {
    // Si pdf-lib ne peut pas lire le PDF → on envoie l'original, Claude fera de son mieux
    console.warn('[Claude] limitPDFPages failed, sending original:', (e as Error).message)
    return buffer
  }
}

// ─── Analyse depuis un PDF scanné ──────────────────────────────────────────
// Claude supporte les PDFs nativement → envoi direct sans conversion en images !

export async function analyserCVDepuisPDF(pdfBuffer: Buffer): Promise<CVAnalyse> {
  const client = getClient()

  // Limiter aux 5 premières pages → réduit drastiquement le temps de traitement Claude
  const trimmedBuffer = await limitPDFPages(pdfBuffer, 5)
  const base64 = trimmedBuffer.toString('base64')

  console.log(`[Claude] Envoi PDF natif (${(trimmedBuffer.length / 1024).toFixed(0)} KB, original: ${(pdfBuffer.length / 1024).toFixed(0)} KB)...`)

  const response = await withRetry(() => client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1800,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: base64,
          },
        },
        {
          type: 'text',
          text: `${CV_JSON_PROMPT}\n\nIMPORTANT : Ce document est un scan. S'il apparaît pivoté (à l'envers, de côté), lis-le quand même dans la bonne orientation et extrais toutes les informations visibles.`,
        },
      ],
    }],
  }))

  const text = response.content[0]?.type === 'text' ? response.content[0].text : ''

  try {
    return parseCV(text)
  } catch {
    throw new Error(`Claude a retourné un JSON invalide (PDF) : ${text.slice(0, 200)}`)
  }
}

// ─── Analyse depuis texte extrait ───────────────────────────────────────────

export async function analyserCV(texteCV: string): Promise<CVAnalyse> {
  const client = getClient()

  const response = await withRetry(() => client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1800,
    messages: [{
      role: 'user',
      content: `${CV_JSON_PROMPT}\n\nCV à analyser :\n<cv>\n${texteCV.slice(0, 12000)}\n</cv>`,
    }],
  }))

  const text = response.content[0]?.type === 'text' ? response.content[0].text : ''

  try {
    return parseCV(text)
  } catch {
    throw new Error(`Claude a retourné un JSON invalide : ${text.slice(0, 200)}`)
  }
}

// ─── Redimensionner image si > 4.5 MB (limite Claude = 5 MB) ────────────────

const IMAGE_MAX_BYTES = 4_500_000 // marge de sécurité sous la limite Claude de 5 MB

async function resizeImageIfNeeded(
  buffer: Buffer,
  originalMimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
): Promise<{ buffer: Buffer; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' }> {
  if (buffer.length <= IMAGE_MAX_BYTES) {
    return { buffer, mimeType: originalMimeType }
  }

  console.log(`[Claude] Image ${(buffer.length / 1024 / 1024).toFixed(1)} MB > 4.5 MB — compression avec sharp...`)

  const sharp = (await import('sharp')).default
  const metadata = await sharp(buffer).metadata()
  const scale = Math.sqrt(IMAGE_MAX_BYTES / buffer.length) * 0.9
  const newWidth = Math.max(200, Math.round((metadata.width || 1000) * scale))

  const resized = await sharp(buffer)
    .resize(newWidth)
    .jpeg({ quality: 80 })
    .toBuffer()

  console.log(`[Claude] Image réduite : ${(resized.length / 1024 / 1024).toFixed(1)} MB (width: ${newWidth}px)`)
  return { buffer: resized, mimeType: 'image/jpeg' }
}

// ─── Analyse depuis une image (JPG, JPEG, PNG) ──────────────────────────────

export async function analyserCVDepuisImage(
  imageBuffer: Buffer,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
): Promise<CVAnalyse> {
  const client = getClient()
  const { buffer: finalBuffer, mimeType: finalMimeType } = await resizeImageIfNeeded(imageBuffer, mimeType)
  const base64 = finalBuffer.toString('base64')
  mimeType = finalMimeType

  const response = await withRetry(() => client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1800,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mimeType,
            data: base64,
          },
        },
        {
          type: 'text',
          text: CV_JSON_PROMPT,
        },
      ],
    }],
  }))

  const text = response.content[0]?.type === 'text' ? response.content[0].text : ''

  try {
    return parseCV(text)
  } catch {
    throw new Error(`Claude a retourné un JSON invalide (image) : ${text.slice(0, 200)}`)
  }
}

// ─── Matching candidat ↔ offre ──────────────────────────────────────────────

export async function calculerScoreMatching(
  candidat: {
    competences: string[]
    annees_exp: number
    titre_poste: string | null
    resume_ia: string | null
    formation?: string | null
    langues?: string[] | null
    cv_texte_brut?: string | null
    experiences?: Array<{ poste: string; entreprise: string; periode: string; description: string }> | null
  },
  offre: {
    titre: string
    competences: string[]
    exp_requise: number
    description: string | null
    localisation?: string | null
    notes?: string | null
  }
): Promise<MatchingResult> {
  const client = getClient()

  // Extrait les 3 dernières expériences du candidat pour le contexte
  const expRecentes = (candidat.experiences || []).slice(0, 3)
    .map(e => `${e.poste} chez ${e.entreprise} (${e.periode})${e.description ? ': ' + e.description.slice(0, 100) : ''}`)
    .join('\n')

  // CV brut tronqué à 1500 chars pour ne pas dépasser les tokens
  const cvBrut = (candidat.cv_texte_brut || '').slice(0, 1500)

  // Contexte complet de l'offre (description + notes = cahier des charges)
  const offreContext = [offre.description, offre.notes].filter(Boolean).join('\n').slice(0, 1200)

  const prompt = `Tu es un expert en recrutement RH avec 20 ans d'expérience en placement de personnel technique et industriel.

MISSION : Évalue la compatibilité RÉELLE entre ce candidat et ce poste. Ne te limite PAS aux mots-clés exacts — raisonne comme un recruteur expérimenté qui comprend les équivalences de métier, les compétences transférables et les domaines connexes.

━━━ CANDIDAT ━━━
Titre actuel : ${candidat.titre_poste || 'Non renseigné'}
Expérience totale : ${candidat.annees_exp} ans
Formation : ${candidat.formation || 'Non renseignée'}
Langues : ${(candidat.langues || []).join(', ') || 'Non renseignées'}
Compétences déclarées : ${candidat.competences.join(', ') || 'Aucune'}
Résumé IA : ${candidat.resume_ia || 'Non disponible'}
${expRecentes ? `Expériences récentes :\n${expRecentes}` : ''}
${cvBrut ? `Extrait CV :\n${cvBrut}` : ''}

━━━ POSTE À POURVOIR ━━━
Intitulé : ${offre.titre}
Lieu : ${offre.localisation || 'Non précisé'}
Expérience requise : ${offre.exp_requise} ans minimum
Compétences requises : ${offre.competences.join(', ') || 'Voir description'}
Description complète :
${offreContext || 'Non disponible'}

━━━ INSTRUCTIONS ━━━
1. ÉQUIVALENCES SÉMANTIQUES : comprends que "plombier-chauffagiste" = pertinent pour "CVCS/sanitaire", "mécanicien automobile" = transférable en maintenance industrielle, etc.
2. COMPÉTENCES TRANSFÉRABLES : un candidat sans le titre exact mais avec les bonnes bases techniques peut être excellent
3. FORMATION : évalue si la formation du candidat correspond au niveau requis même si l'intitulé diffère
4. LANGUES : vérifie si les exigences linguistiques sont satisfaites
5. EXPÉRIENCES : analyse le contenu réel des postes occupés, pas seulement les titres

Pondération du score global :
- 50% adéquation technique/métier (domaine, compétences, formation)
- 25% expérience et ancienneté
- 15% compétences spécifiques listées
- 10% facteurs secondaires (langues, localisation, soft skills)

Retourne UNIQUEMENT ce JSON (sans markdown) :
{
  "score": 78,
  "score_competences": 80,
  "score_experience": 75,
  "competences_matchees": ["CVCS", "chauffage"],
  "competences_manquantes": ["Planon"],
  "explication": "Explication de 2-3 phrases expliquant le raisonnement, les points forts et les points faibles.",
  "recommandation": "fort"
}

Règles : score_competences = adéquation technique globale (0-100) | score_experience = 100 si exp >= requise sinon (exp/requise)*100 | score = pondération selon les règles ci-dessus | recommandation : "fort" si >= 75, "moyen" si 50-74, "faible" si < 50`

  try {
    const response = await withRetry(() => client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    }))
    let text = (response.content[0]?.type === 'text' ? response.content[0].text : '')
      .replace(/^[\s\S]*?```(?:json|JSON)?\s*/m, '').replace(/```\s*$/m, '').replace(/```json|```JSON|```/g, '').trim()
    const fb = text.indexOf('{'), lb = text.lastIndexOf('}')
    if (fb !== -1 && lb > fb) text = text.substring(fb, lb + 1)
    const parsed = JSON.parse(text) as MatchingResult
    parsed.score = Math.min(100, Math.max(0, Math.round(parsed.score)))
    return parsed
  } catch {
    // Fallback : calcul algorithmique si Claude échoue
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
