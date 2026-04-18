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
// et les signaux sémantiques (email générique entreprise).

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
    experiences?: unknown[] | null
  }
  texteCV: string
}

export interface ClassificationResult {
  docType: DocumentType
  isNotCV: boolean
  reason: 'ia' | 'content_pattern' | 'email_generique' | 'no_experience' | 'default'
}

// Préfixes d'email qu'un candidat n'utilise jamais pour postuler
// (boîtes génériques d'entreprise → document tiers certif/attestation/contrat).
const GENERIC_EMAIL_PREFIX = /^(info|contact|rh|hr|hrdirektion|personal|sekretariat|secretariat|admin|direction|accueil|reception|office)@/

export function classifyDocument({ analyse, texteCV }: ClassificationInput): ClassificationResult {
  let docType: DocumentType = ((analyse?.document_type as DocumentType) || 'cv')
  let isNotCV = !!docType && docType !== 'cv'

  // ── 1. Second avis contenu — patterns sémantiques du texte ─────────────
  // Slice 2000 chars (le titre "Certificat de travail" apparaît souvent après
  // l'en-tête entreprise + adresse + date). Patterns multi-mots UNIQUEMENT.
  if (!isNotCV || docType === 'autre') {
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

  // ── 2. Signal email générique d'entreprise ──────────────────────────────
  // info@/contact@/rh@/hr@ → boîte générique, JAMAIS un candidat qui postule.
  // Couvre les scans (certificats) où Vision IA extrait un email entreprise.
  if (!isNotCV && analyse?.email) {
    const emailLower = String(analyse.email).toLowerCase().trim()
    if (GENERIC_EMAIL_PREFIX.test(emailLower)) {
      return { docType: 'certificat', isNotCV: true, reason: 'email_generique' }
    }
  }

  // ── 3. Bug 1 v1.9.32 — un CV légitime a au moins 1 expérience pro ──────
  // Un document avec juste un nom mais aucune expérience extraite est un
  // diplôme/certificat/attestation, pas un CV.
  if (!isNotCV) {
    const hasExperiences = Array.isArray(analyse?.experiences) && (analyse.experiences as unknown[]).length > 0
    const nom = (analyse?.nom || '').trim()
    const hasName = !!(nom && nom !== 'Candidat' && nom.length > 1)
    if (hasName && !hasExperiences) {
      return { docType: 'diplome', isNotCV: true, reason: 'no_experience' }
    }
  }

  // ── 4. Par défaut : classification IA conservée ─────────────────────────
  return { docType, isNotCV, reason: isNotCV ? 'ia' : 'default' }
}
