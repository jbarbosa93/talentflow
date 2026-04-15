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

      // Détecter rotation de la page (0, 90, 180, 270)
      // Si la page est tournée, le texte extrait sera illisible → forcer Claude Vision
      const rotation = page.rotate ?? 0
      if (rotation !== 0) {
        console.log(`[CV Parser] Page ${i} tournée à ${rotation}° → retour vide pour forcer Claude Vision`)
        return '' // Force le fallback Claude Vision dans la route
      }

      const content = await page.getTextContent()

      // Détecter texte rendu à l'envers (transform matrix avec scale vertical négatif)
      // Certains PDFs sont visuellement inversés sans utiliser le flag rotation
      const itemsWithTransform = (content.items as any[]).filter((item: any) => item.transform && item.str?.trim())
      if (itemsWithTransform.length > 0) {
        const invertedCount = itemsWithTransform.filter((item: any) => item.transform[3] < 0).length
        const invertedRatio = invertedCount / itemsWithTransform.length
        if (invertedRatio > 0.5) {
          console.log(`[CV Parser] Page ${i}: ${Math.round(invertedRatio * 100)}% du texte inversé (transform négatif) → forcer Claude Vision`)
          return '' // Force le fallback Claude Vision
        }
      }

      // Détecter texte en ordre inversé (dernier mot en haut de page = PDF à l'envers)
      // Vérifier si les positions Y sont en ordre décroissant (normal) ou croissant (inversé)
      if (itemsWithTransform.length >= 5) {
        const yPositions = itemsWithTransform.slice(0, 20).map((item: any) => item.transform[5])
        let ascending = 0
        let descending = 0
        for (let j = 1; j < yPositions.length; j++) {
          if (yPositions[j] > yPositions[j - 1]) ascending++
          else if (yPositions[j] < yPositions[j - 1]) descending++
        }
        // Dans un PDF normal, le texte va de haut (Y élevé) vers le bas (Y faible) → descending domine
        // Si ascending domine, le contenu est probablement à l'envers
        if (ascending > descending * 2 && ascending > 5) {
          console.log(`[CV Parser] Page ${i}: ordre du texte inversé (${ascending} asc vs ${descending} desc) → forcer Claude Vision`)
          return '' // Force le fallback Claude Vision
        }
      }

      const pageText = (content.items as any[])
        .map((item: any) => item.str ?? '')
        .join(' ')
      texts.push(pageText)
    }

    return texts.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  } catch (err: any) {
    if (err?.name === 'PasswordException' || err?.code === 1 || err?.message?.toLowerCase().includes('password')) {
      throw new Error('PDF_ENCRYPTED')
    }
    // Autres erreurs → retourne '' → route bascule sur Claude Vision
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
 * Extraction texte avec rotation automatique — PDF et images
 * Tente 0°, 90°, 180°, 270° et retourne le premier résultat ≥ minLength chars
 * Pour PDF : rotation via pdf-lib (pas d'appel Vision)
 * Pour images : rotation via sharp puis Vision
 */
export async function extractTextWithRotation(
  buffer: Buffer,
  filename: string,
  minLength: number = 50
): Promise<{ text: string; rotatedBuffer: Buffer; rotation: number }> {
  const ext = filename.toLowerCase().split('.').pop() || ''
  const isPDF = ext === 'pdf'
  const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext)

  // Tentative 0° (original)
  if (isPDF) {
    const text = await extractTextFromCV(buffer, filename)
    if (text.length >= minLength) return { text, rotatedBuffer: buffer, rotation: 0 }

    // Tenter 90°, 180°, 270° via pdf-lib
    const { PDFDocument, degrees: pdfDegrees } = await import('pdf-lib')
    for (const angle of [90, 180, 270]) {
      try {
        const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true })
        for (let p = 0; p < pdfDoc.getPageCount(); p++) {
          const page = pdfDoc.getPage(p)
          const curr = page.getRotation().angle
          page.setRotation(pdfDegrees((curr + angle) % 360))
        }
        const rotated = Buffer.from(await pdfDoc.save())
        const rotText = await extractTextFromCV(rotated, filename)
        if (rotText.length >= minLength) return { text: rotText, rotatedBuffer: rotated, rotation: angle }
      } catch { /* rotation failed */ }
    }

    // Toutes les rotations échouent → retourner l'original (vide)
    return { text: '', rotatedBuffer: buffer, rotation: 0 }
  }

  if (isImage) {
    // Images : rotation via sharp, texte via Vision dans la route
    // On retourne les buffers tournés pour que la route teste avec Vision
    return { text: '', rotatedBuffer: buffer, rotation: 0 }
  }

  // Autres formats (DOCX, DOC) — pas de rotation
  const text = await extractTextFromCV(buffer, filename)
  return { text, rotatedBuffer: buffer, rotation: 0 }
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
