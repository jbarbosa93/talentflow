// lib/document-splitter.ts
// Détection et séparation automatique de documents multi-types dans un PDF
// (CV + certificat + lettre de motivation sur plusieurs pages)
//
// RÈGLE : Ne modifie JAMAIS lib/claude.ts ni lib/cv-parser.ts
// Toujours un try/catch → fallback vers logique existante si erreur

import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'

// ─── Types internes ──────────────────────────────────────────────────────────

type DocumentTypePage =
  | 'cv'
  | 'lettre_motivation'
  | 'certificat'
  | 'diplome'
  | 'permis'
  | 'attestation'
  | 'autre'

interface PageInfo {
  page: number        // 1-indexed (tel que retourné par Claude)
  type: DocumentTypePage
  description: string
}

interface DocumentGroup {
  type: DocumentTypePage
  description: string
  pageIndices: number[]  // 0-indexed
}

// ─── Export principal ────────────────────────────────────────────────────────

export interface DocumentAnalyse {
  cvBuffer: Buffer
  cvFilename: string
  autresDocuments: {
    buffer: Buffer
    filename: string
    type: 'lettre_motivation' | 'certificat' | 'diplome' | 'permis' | 'attestation' | 'autre'
    description: string
  }[]
  estMultiDocument: boolean
}

// ─── Client Anthropic (singleton) ───────────────────────────────────────────

let _client: Anthropic | null = null
function getAnthropicClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY manquant')
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _client
}

// ─── Compter les pages d'un PDF via pdfjs-dist ───────────────────────────────

async function compterPagesPDF(buffer: Buffer): Promise<number> {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs' as string)
    const lib = (pdfjs as any).default ?? pdfjs
    if (lib.GlobalWorkerOptions) {
      lib.GlobalWorkerOptions.workerSrc = ''
    }
    const loadingTask = lib.getDocument({
      data: new Uint8Array(buffer),
      verbosity: 0,
      disableFontFace: true,
      useWorkerFetch: false,
    })
    const pdf = await loadingTask.promise
    return pdf.numPages as number
  } catch {
    // En cas d'erreur, on essaie avec pdf-lib
    try {
      const { PDFDocument } = await import('pdf-lib')
      const doc = await PDFDocument.load(buffer, { ignoreEncryption: true })
      return doc.getPageCount()
    } catch {
      return 1 // fallback conservateur
    }
  }
}

// ─── a) Détecter les types par page via Claude Vision ────────────────────────

