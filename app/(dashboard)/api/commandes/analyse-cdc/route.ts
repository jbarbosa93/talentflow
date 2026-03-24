// app/(dashboard)/api/commandes/analyse-cdc/route.ts
// Analyse un Cahier des Charges (PDF/DOCX) via Claude IA
// POST /api/commandes/analyse-cdc  — multipart/form-data { file }
// Retourne un objet CommandeData pré-rempli pour validation

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 60

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY manquant')
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

const CDC_PROMPT = `Tu es un expert RH et recruteur. Analyse ce Cahier des Charges (CDC) ou description de poste et extrais toutes les informations pertinentes pour créer une commande de recrutement.

Retourne UNIQUEMENT un JSON valide (sans markdown, sans backticks) avec cette structure :
{
  "client_nom": "Nom de l'entreprise cliente",
  "titre": "Intitulé exact du poste recherché",
  "nb_postes": 1,
  "localisation": "Ville ou commune spécifique (ex: Monthey, Sion, Genève)",
  "exp_requise": 3,
  "date_debut": "2024-04-01",
  "duree_mission": "CDI ou durée ex: 3 mois, 6 mois",
  "competences": ["Compétence1", "Compétence2"],
  "formation": "Formation requise ex: CFC maçon, Bachelor ingénieur",
  "langues": ["Français", "Allemand"],
  "permis": false,
  "taux_activite": "100%",
  "description": "Description complète du poste en 3-5 phrases résumant les missions principales",
  "notes": "Informations complémentaires utiles : salaire, conditions particulières, contact client, etc."
}

Règles d'extraction :
- titre : intitulé du poste tel qu'indiqué dans le document (ex: "Chef d'objet FM", "Électricien CFC")
- client_nom : nom de l'entreprise/client si mentionné, sinon ""
- nb_postes : nombre de postes à pourvoir (1 par défaut)
- exp_requise : années d'expérience requises (entier, 0 si non précisé)
- date_debut : format ISO "YYYY-MM-DD" si précisé, sinon ""
- duree_mission : type de contrat ou durée (ex: "CDI", "Intérim 3 mois", "Temporaire")
- competences : liste des compétences techniques, certifications, logiciels requis (max 15)
- formation : diplôme/formation requis (ex: "CFC électricien", "Bachelor ingénieur")
- langues : langues requises
- permis : true si permis de conduire requis
- taux_activite : ex: "100%", "80-100%"
- description : résumé des missions principales (3-5 phrases)
- notes : tout ce qui est utile à noter (conditions salariales, avantages, contact, remarques)
- localisation : TOUJOURS la ville/commune concrète (ex: "Monthey", "Sion", "Lausanne"). Si le document mentionne une ville spécifique ET une région, prendre la ville. Ne jamais mettre une région vague comme "Ouest", "Romand", "Est" à moins que aucune ville ne soit mentionnée
- Si une info est absente → chaîne vide "" (ou false, [], 0 selon le type)
- Ne rien inventer, uniquement ce qui est dans le document`

async function limitPDFPages(buffer: Buffer, maxPages = 8): Promise<Buffer> {
  try {
    const { PDFDocument } = await import('pdf-lib')
    const srcDoc = await PDFDocument.load(buffer, { ignoreEncryption: true })
    const totalPages = srcDoc.getPageCount()
    if (totalPages <= maxPages) return buffer

    const newDoc = await PDFDocument.create()
    const pages = await newDoc.copyPages(srcDoc, Array.from({ length: maxPages }, (_, i) => i))
    pages.forEach(p => newDoc.addPage(p))
    const bytes = await newDoc.save()
    return Buffer.from(bytes)
  } catch {
    return buffer
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'Fichier requis' }, { status: 400 })
    }

    const mimeType = file.type || ''
    const fileName = file.name.toLowerCase()
    const isDocx = fileName.endsWith('.docx') || mimeType.includes('wordprocessingml') || mimeType.includes('msword')
    const isPdf = fileName.endsWith('.pdf') || mimeType.includes('pdf')
    const isImage = mimeType.includes('image/') || fileName.match(/\.(jpe?g|png|webp)$/)

    if (!isDocx && !isPdf && !isImage) {
      return NextResponse.json({ error: 'Format non supporté. Utilisez PDF, DOCX, JPG ou PNG.' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const client = getClient()

    let messageContent: Anthropic.MessageParam['content']

    if (isDocx) {
      // Extraire le texte du DOCX avec mammoth
      const mammoth = await import('mammoth')
      const { value: docxText } = await mammoth.extractRawText({ buffer })
      messageContent = [
        { type: 'text', text: `${CDC_PROMPT}\n\nDocument à analyser :\n<document>\n${docxText.slice(0, 12000)}\n</document>` },
      ]
    } else if (isPdf) {
      const trimmed = await limitPDFPages(buffer, 8)
      const base64 = trimmed.toString('base64')
      messageContent = [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        } as any,
        { type: 'text', text: CDC_PROMPT },
      ]
    } else {
      const base64 = buffer.toString('base64')
      const imgType = mimeType.includes('png') ? 'image/png' : mimeType.includes('webp') ? 'image/webp' : 'image/jpeg'
      messageContent = [
        {
          type: 'image',
          source: { type: 'base64', media_type: imgType, data: base64 },
        } as any,
        { type: 'text', text: CDC_PROMPT },
      ]
    }

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      messages: [{ role: 'user', content: messageContent }],
    })

    let text = (response.content[0]?.type === 'text' ? response.content[0].text : '')
      .replace(/^[\s\S]*?```(?:json|JSON)?\s*/m, '')
      .replace(/```\s*$/m, '')
      .replace(/```json|```JSON|```/g, '')
      .trim()

    const fb = text.indexOf('{')
    const lb = text.lastIndexOf('}')
    if (fb !== -1 && lb > fb) text = text.substring(fb, lb + 1)

    const parsed = JSON.parse(text)

    // Sanitize
    if (!Array.isArray(parsed.competences)) parsed.competences = []
    if (!Array.isArray(parsed.langues)) parsed.langues = []
    if (typeof parsed.permis !== 'boolean') parsed.permis = false
    parsed.nb_postes = parseInt(parsed.nb_postes) || 1
    parsed.exp_requise = parseInt(parsed.exp_requise) || 0

    return NextResponse.json({ success: true, commande: parsed })
  } catch (error) {
    console.error('[analyse-cdc]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
