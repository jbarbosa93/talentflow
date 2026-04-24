// lib/document-classification.ts
// Source unique de vérité pour classifier un document importé (CV vs non-CV).
//
// Utilisé par :
//   - app/(dashboard)/api/cv/parse/route.ts         (import manuel)
//   - app/(dashboard)/api/onedrive/sync/route.ts    (cron OneDrive)
//   - app/(dashboard)/api/onedrive/sync-test/route.ts (banc DRY-RUN)
//
// Règle v1.9.33 : le nom du fichier n'est JAMAIS utilisé pour classifier.
// Seuls comptent : la classification IA (document_type), le contenu texte,
// et les signaux sémantiques positifs (expériences / compétences / formation / titre).
//
// v1.10.0 — CV-markers prioritaires sur patterns parasites.
// Motivé par le cas "Loïc Arluna cv.docx" : le CV mentionnait "résiliation de mon
// contrat de travail" dans une expérience pro → pattern /contrat de travail/
// déclenchait un classement erroné en `contrat`, et le candidat n'était jamais créé,
// faisant cascader 4 autres documents en erreur OneDrive.
//
// Simulation sur 100 CVs réels : 4-11 faux positifs OLD corrigés, 0 régression.

export type DocumentType =
  | 'cv'
  | 'certificat'
  | 'attestation'
  | 'lettre_motivation'
  | 'bulletin_salaire'
  | 'permis'
  | 'reference'
  | 'contrat'
  | 'diplome'
  | 'autre'

export interface ClassificationInput {
  analyse: {
    document_type?: string | null
    nom?: string | null
    email?: string | null
    titre_poste?: string | null
    formation?: string | null
    competences?: unknown[] | null
    experiences?: unknown[] | null
    formations_details?: unknown[] | null
  }
  texteCV: string
}

export interface ClassificationResult {
  docType: DocumentType
  isNotCV: boolean
  reason: 'ia' | 'cv_markers' | 'content_pattern' | 'email_generique' | 'no_experience' | 'default'
}

// Préfixes d'email qu'un candidat n'utilise jamais pour postuler
// (boîtes génériques d'entreprise → document tiers certif/attestation/contrat).
// Exception : si le document a des CV-markers forts (ex. indépendant avec son propre info@),
// on fait confiance aux markers (règle #3).
const GENERIC_EMAIL_PREFIX = /^(info|contact|rh|hr|hrdirektion|personal|sekretariat|secretariat|admin|direction|accueil|reception|office)@/

export function classifyDocument({ analyse, texteCV }: ClassificationInput): ClassificationResult {
  const iaDocType: DocumentType = ((analyse?.document_type as DocumentType) || 'cv')
  const iaSaysNotCV = !!iaDocType && iaDocType !== 'cv'

  // ── CV-markers positifs extraits de l'analyse IA ────────────────────────
  const experiences = Array.isArray(analyse?.experiences) ? (analyse.experiences as unknown[]) : []
  const competences = Array.isArray(analyse?.competences) ? (analyse.competences as unknown[]) : []
  const formationsDetails = Array.isArray(analyse?.formations_details) ? (analyse.formations_details as unknown[]) : []
  const titrePoste = (analyse?.titre_poste || '').trim()
  const formationField = (analyse?.formation || '').trim()

  const hasExperiences = experiences.length >= 1
  const hasCompetences = competences.length >= 2
  const hasFormation = formationsDetails.length >= 1 || formationField.length >= 5
  const hasTitre = titrePoste.length >= 3
  const hasStrongCvMarker = hasExperiences || hasCompetences || hasFormation || hasTitre

  const textLen = (texteCV || '').length

  // ── 1. CV-markers forts présents → c'est un CV, on stoppe ici ───────────
  // Les signaux positifs (expériences / compétences / formation / titre) priment
  // sur les signaux négatifs (patterns contenu, email générique).
  //   - Cas Loïc Arluna : "résiliation de mon contrat de travail" dans une exp → CV
  //   - Cas Caryl Dubrit : indépendant avec info@dubrit-services.ch → CV
  if (hasStrongCvMarker) {
    return { docType: 'cv', isNotCV: false, reason: 'cv_markers' }
  }

  // ── 2. IA explicite non-CV + aucun marker → on fait confiance IA ────────
  if (iaSaysNotCV) {
    return { docType: iaDocType, isNotCV: true, reason: 'ia' }
  }

  // ── 3. Email générique d'entreprise + aucun marker → non-CV ─────────────
  // info@/rh@/contact@ sans CV-markers = boîte entreprise (scan de certif).
  if (analyse?.email) {
    const emailLower = String(analyse.email).toLowerCase().trim()
    if (GENERIC_EMAIL_PREFIX.test(emailLower)) {
      return { docType: 'certificat', isNotCV: true, reason: 'email_generique' }
    }
  }

  // ── 4. Texte court + aucun marker + pas d'exp + pattern matché → non-CV ─
  // Un vrai certificat/attestation tient sur 1-2 pages (< 1500 chars).
  // Au-dessus de ce seuil, le risque de faux positif sur un CV dont le texte
  // contient accidentellement "contrat de travail" devient trop élevé.
  if (textLen < 1500 && !hasExperiences) {
    const contentLower = (texteCV || '').slice(0, 2000)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

    const strictContentType: DocumentType | null =
      /certificat de travail|certificat d'emploi|certificat d'apprentissage|attestation de travail|arbeitszeugnis|zeugnis/.test(contentLower) ? 'certificat' :
      /attestation de formation|attestation de reussite|zertifikat/.test(contentLower) ? 'attestation' :
      /lettre de motivation|bewerbungsschreiben|objet\s*:\s*candidature|candidature spontanee|candidature pour le poste|je vous prie d['\s]agreer|mes salutations distinguees|l['\s]expression de mes salutations|sehr geehrte|mit freundlichen gr[uü]ssen/.test(contentLower) ? 'lettre_motivation' :
      /bulletin de salaire|fiche de paie|lohnabrechnung/.test(contentLower) ? 'bulletin_salaire' :
      /permis de travail|permis de sejour|autorisation de travail|aufenthaltsbewilligung/.test(contentLower) ? 'permis' :
      /lettre de recommandation|lettre de reference|referenzschreiben/.test(contentLower) ? 'reference' :
      /contrat de travail|avenant au contrat|arbeitsvertrag/.test(contentLower) ? 'contrat' :
      null

    if (strictContentType) {
      return { docType: strictContentType, isNotCV: true, reason: 'content_pattern' }
    }
  }

  // ── 5. hasName + aucune expérience → diplôme/certificat générique ───────
  {
    const nom = (analyse?.nom || '').trim()
    const hasName = !!(nom && nom !== 'Candidat' && nom.length > 1)
    if (hasName && !hasExperiences) {
      return { docType: 'diplome', isNotCV: true, reason: 'no_experience' }
    }
  }

  // ── 6. Fallback — classification IA conservée ───────────────────────────
  return { docType: iaDocType, isNotCV: iaSaysNotCV, reason: 'default' }
}
