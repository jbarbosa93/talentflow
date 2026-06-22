// lib/cv-filename.ts
//
// Garde-fou RÈGLE MÉTIER ABSOLUE : « JAMAIS matcher un candidat sur le nom du fichier ».
//
// Le pré-check d'idempotence "fichier déjà importé" de app/(dashboard)/api/cv/parse
// compare le nom de fichier à `candidats.cv_nom_fichier` pour éviter de re-payer
// l'API Claude sur un CV déjà en base. Ce raccourci n'est SÛR que si le nom est
// DISCRIMINANT (il contient un vrai nom de personne).
//
// Les noms GÉNÉRIQUES ("CV 2025.pdf", "scan.pdf", "document.pdf", "cv.pdf"…) sont
// partagés par des dizaines de candidats → comparer dessus produisait de faux
// matchs/réactivations (bug juin 2026 : importer le CV de José Batista réactivait
// par erreur Duarte Barbacena, seul candidat portant déjà "CV 2025.pdf").
//
// Direction de sûreté : en cas de doute on déclare le nom GÉNÉRIQUE. Le pire cas
// est alors de re-parser un CV déjà connu (coût, jamais un faux match). À l'inverse,
// déclarer à tort un nom "discriminant" rouvre le bug → on l'évite.

const GENERIC_TOKENS = new Set([
  'cv', 'curriculum', 'vitae', 'resume',
  'document', 'documents', 'doc', 'docs', 'fichier', 'file', 'pdf',
  'scan', 'scanned', 'scanne', 'numerisation', 'numerise', 'numerised', 'numerises',
  'image', 'img', 'photo', 'photos', 'picture', 'capture', 'screenshot',
  'sans', 'titre', 'untitled', 'nouveau', 'nouvelle', 'new',
  'copie', 'copy', 'final', 'finale', 'version', 'def', 'definitif', 'definitive',
  'lettre', 'motivation', 'candidature', 'postule', 'postuler', 'dossier',
])

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Retourne `true` si le nom de fichier ne permet PAS d'identifier une personne
 * (générique ou vide) → le pré-check par nom de fichier doit être ignoré.
 *
 * Un nom est considéré DISCRIMINANT (→ retourne `false`) s'il contient au moins
 * un token d'≥3 lettres qui n'est ni un mot générique ni un nombre/date.
 */
export function isGenericCvFilename(name: string | null | undefined): boolean {
  if (!name) return true
  // Enlève un éventuel préfixe timestamp ("1782113924011_") puis l'extension.
  let base = name.replace(/^(\d+[_-])+/, '')
  base = base.replace(/\.[a-z0-9]{1,5}$/i, '')
  base = stripAccents(base).toLowerCase()

  const tokens = base.split(/[^a-z0-9]+/).filter(Boolean)
  if (tokens.length === 0) return true

  const hasDistinctive = tokens.some(t => {
    if (/^\d+$/.test(t)) return false           // années / numéros : 2025, 20, 10…
    if (GENERIC_TOKENS.has(t)) return false      // mots vides
    const letters = t.replace(/[^a-z]/g, '')
    return letters.length >= 3                   // un vrai mot (≥3 lettres)
  })

  return !hasDistinctive
}
