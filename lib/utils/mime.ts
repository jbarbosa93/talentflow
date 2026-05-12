// TalentFlow — Inférence MIME depuis l'extension de fichier
//
// v2.7.5 — Empêche les uploads avec Content-Type 'application/octet-stream' d'être
// bloqués par les whitelist MIME ajoutées sur les buckets cvs et candidat-documents.
// Certains navigateurs / clients API renvoient un MIME vide ou octet-stream.

const EXT_TO_MIME: Record<string, string> = {
  pdf:  'application/pdf',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  png:  'image/png',
  webp: 'image/webp',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc:  'application/msword',
  rtf:  'application/rtf',
}

/**
 * Infère un MIME type depuis l'extension d'un nom de fichier.
 * Si l'extension est inconnue → fallback 'application/pdf' (safe pour bucket cvs qui
 * accepte PDF + images + word + RTF).
 */
export function inferMimeFromExt(filename: string): string {
  const ext = (filename.toLowerCase().split('.').pop() || '').trim()
  return EXT_TO_MIME[ext] || 'application/pdf'
}

/**
 * Retourne un MIME safe pour upload Storage : si `fileType` est vide ou
 * 'application/octet-stream', infère depuis le nom du fichier.
 */
export function safeContentType(fileType: string | undefined | null, filename: string): string {
  if (fileType && fileType !== 'application/octet-stream') return fileType
  return inferMimeFromExt(filename)
}
