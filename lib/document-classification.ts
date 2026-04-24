// lib/document-classification.ts
// Source unique de vérité pour classifier un document importé (CV vs non-CV).
//
// Utilisé par :
//   - app/(dashboard)/api/cv/parse/route.ts         (import manuel)
//   - app/(dashboard)/api/onedrive/sync/route.ts    (cron OneDrive)
//   - app/(dashboard)/api/onedrive/sync-test/route.ts (banc DRY-RUN)
//
// v1.9.33 : jamais de détection par filename.
// v1.9.101 : CV-markers prioritaires — corrigeait les CVs avec "contrat de travail"
//            dans une expérience (cas Loïc Arluna) mais sur-classait en CV tout doc
//            avec 1 exp + 2 comp (certificats, lettres de motivation avec titre).
// v1.9.102 : 7 règles ordonnées — IA explicite non-CV = priorité max, patterns
//            en-tête 0-500 chars en 2e ligne, CV-markers durcis en tie-breaker.

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
  | 'formation'
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

// Types que l'IA peut retourner explicitement et qu'on doit respecter sans condition.
const IA_EXPLICIT_NOT_CV = new Set<string>([
  'certificat',
  'attestation',
  'lettre_motivation',
  'contrat',
  'diplome',
  'bulletin_salaire',
  'permis',
  'reference',
  'formation',
])

// Préfixes d'email qu'un candidat n'utilise jamais pour postuler
// (boîtes génériques d'entreprise → document tiers certif/attestation/contrat).
// Exception : si CV-markers forts (cas Caryl Dubrit indépendant info@dubrit-services.ch,
// Nicolas Kilchenmann info@niki-pictures.com) → règle 3 CV-markers prime.
const GENERIC_EMAIL_PREFIX = /^(info|contact|rh|hr|hrdirektion|personal|sekretariat|secretariat|admin|direction|accueil|reception|office)@/

