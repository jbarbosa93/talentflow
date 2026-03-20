// lib/cv-parser.ts
// Extraction du texte brut depuis PDF, Word, images
// ⚠ Utilise pdfjs-dist (NON BLOQUANT) — pdf-parse bloquait l'event loop Node.js sur certains PDFs

/**
 * Extrait le texte brut d'un Buffer PDF via pdfjs-dist (async, non-bloquant)
 * Si l'extraction échoue → retourne '' → la route bascule sur Claude Vision
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    // pdfjs-dist v5 legacy build — compatible Node.js, vraiment async (ne bloque pas l'event loop)
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs' as string)
    const lib = (pdfjs as any).default ?? pdfjs

    // Désactiver le worker PDF en mode serveur Node.js
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
    const maxPages = Math.min(pdf.numPages, 15) // Max 15 pages, un CV ne va pas au-delà
    const texts: string[] = []

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const pageText = (content.items as any[])
        .map((item: any) => item.str ?? '')
        .join(' ')
      texts.push(pageText)
    }

    return texts.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  } catch {
    // Échec → retourne '' → route bascule sur Claude Vision
    return ''
  }
}

/**
 * Extrait le texte brut d'un Buffer Word (.docx)
 */
export async function extractTextFromWord(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth')

  try {
    const result = await mammoth.extractRawText({ buffer })

    if (result.messages.length > 0) {
      console.warn('Avertissements mammoth:', result.messages)
    }

    return result.value.replace(/\n{3,}/g, '\n\n').trim()
  } catch (error) {
    throw new Error(
      `Échec de l'extraction Word : ${
        error instanceof Error ? error.message : 'Erreur inconnue'
      }`
    )
  }
}

/**
 * Extrait le texte brut d'un Buffer Word ancien format (.doc) via word-extractor
 */
export async function extractTextFromDoc(buffer: Buffer): Promise<string> {
  const WordExtractor = (await import('word-extractor')).default
  const extractor = new WordExtractor()
  const doc = await extractor.extract(buffer)
  const text = doc.getBody()
  return text.replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Détecte le type de fichier et extrait le texte
 */
export async function extractTextFromCV(
  buffer: Buffer,
  filename: string,
  mimeType?: string
): Promise<string> {
  const ext = filename.toLowerCase().split('.').pop()
  const type = mimeType?.toLowerCase()

  if (ext === 'pdf' || type === 'application/pdf') {
    return extractTextFromPDF(buffer)
  }

  if (
    ext === 'docx' ||
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return extractTextFromWord(buffer)
  }

  if (ext === 'doc' || type === 'application/msword') {
    // .doc (Word 97-2003) : mammoth ne le supporte pas → utiliser word-extractor
    try {
      return await extractTextFromDoc(buffer)
    } catch {
      // Si word-extractor échoue aussi, essayer mammoth en dernier recours
      try {
        return await extractTextFromWord(buffer)
      } catch {
        return '' // tout échoue → traité comme "scanné" → envoyé à Claude
      }
    }
  }

  if (ext === 'txt' || type === 'text/plain') {
    return buffer.toString('utf-8')
  }

  // Images : pas d'extraction texte ici → la route basculera sur Claude Vision
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext || '') ||
      type?.startsWith('image/')) {
    return '' // vide → route détectera isScanned=true et appellera analyserCVDepuisImage
  }

  throw new Error(`Format de fichier non supporté : .${ext}. Utilisez PDF, DOCX, DOC, TXT, JPG ou PNG.`)
}

/**
 * Valide un fichier CV avant upload
 */
export function validateCVFile(file: File): { valid: boolean; error?: string } {
  const MAX_SIZE = 100 * 1024 * 1024 // 100 MB

  if (file.size > MAX_SIZE) {
    return { valid: false, error: 'Le fichier dépasse la taille maximale de 100 MB' }
  }

  const allowedExtensions = ['pdf', 'docx', 'doc', 'txt', 'jpg', 'jpeg', 'png', 'webp']
  const ext = file.name.toLowerCase().split('.').pop()

  if (!ext || !allowedExtensions.includes(ext)) {
    return { valid: false, error: 'Format non supporté. Utilisez PDF, DOCX, DOC, TXT, JPG ou PNG.' }
  }

  return { valid: true }
}
