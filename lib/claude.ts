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
  const cleaned = text.replace(/```json|```/g, '').trim()
  const result = JSON.parse(cleaned) as CVAnalyse
  if (!result.nom && !result.prenom) result.nom = 'Candidat'
  if (!Array.isArray(result.competences)) result.competences = []
  if (!Array.isArray(result.langues)) result.langues = []
  if (typeof result.permis_conduire !== 'boolean') result.permis_conduire = false
  if (!result.linkedin) result.linkedin = ''
  if (!result.date_naissance) result.date_naissance = ''
  if (!Array.isArray(result.experiences)) result.experiences = []
  if (!Array.isArray(result.formations_details)) result.formations_details = []
  return result
}

// Analyse depuis un PDF scanné — Groq ne supporte pas le PDF natif
// Cette fonction n'est appelée que si pdfjs n'a pas pu extraire le texte
export async function analyserCVDepuisPDF(_pdfBuffer: Buffer): Promise<CVAnalyse> {
  // Groq ne supporte pas les PDFs en entrée directe.
  // La route doit gérer ce cas en retournant une erreur appropriée.
  throw new Error('PDF_SCAN_NON_SUPPORTE')
}

export async function analyserCV(texteCV: string): Promise<CVAnalyse> {
  const client = getClient()

  const prompt = `Tu es un assistant RH expert. Analyse ce CV et extrais les informations en JSON.\n\nCV à analyser :\n<cv>\n${texteCV.slice(0, 8000)}\n</cv>\n\n${CV_JSON_PROMPT}`

  const completion = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 2048,
  })

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

  const completion = await client.chat.completions.create({
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
    max_tokens: 2048,
  })

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
    const completion = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 512,
    })
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