export function classifyDocument({ analyse, texteCV }: ClassificationInput): ClassificationResult {
  const iaDocType: DocumentType = ((analyse?.document_type as DocumentType) || 'cv')

  // CV-markers extraits
  const experiences = Array.isArray(analyse?.experiences) ? (analyse.experiences as unknown[]) : []
  const competences = Array.isArray(analyse?.competences) ? (analyse.competences as unknown[]) : []
  const formationsDetails = Array.isArray(analyse?.formations_details) ? (analyse.formations_details as unknown[]) : []
  const titrePoste = (analyse?.titre_poste || '').trim()
  const formationField = (analyse?.formation || '').trim()

  const hasExperiences = experiences.length >= 1
  const hasFormation = formationsDetails.length >= 1 || formationField.length >= 5
  const hasTitre = titrePoste.length >= 3
  const textLen = (texteCV || '').length

  // ── Règle 1 : IA explicite non-CV → respect absolu (priorité max) ─────
  // L'IA retourne `document_type` explicitement parmi certificat/attestation/...
  // On fait confiance sans condition. Si elle se trompe sur un vrai CV
  // (très rare), le consultant peut le re-importer en forçant.
  if (IA_EXPLICIT_NOT_CV.has(iaDocType)) {
    return { docType: iaDocType, isNotCV: true, reason: 'ia' }
  }

  // ── Règle 2 : Patterns HAUTE CONFIANCE en-tête 0-500 chars ────────────
  // Un vrai CV ne commence JAMAIS par "Certificat de travail", "Je soussigné",
  // "Nous certifions que", etc. Filet de sécurité si l'IA dit 'cv' par erreur.
  const header = (texteCV || '').slice(0, 500).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const headerPattern: DocumentType | null =
    /certificat de travail|certificat d'emploi|certificat d'apprentissage/.test(header) ? 'certificat' :
    /attestation de travail|attestation d'emploi/.test(header) ? 'certificat' :
    /arbeitszeugnis|zeugnis/.test(header) ? 'certificat' :
    /je soussign[ée]|nous certifions que|wir bestatigen|wir bestätigen/.test(header) ? 'certificat' :
    /attestation de formation|attestation de reussite|zertifikat/.test(header) ? 'attestation' :
    /bewerbungsschreiben|objet\s*:\s*candidature|candidature spontanee|candidature pour le poste/.test(header) ? 'lettre_motivation' :
    null
  if (headerPattern) {
    return { docType: headerPattern, isNotCV: true, reason: 'content_pattern' }
  }
  // Lettre motivation courte : "Madame, Monsieur" dans les 200 premiers chars + texte < 1500.
  if (textLen < 1500 && textLen > 0) {
    const head200 = header.slice(0, 200)
    if (/madame[\s,]+monsieur|sehr geehrte/.test(head200)) {
      return { docType: 'lettre_motivation', isNotCV: true, reason: 'content_pattern' }
    }
  }

  // ── Règle 3 : CV-markers DURCIS (tie-breaker) ──────────────────────────
  // Variante A (cas général) : exp ≥ 2 ET (comp ≥ 3 OU formation)
  //   → Loïc Arluna (2 exp + 9 comp + 2 form) → CV
  // Variante B (indépendants) : exp ≥ 1 ET comp ≥ 5 ET titre cohérent
  //   → Nicolas Kilchenmann info@niki-pictures.com (1 exp + 15 comp + titre) → CV
  //   → Caryl Dubrit info@dubrit-services.ch (7 exp + 14 comp) → CV via variante A
  const variantA = experiences.length >= 2 && (competences.length >= 3 || hasFormation)
  const variantB = experiences.length >= 1 && competences.length >= 5 && hasTitre
  if (variantA || variantB) {
    return { docType: 'cv', isNotCV: false, reason: 'cv_markers' }
  }

  // ── Règle 4 : Email générique + aucun marker fort → non-CV ────────────
  if (analyse?.email) {
    const emailLower = String(analyse.email).toLowerCase().trim()
    if (GENERIC_EMAIL_PREFIX.test(emailLower)) {
      return { docType: 'certificat', isNotCV: true, reason: 'email_generique' }
    }
  }

  // ── Règle 5 : Texte court + pas d'exp + pattern contenu ───────────────
  // Filet pour bulletins/permis/références/contrats qui n'ont pas été captés
  // par la règle 1 IA (si l'IA a dit 'cv' par erreur).
  if (textLen > 0 && textLen < 1500 && !hasExperiences) {
    const contentLower = (texteCV || '').slice(0, 2000).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const strictContentType: DocumentType | null =
      /bulletin de salaire|fiche de paie|lohnabrechnung/.test(contentLower) ? 'bulletin_salaire' :
      /permis de travail|permis de sejour|autorisation de travail|aufenthaltsbewilligung/.test(contentLower) ? 'permis' :
      /lettre de recommandation|lettre de reference|referenzschreiben/.test(contentLower) ? 'reference' :
      /contrat de travail|avenant au contrat|arbeitsvertrag/.test(contentLower) ? 'contrat' :
      null
    if (strictContentType) {
      return { docType: strictContentType, isNotCV: true, reason: 'content_pattern' }
    }
  }

  // ── Règle 6 : hasName + aucune exp → diplôme ──────────────────────────
  {
    const nom = (analyse?.nom || '').trim()
    const hasName = !!(nom && nom !== 'Candidat' && nom.length > 1)
    if (hasName && !hasExperiences) {
      return { docType: 'diplome', isNotCV: true, reason: 'no_experience' }
    }
  }

  // ── Règle 7 : Fallback IA document_type ───────────────────────────────
  // Si IA retourne 'autre' ou toute valeur ≠ 'cv' → conserver le verdict non-CV.
  const fallbackNotCv = iaDocType !== 'cv'
  return { docType: iaDocType, isNotCV: fallbackNotCv, reason: 'default' }
}