async function detecterTypesDocuments(buffer: Buffer): Promise<PageInfo[]> {
  const nPages = await compterPagesPDF(buffer)

  // Optimisation : PDF d'une seule page → pas besoin d'appeler Claude
  if (nPages < 2) {
    return [{ page: 1, type: 'cv', description: 'Document unique' }]
  }

  const base64 = buffer.toString('base64')
  const client = getAnthropicClient()

  const prompt = `Analyse ce document PDF multi-pages. Pour chaque page, identifie le type de document.
Types possibles : cv, lettre_motivation, certificat, diplome, permis, attestation, autre

IMPORTANT : Retourne UNIQUEMENT un JSON valide avec ce format exact, sans markdown, sans explication :
{
  "pages": [
    { "page": 1, "type": "cv", "description": "Curriculum vitae" },
    { "page": 2, "type": "certificat", "description": "Certificat de formation" }
  ]
}`

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
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
          } as any,
          {
            type: 'text',
            text: prompt,
          },
        ],
      }],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''

    // Nettoyage markdown éventuel
    let cleaned = text
      .replace(/^[\s\S]*?```(?:json|JSON)?\s*/m, '')
      .replace(/```\s*$/m, '')
      .replace(/```json|```JSON|```/g, '')
      .trim()
    const firstBrace = cleaned.indexOf('{')
    const lastBrace = cleaned.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1)
    }

    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed?.pages)) {
      throw new Error('Format JSON inattendu')
    }

    return parsed.pages as PageInfo[]
  } catch (err) {
    console.warn('[Multi-Doc] Erreur détection types → fallback cv unique:', (err as Error).message)
    // Fallback : tout le document est traité comme un seul CV
    return Array.from({ length: nPages }, (_, i) => ({
      page: i + 1,
      type: 'cv' as DocumentTypePage,
      description: 'Fallback — type non détecté',
    }))
  }
}

// ─── b) Grouper les pages consécutives de même type ──────────────────────────

function grouperPages(pages: PageInfo[]): DocumentGroup[] {
  if (pages.length === 0) return []

  const groups: DocumentGroup[] = []
  let currentGroup: DocumentGroup = {
    type: pages[0].type,
    description: pages[0].description,
    pageIndices: [pages[0].page - 1], // convertir 1-indexed → 0-indexed
  }

  for (let i = 1; i < pages.length; i++) {
    const page = pages[i]
    if (page.type === currentGroup.type) {
      currentGroup.pageIndices.push(page.page - 1)
    } else {
      groups.push(currentGroup)
      currentGroup = {
        type: page.type,
        description: page.description,
        pageIndices: [page.page - 1],
      }
    }
  }
  groups.push(currentGroup)

  return groups
}

// ─── c) Extraire des pages spécifiques avec pdf-lib ─────────────────────────

async function extrairePagesPDF(buffer: Buffer, pageIndices: number[]): Promise<Buffer> {
  const { PDFDocument } = await import('pdf-lib')
  const srcDoc = await PDFDocument.load(buffer, { ignoreEncryption: true })
  const newDoc = await PDFDocument.create()

  const copied = await newDoc.copyPages(srcDoc, pageIndices)
  for (const page of copied) {
    newDoc.addPage(page)
  }

  const bytes = await newDoc.save()
  return Buffer.from(bytes)
}

// ─── d) Fonction principale ──────────────────────────────────────────────────

export async function analyserDocumentMultiType(
  buffer: Buffer,
  filename: string
): Promise<DocumentAnalyse> {
  const fallback: DocumentAnalyse = {
    cvBuffer: buffer,
    cvFilename: filename,
    autresDocuments: [],
    estMultiDocument: false,
  }

  // Vérifier que c'est un PDF (magic bytes %PDF)
  const isPDF =
    filename.toLowerCase().endsWith('.pdf') ||
    (buffer.length >= 4 && buffer.slice(0, 4).toString('ascii') === '%PDF')

  if (!isPDF) {
    return fallback
  }

  try {
    const nPages = await compterPagesPDF(buffer)

    // PDF d'une seule page → pas de split possible
    if (nPages <= 1) {
      return fallback
    }

    // Détection des types par page
    const pages = await detecterTypesDocuments(buffer)
    const groups = grouperPages(pages)

    // Si un seul groupe de type cv → pas de split nécessaire
    if (groups.length <= 1 && groups[0]?.type === 'cv') {
      return fallback
    }

    // Vérifier qu'il y a réellement plusieurs types différents
    const types = new Set(groups.map(g => g.type))
    if (types.size <= 1) {
      return fallback
    }

    console.log(`[Multi-Doc] Détecté ${groups.length} groupes (${[...types].join(', ')}) dans ${filename}`)

    // Groupes CV
    const cvGroups = groups.filter(g => g.type === 'cv')
    // Groupes non-CV
    const autreGroups = groups.filter(g => g.type !== 'cv')

    // Si aucun groupe CV → utiliser tout le document comme CV (fallback sécurité)
    if (cvGroups.length === 0) {
      console.warn('[Multi-Doc] Aucun groupe CV trouvé → fallback document complet comme CV')
      return fallback
    }

    // Extraire les pages CV
    const cvIndices = cvGroups.flatMap(g => g.pageIndices)
    const cvBuffer = cvIndices.length === nPages
      ? buffer  // optimisation : pas de split si toutes les pages sont CV
      : await extrairePagesPDF(buffer, cvIndices)

    // Construire le nom de fichier CV
    const baseName = filename.replace(/\.pdf$/i, '')
    const cvFilename = cvIndices.length === nPages
      ? filename
      : `${baseName}_cv.pdf`

    // Extraire les autres documents
    const autresDocuments: DocumentAnalyse['autresDocuments'] = []

    for (const group of autreGroups) {
      try {
        const docBuffer = await extrairePagesPDF(buffer, group.pageIndices)
        const typeSlug = group.type.replace('_', '-')
        const docFilename = `${baseName}_${typeSlug}.pdf`

        const docType = group.type as 'lettre_motivation' | 'certificat' | 'diplome' | 'permis' | 'attestation' | 'autre'

        autresDocuments.push({
          buffer: docBuffer,
          filename: docFilename,
          type: docType,
          description: group.description,
        })
      } catch (extractErr) {
        console.warn(`[Multi-Doc] Erreur extraction groupe ${group.type}:`, (extractErr as Error).message)
        // On ignore ce groupe en cas d'erreur et on continue
      }
    }

    return {
      cvBuffer,
      cvFilename,
      autresDocuments,
      estMultiDocument: autresDocuments.length > 0,
    }
  } catch (err) {
    console.error('[Multi-Doc] Erreur analyse multi-type → fallback:', (err as Error).message)
    return fallback
  }
}
