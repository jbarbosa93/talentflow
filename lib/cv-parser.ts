// lib/cv-parser.ts
// Extraction du texte brut depuis PDF et Word (.docx)
// Utilise pdf-parse (Node.js uniquement — Route Handler, pas Edge)

/**
 * Extrait le texte brut d'un Buffer PDF
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const pdfParse = (await import('pdf-parse')).default
    const data = await pdfParse(buffer)
    return data.text.replace(/\n{3,}/g, '\n\n').trim()
  } catch {
    // Si l'extraction échoue (pdfjs incompatible avec l'env Node),
    // on retourne '' → le route handler basculera sur Claude Vision
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
    return extractTextFromWord(buffer)
  }

  if (ext === 'txt' || type === 'text/plain') {
    return buffer.toString('utf-8')
  }

  throw new Error(`Format de fichier non supporté : .${ext}. Utilisez PDF, DOCX ou DOC.`)
}

/**
 * Valide un fichier CV avant upload
 */
export function validateCVFile(file: File): { valid: boolean; error?: string } {
  const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

  if (file.size > MAX_SIZE) {
    return { valid: false, error: 'Le fichier dépasse la taille maximale de 10 MB' }
  }

  const allowedExtensions = ['pdf', 'docx', 'doc', 'txt']
  const ext = file.name.toLowerCase().split('.').pop()

  if (!ext || !allowedExtensions.includes(ext)) {
    return { valid: false, error: 'Format non supporté. Utilisez PDF, DOCX, DOC ou TXT.' }
  }

  return { valid: true }
}
