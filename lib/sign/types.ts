// TalentFlow Sign — Types partagés
// v2.2.0 — Phase 1

export type SignStatus =
  | 'draft'
  | 'sent'
  | 'in_progress'
  | 'completed'
  | 'expired'
  | 'declined'
  | 'cancelled'

export type SignCategory = 'mappe' | 'contrat' | 'autres'

export type SignAuditAction =
  | 'created'
  | 'sent'
  | 'viewed'
  | 'consented'  // v2.2.0 Phase 3 — accepté CGU signature électronique
  | 'signed'
  | 'completed'
  | 'declined'
  | 'expired'
  | 'reminded'

// v2.2.0 Phase 2 — types champs positionnés (alignés DocuSign tabs)
export type SignFieldType =
  // SIGNATURE
  | 'signature'   // SignHere
  | 'initial'     // InitialHere — paraphe / initiales
  | 'date'        // DateSignedTab — date auto au moment de la signature
  // COORDONNÉES (auto-fillable depuis profil destinataire)
  | 'firstname'   // FirstNameTab
  | 'lastname'    // LastNameTab
  | 'fullname'    // FullNameTab
  | 'email'       // EmailAddressTab
  | 'company'     // CompanyTab
  | 'title'       // TitleTab — fonction / poste
  // ENTRÉES
  | 'text'        // TextTab — texte libre
  | 'number'      // NumberTab — champ numérique avec min/max/décimales
  | 'time'        // v2.9.82 — Heure simple HH:MM (+ bouton Maintenant / GPS optionnel)
  | 'pointage'    // v2.9.82 — Pointeuse jour : Début/Fin + pauses dynamiques + total auto + GPS
  | 'zone'        // v2.9.91 — Zone de travail (texte libre) : par jour (section) ou semaine
  | 'checkbox'    // CheckboxTab
  | 'select'      // ListTab — liste déroulante
  | 'annotation'  // NoteTab — aide contextuelle (pas un champ à remplir)
  // AUTRE
  | 'formula'     // FormulaTab — calcul référençant d'autres champs
  | 'attachment'  // AttachmentTab — upload de pièce jointe

export type SignFieldSource = 'manual' | 'docusign'

export interface SignField {
  id: string                    // uuid local, généré côté client
  type: SignFieldType
  page: number                  // 1-based
  // Coordonnées NORMALISÉES 0-1 par page (origine top-left)
  x: number
  y: number
  width: number
  height: number
  recipientOrder: number        // qui doit remplir (= recipients_schema[order].order)
  label: string                 // libellé interne / tabLabel DocuSign
  required?: boolean
  source: SignFieldSource

  // v2.2.0 Phase 2 — Options d'édition pour text / date / select
  readOnly?: boolean
  defaultValue?: string
  maxLength?: number            // pour text uniquement

  // v2.2.0 Phase 2 — Groupes de cases à cocher (logique min/max obligatoire)
  // Toutes les cases qui partagent le même groupId font partie du même groupe.
  // Le premier champ du groupe (par ordre d'ajout) porte les `group*` settings.
  groupId?: string
  groupName?: string
  groupRule?: 'SelectAtLeast' | 'SelectAtMost' | 'SelectExactly'
  groupMin?: number
  groupMax?: number

  // v2.2.0 Phase 2 — Logique conditionnelle
  // Liste de conditions (AND logique). Évaluées au signing time (Phase 4).
  // Ex: [{ triggerFieldId: 'nbEnfants', operator: 'equals', value: '0', action: 'unrequire' }]
  conditions?: SignFieldCondition[]

  // v2.2.0 Phase 2.5 — Sous-options par type
  // Numéro
  numberMin?: number
  numberMax?: number
  numberDecimals?: number      // 0 = entier ; 2 = max 2 décimales
  currency?: string            // 'CHF' | 'EUR' | 'USD' | '' — affichage seulement
  // Formule (calcul) — v2.2.0 (legacy free-text expression)
  formulaExpression?: string   // ex: "[Salaire1] + [Salaire2]" ou "[Quantité] * [Prix]"
  // v2.2.1 — Formule structurée (préférable au free-text car plus simple à éditer)
  /** Opération à appliquer aux champs sources.
   *  v2.9.82 — 'worktime' : sources = champs `time` (HH:MM) groupés par paires
   *  [début, fin, début, fin, …] → somme des (fin − début) en HEURES décimales.
   *  Pour un jour avec pause : [Entrée, Pause début, Pause fin, Sortie]. */
  formulaOp?: 'sum' | 'avg' | 'mul' | 'min' | 'max' | 'sub' | 'worktime'
  /** IDs des champs sources (number ou formula). L'ordre est respecté pour 'sub' (a - b - c). */
  formulaSourceIds?: string[]
  /** Nombre de décimales pour l'affichage du résultat (default 2) */
  formulaDecimals?: number
  // v2.9.82 — Champ `time` (timbrage)
  /** Si true, propose un bouton « Timbrer maintenant » (remplit l'heure courante). */
  timbrageButton?: boolean
  /** Si true, capture la position GPS au moment du timbrage (consentement navigateur). */
  captureGps?: boolean
  // Pièce jointe
  attachmentMaxSizeMb?: number
  attachmentMimeTypes?: string[]  // ['application/pdf', 'image/jpeg']
  attachmentMultiple?: boolean
  // v2.9.23 — Pièce jointe : id de la case à cocher cochée automatiquement
  // dès que le candidat charge un fichier (ex: « Copie CV » sur la fiche
  // d'inscription). Décochée si tous les fichiers sont retirés.
  attachmentLinkedCheckboxId?: string
  // v2.9.23 — Pièce jointe : id du `document_types` de la Conformité où classer
  // les fichiers chargés (à la finalisation, si l'enveloppe est liée à un
  // candidat). Vide / undefined = ne pas ajouter à la Conformité (ex: le CV).
  attachmentComplianceTypeId?: string
  // v2.9.27 — Pièce jointe : 'single' (1 fichier/photo, défaut) ou 'recto_verso'
  // (2 emplacements explicites Recto + Verso → 1 page A4 dans l'email).
  attachmentSides?: 'single' | 'recto_verso'
  // v2.9.46 — Pièce jointe : si true, à la finalisation, le 1er fichier image
  // chargé est aussi enregistré comme photo de profil du candidat, MAIS
  // uniquement si la fiche n'a pas encore de photo. Idéal pour une « photo selfie ».
  attachmentSetAsCandidatePhoto?: boolean
  // Date
  dateFormat?: string          // 'dd/MM/yyyy' | 'yyyy-MM-dd' | 'd MMMM yyyy' | 'MM/dd/yyyy'
  // Email
  validateEmailFormat?: boolean
  // Auto-fill (firstname/lastname/fullname/email/company/title)
  // Si true, le champ est pré-rempli depuis le profil destinataire au signing.
  autoFill?: boolean

  // v2.7.6 — Verrouille un champ auto-fill (firstname/lastname/email/company/title)
  // en lecture seule. Par défaut (undefined/false) le destinataire peut corriger
  // la valeur pré-remplie au cas où elle est fausse.
  autoFillLocked?: boolean

  // v2.7.6 — Source d'auto-remplissage pour les champs `number` (Numéro).
  // 'phone' = format téléphone (input avec + espaces accepté).
  // ⚠️ N'IMPLIQUE PLUS le pré-remplissage automatique du tél candidat (v2.9.58) —
  // utiliser `autoFillCandidatePhone` pour ça.
  autoFillSource?: 'phone'

  // v2.9.58 — Pré-remplir le champ avec le téléphone du candidat lié à l'enveloppe.
  // À cocher UNIQUEMENT sur le « Tél portable du candidat » — pas sur urgence,
  // conjoint, parent, etc. Si undefined : on utilise l'heuristique de
  // rétrocompatibilité (isCandidatePhoneField) basée sur les mots-clés du label.
  // Si explicitement false : pas de pré-remplissage (même si label « portable »).
  autoFillCandidatePhone?: boolean

  // v2.9.12 — Clé métier partagée entre templates pour autofill cross-template.
  // Ex: 'address', 'npa', 'ville', 'pays', 'avs', 'iban'. Si un autre template
  // déjà signé par le même email contient un field avec la même `crossTemplateKey`,
  // la valeur saisie y sera utilisée pour pré-remplir ce field-ci.
  // Le candidat peut toujours corriger la valeur pré-remplie.
  crossTemplateKey?: string

  // v2.2.0 Phase 2.5 — Formatage du texte rendu (texte/date/email/...)
  font?: string                    // 'Arial' | 'Helvetica' | 'Calibri' | 'Times' | 'Courier'
  fontSize?: number                // pt
  bold?: boolean
  italic?: boolean
  underline?: boolean
  fontColor?: string               // 'Black' | 'Blue' | 'Red' | hex

  // v2.2.0 Phase 2.5 — Validation regex (text/email/number)
  validationPattern?: string       // regex
  validationMessage?: string       // message d'erreur custom

  // v2.2.0 Phase 2.5 — Avancé
  tooltip?: string                 // texte help affiché au signataire (hover)

  // v2.4.0 — Annotation/instruction courte affichée INLINE entre le label et
  // l'input du champ (mode Wizard) ou en petit texte au-dessus de l'input
  // (mode Document). Différent de `tooltip` (qui s'affiche au hover) : helpText
  // est toujours visible. Max ~200 chars recommandé.
  helpText?: string

  // v2.9.28 — Masque le champ dans le wizard candidat. Le champ reste présent
  // en Mode Document et stampé sur le PDF, mais le candidat ne le voit pas.
  // Utile pour un champ rempli AUTOMATIQUEMENT (clé partagée / auto-fill) que
  // le candidat n'a pas besoin de saisir (ex: adresse déjà connue).
  wizardHidden?: boolean

  // v2.9.97 — Champ rempli dans le wizard + visible dans l'annexe « Détail des
  // pointages », mais NON tamponné sur le rapport PDF brut. Cas d'usage : Zone de
  // travail / pointeuse qu'on ne veut pas imprimer dans la grille du rapport.
  excludeFromPdf?: boolean

  // v2.9.28 — Lien hypertexte affiché à côté du champ dans le wizard. Le clic
  // ouvre `linkUrl` dans un nouvel onglet ; `linkLabel` est le texte affiché
  // (ex: « QUIZ »). Si le champ est une checkbox, le clic coche aussi la case.
  linkUrl?: string
  linkLabel?: string

  // v2.2.1 — Sous-groupe d'affichage dans une étape Wizard.
  // Utilisé pour grouper visuellement plusieurs fields autour d'une thématique.
  // Ex: "Lundi" sur tous les fields liés au lundi dans un rapport d'heures
  // → le Wizard affichera un sous-titre "Lundi" séparant ce groupe des autres.
  // Compatible avec les modes d'affichage 'list' et 'cards' du WizardStep.
  wizardSection?: string

  // v2.7.6 — Annotation/description affichée à côté du titre de la section dans
  // le wizard (italique gris). Synchronisée entre tous les fields du même
  // `wizardSection` (édition sur un field → patch sur tous les siblings).
  sectionDescription?: string

  // v2.9.51 — Signature pré-remplie en dur (type 'signature' / 'initial' uniquement).
  // Quand renseignée, cette image (data URL PNG) est stampée auto à la
  // finalisation, sans attendre qu'un destinataire signe ce champ. Idéal pour
  // dupliquer un template par consultant (1 template "João", 1 "Seb") avec
  // la signature consultant intégrée — le candidat est alors le seul à devoir
  // signer son propre champ. Pour qu'un destinataire (rôle / order) soit
  // « auto-signé » à l'envoi : il faut que TOUS ses champs signature/initial
  // aient un presetSignatureDataUrl. Cf. /api/sign/envelopes/[id]/send.
  presetSignatureDataUrl?: string | null

  /**
   * v2.9.72 — Aide visuelle attachée au champ : PDF ou image que le candidat
   * peut ouvrir depuis le wizard (bouton ℹ️ + texte custom à droite du label).
   * Stockée dans `templates/{templateId}/help/` (bucket talentflow-sign).
   * Servie au candidat via /api/sign/document/[token]?path=... (vérif token).
   */
  helpAttachment?: {
    /** Path Storage : `templates/{tplId}/help/{ts}_{filename}` */
    path: string
    /** MimeType (application/pdf, image/jpeg, image/png, image/webp) */
    mimeType: string
    /** Nom de fichier d'origine (pour Télécharger) */
    fileName: string
    /** Texte du bouton dans le wizard (ex: « Voir infos », « Cliquez ici »). Défaut : « Voir infos ». */
    buttonLabel?: string
  } | null

  // Métadonnées spécifiques (ex: DocuSign listItems pour 'select', tabType original)
  metadata?: Record<string, unknown>
}

// v2.9.23 — Valeur d'un champ `attachment` (pièce jointe), stockée dans
// sign_tokens.field_values[fieldId]. Un fichier = un objet SignAttachmentFile.
export interface SignAttachmentFile {
  /** Chemin Storage dans le bucket talentflow-sign (préfixe `uploads/`) */
  path: string
  /** Nom de fichier original */
  name: string
  /** Taille en octets */
  size: number
  mimeType?: string
  /** v2.9.23 — Lisibilité estimée par Claude Vision (feedback candidat) */
  readable?: 'ok' | 'poor' | 'unreadable'
  /** v2.9.23 — Date d'expiration extraite par Claude Vision (ISO yyyy-MM-dd) ou null */
  expiryDate?: string | null
}
export interface SignAttachmentValue {
  files: SignAttachmentFile[]
}

// Polices disponibles pour le rendu (DocuSign-like)
export const FONT_FAMILIES = ['Arial', 'Helvetica', 'Calibri', 'Times', 'Courier', 'Georgia', 'Verdana'] as const
export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36] as const
export const FONT_COLORS: { value: string; label: string; hex: string }[] = [
  { value: 'Black',  label: 'Noir',   hex: '#000000' },
  { value: 'Gray',   label: 'Gris',   hex: '#6B7280' },
  { value: 'Blue',   label: 'Bleu',   hex: '#1E40AF' },
  { value: 'Red',    label: 'Rouge',  hex: '#DC2626' },
  { value: 'Green',  label: 'Vert',   hex: '#15803D' },
  { value: 'Orange', label: 'Orange', hex: '#EA580C' },
]

// Formats date courants pour l'éditeur (cohérent DocuSign + Suisse)
export const DATE_FORMATS: { value: string; label: string }[] = [
  { value: 'dd/MM/yyyy',  label: 'jj/mm/aaaa (31/12/2026)' },
  { value: 'dd.MM.yyyy',  label: 'jj.mm.aaaa (31.12.2026) — Suisse' },
  // v2.2.4 — Formats courts sans année (utiles pour rapports d'heures, cellules étroites)
  { value: 'dd.MM',       label: 'jj.mm (31.12) — court Suisse' },
  { value: 'dd/MM',       label: 'jj/mm (31/12) — court' },
  { value: 'yyyy-MM-dd',  label: 'aaaa-mm-jj (2026-12-31) — ISO' },
  { value: 'd MMMM yyyy', label: '31 décembre 2026 — long' },
  { value: 'MM/dd/yyyy',  label: 'mm/jj/aaaa (12/31/2026) — US' },
  // v2.6.6 — Jour de la semaine (déduit automatiquement de la date)
  { value: 'EEEE',         label: 'Jour de la semaine (Lundi)' },
  { value: 'EEE',          label: 'Jour court (Lun)' },
  { value: 'EEEE dd.MM',   label: 'Jour + date (Lundi 11.05)' },
  // v2.6.9 — Numéro de semaine ISO (déduit automatiquement de la date)
  { value: 'Semaine WW',   label: 'Numéro de semaine (Semaine 20)' },
  { value: 'Sem. WW',      label: 'Semaine court (Sem. 20)' },
  { value: 'WW',           label: 'Numéro seul (20)' },
  { value: 'Semaine WW · yyyy', label: 'Semaine + année (Semaine 20 · 2026)' },
]

export const CURRENCIES = ['', 'CHF', 'EUR', 'USD', 'GBP'] as const

// v2.3.13 — Contraintes resize style DocuSign pour fields signature/initial.
// `ratio` = largeur/hauteur (3:1 pour signature, 1:1 carré pour initial).
// `minW`/`maxW` en coords NORMALISÉES (0-1) relatives à la largeur de page.
// La hauteur min/max est dérivée auto via `minW/ratio` et `maxW/ratio`.
//
// Appliqué dans :
//  - components/sign/FieldsCanvas.tsx (resize handle + tailles création par défaut)
export const SIGNATURE_CONSTRAINTS = {
  signature: { ratio: 3, minW: 0.15, maxW: 0.60 },
  initial:   { ratio: 1, minW: 0.04, maxW: 0.15 },
} as const

export const COMMON_MIME_TYPES: { value: string; label: string }[] = [
  { value: 'application/pdf',                                                                  label: 'PDF' },
  { value: 'image/jpeg',                                                                       label: 'JPEG' },
  { value: 'image/png',                                                                        label: 'PNG' },
  { value: 'image/heic',                                                                       label: 'HEIC' },
  { value: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',          label: 'DOCX' },
  { value: 'application/msword',                                                               label: 'DOC' },
  { value: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',                label: 'XLSX' },
]

// v2.9.12 — Presets de clés cross-template pour autofill entre templates signés
// par le même destinataire. L'admin peut aussi saisir une clé custom.
export const CROSS_TEMPLATE_KEYS: { value: string; label: string }[] = [
  { value: '',                  label: '— Aucune —' },
  { value: 'address',           label: 'Adresse (rue + n°)' },
  { value: 'npa',               label: 'NPA / Code postal' },
  { value: 'ville',             label: 'Ville / Localité' },
  { value: 'pays',              label: 'Pays' },
  { value: 'date_naissance',    label: 'Date de naissance' },
  { value: 'lieu_naissance',    label: 'Lieu de naissance' },
  { value: 'nationalite',       label: 'Nationalité' },
  { value: 'avs',               label: 'N° AVS' },
  { value: 'iban',              label: 'IBAN' },
  { value: 'tel_urgence',       label: 'Téléphone d\'urgence' },
  { value: 'nom_urgence',       label: 'Personne à contacter (urgence)' },
  { value: 'nom_conjoint',      label: 'Nom du conjoint' },
  { value: 'prenom_conjoint',   label: 'Prénom du conjoint' },
  { value: 'permis_type',       label: 'Type de permis' },
  { value: 'permis_expiration', label: 'Date d\'expiration permis' },
  { value: 'caisse_maladie',    label: 'Caisse maladie' },
]

export type SignConditionOperator =
  | 'equals'      // valeur déclencheur === value
  | 'notEquals'
  | 'gte'         // valeur déclencheur >= value (numérique)
  | 'lte'
  | 'gt'
  | 'lt'
  | 'isEmpty'     // déclencheur vide / non coché
  | 'isNotEmpty'

export type SignConditionAction =
  | 'require'      // rendre obligatoire
  | 'unrequire'    // rendre facultatif
  | 'show'         // afficher (non implémenté Phase 2 — Phase 4)
  | 'hide'         // masquer (non implémenté Phase 2 — Phase 4)
  | 'check'        // v2.7.7 — auto-cocher (checkbox uniquement). Le candidat peut override.
  | 'uncheck'      // v2.7.7 — auto-décocher (checkbox uniquement). Le candidat peut override.

export interface SignFieldCondition {
  triggerFieldId: string
  operator: SignConditionOperator
  value?: string
  action: SignConditionAction
}

export const CONDITION_OPERATOR_LABELS: Record<SignConditionOperator, string> = {
  equals:      'est égal à',
  notEquals:   'est différent de',
  gte:         '≥',
  lte:         '≤',
  gt:          '>',
  lt:          '<',
  isEmpty:     'est vide / non coché',
  isNotEmpty:  'est rempli / coché',
}

export const CONDITION_ACTION_LABELS: Record<SignConditionAction, string> = {
  require:    'rendre obligatoire',
  unrequire:  'rendre facultatif',
  show:       'afficher (Phase 4)',
  hide:       'masquer (Phase 4)',
  check:      'auto-cocher (case à cocher)',
  uncheck:    'auto-décocher (case à cocher)',
}

export interface PdfPageDimensions {
  page: number      // 1-based
  width: number     // pts
  height: number    // pts
}

export interface SignDocument {
  name: string
  storage_path: string
  order: number
  // v2.2.0 Phase 2 (rétrocompatible : optionnels)
  page_count?: number
  pdf_dimensions?: PdfPageDimensions[]
  fields?: SignField[]
  // v2.8.0 — Marqueur "papier à en-tête L-Agence appliqué à l'upload".
  // Persisté dans sign_envelopes.documents jsonb. Sert au badge UI ; le PDF
  // dans Storage contient déjà le logo+footer stampés (pas re-stampé à l'envoi).
  letterhead?: 'lagence'
  // v2.8.0 — Paths des 2 versions stockées (original + stampée) pour le toggle
  // stamp en temps réel côté UI sans nouvel appel serveur. `storage_path`
  // pointe sur l'une des deux selon le state du toggle.
  storage_path_original?: string
  storage_path_stamped?: string
}

export type SignViewMode = 'wizard' | 'document' | 'auto'

export interface SignRecipientSchema {
  role: 'signer' | 'cc' | string  // string pour rétrocompat
  order: number
  // v2.2.0 Phase 2
  name?: string
  email?: string
  roleName?: string               // libellé fonctionnel ("Candidat", "Employeur"...)
  required_fields?: string[]
  /** v2.2.2 — Mode d'affichage par défaut pour ce rôle au signing.
   *  'auto' (défaut) = wizard sur mobile / document sur desktop.
   *  'wizard' = formulaire pas-à-pas (idéal candidats / saisie longue).
   *  'document' = overlay PDF (idéal validation / signature seule). */
  preferredViewMode?: SignViewMode
  /** v2.8.10 — Index palette couleur (0-7). Si undefined → fallback sur `order`. */
  colorIdx?: number | null
}

export type SignDeliveryChannel = 'email' | 'whatsapp' | 'both'

export interface SignRecipient {
  /** Nom complet (= "firstName lastName" ou saisie libre) — utilisé pour affichage + emails. */
  name: string
  /** v2.2.1 — Prénom séparé. Utilisé pour pré-remplir les fields auto-fill `firstname`. */
  firstName?: string
  /** v2.2.1 — Nom séparé. Utilisé pour pré-remplir les fields auto-fill `lastname`. */
  lastName?: string
  email: string
  /** v2.2.5 Phase 4d — Numéro WhatsApp E.164 (+41791234567). Obligatoire si
   *  delivery_channel='whatsapp' ou 'both'. Persisté aussi dans sign_tokens.recipient_phone. */
  phone?: string | null
  /** 'signer' | 'cc' | string (legacy) — détermine si la personne doit signer ou recevoir une copie */
  role?: string
  /** v2.2.1 — Libellé fonctionnel libre (ex: "Candidat", "Consultant", "RH"). Pour info, pas pour logique. */
  roleName?: string
  order: number
  status?: 'pending' | 'sent' | 'viewed' | 'signed' | 'declined'
  signed_at?: string | null
  /** v2.2.2 — Mode d'affichage préféré au signing (override le défaut auto mobile/desktop).
   *  Provient soit du recipientsSchema du template, soit choisi par l'admin à l'envoi. */
  preferredViewMode?: SignViewMode
  /** v2.8.10 — Index palette couleur (0-7). Si undefined → fallback sur `order`. */
  colorIdx?: number | null
}

export type SignTemplateKind = 'envelope' | 'report'

export interface SignTemplate {
  id: string
  name: string
  description: string | null
  documents: SignDocument[]
  recipients_schema: SignRecipientSchema[]
  created_by: string | null
  created_at: string
  updated_at: string
  /** Phase 5 — 'envelope' (Sign classique) ou 'report' (rapport hebdo récurrent
   *  avec PDF L-Agence + 2 signataires fixes Candidat+Client). */
  kind?: SignTemplateKind
  /** v2.8.0 — Catégorie fonctionnelle : 'mappe' (général), 'contrat' (contrat
   *  de travail : permet d'uploader un PDF override à chaque envoi + toggle
   *  papier à en-tête L-Agence dans /sign/new), 'report' (rapport hebdo). */
  template_category?: 'mappe' | 'contrat' | 'report' | null
}

export interface SignEnvelope {
  id: string
  title: string
  template_id: string | null
  candidate_id: string | null
  status: SignStatus
  document_category: SignCategory
  recipients: SignRecipient[]
  message: string | null
  created_by: string | null
  sent_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  /** v2.2.5 Phase 4d — Canal d'envoi du lien de signature.
   *  'email' (défaut), 'whatsapp', ou 'both'. Si non-email, tous les recipients
   *  doivent avoir un phone E.164. */
  delivery_channel?: SignDeliveryChannel
  /** v2.2.5 Phase 4b — Liste des PDFs finaux stampés persistés post-completed.
   *  Source pour /api/sign/download/[envelopeId] et /api/sign/download/public/[token]. */
  signed_pdf_paths?: { name: string; path: string; sha256: string }[]
}

export interface SignToken {
  id: string
  envelope_id: string
  recipient_email: string
  recipient_name: string
  token: string
  expires_at: string
  used_at: string | null
  ip_address: string | null
  created_at: string
  // v2.2.0 Phase 3 — CGU
  terms_accepted_at?: string | null
  terms_accepted_ip?: string | null
  // v2.2.0 Phase 4a — signature
  signature_data_url?: string | null
  signature_method?: 'drawn' | 'typed' | 'auto' | null
  signed_at?: string | null
  signed_ip?: string | null
  field_values?: Record<string, unknown>
  // v2.2.5 Phase 4d — WhatsApp delivery
  recipient_phone?: string | null
}

export interface SignAuditEntry {
  id: string
  envelope_id: string
  recipient_email: string | null
  action: SignAuditAction
  ip_address: string | null
  user_agent: string | null
  metadata: Record<string, unknown>
  created_at: string
}

// UI helpers
export const STATUS_LABELS: Record<SignStatus, string> = {
  draft: 'Brouillon',
  sent: 'Envoyé',
  in_progress: 'En cours',
  completed: 'Signé',
  expired: 'Expiré',
  declined: 'Refusé',
  cancelled: 'Annulé',
}

// v2.2.2 — Labels FR pour le statut d'un destinataire (recipient.status)
export const RECIPIENT_STATUS_LABELS: Record<string, string> = {
  pending:  'En attente',
  sent:     'Envoyé',
  viewed:   'Consulté',
  signed:   'Signé',
  declined: 'Refusé',
}
export function recipientStatusLabel(s: string | undefined | null): string {
  if (!s) return 'En attente'
  return RECIPIENT_STATUS_LABELS[s] || s
}

// v2.4.9 — Label "Mappe" → "Général" : couvre tout type de document (mappe,
// CV, divers…) avec tous types de champs. "Contrat de travail" et "Autres"
// inchangés. La VALUE interne reste 'mappe' pour ne pas casser les envelopes
// existantes en DB.
export const CATEGORY_LABELS: Record<SignCategory, string> = {
  mappe: 'Général',
  contrat: 'Contrat de travail',
  autres: 'Autres',
}

export const DEFAULT_TOKEN_TTL_DAYS = 30

// v2.2.0 Phase 2 — Couleurs par destinataire (1-indexed sur recipientOrder)
// Palette DocuSign-like : couleurs RGB littérales (Konva ne résout pas var(--*))
// fillSoft = fond très doux du champ ; stroke = bordure ; text = couleur libellé.
// Cohérent avec le style DocuSign (Candidat bleu, Conseiller vert, etc.).
export interface RecipientColorPalette {
  stroke: string      // bordure du rect
  fill: string        // fond opacité ~22%
  fillSolid: string   // fond opacité haute (panel sidebar)
  text: string        // texte libellé à l'intérieur
  soft: string        // fond ultra-soft (panel sidebar destinataire actif)
}

export const RECIPIENT_COLORS: RecipientColorPalette[] = [
  // 0 — bleu (default Candidat)
  { stroke: '#4A90E2', fill: 'rgba(74,144,226,0.16)',  fillSolid: '#CCE5FF', text: '#1E40AF', soft: 'rgba(74,144,226,0.08)' },
  // 1 — vert (default Consultant)
  { stroke: '#7CB342', fill: 'rgba(124,179,66,0.18)',  fillSolid: '#DCEDC8', text: '#33691E', soft: 'rgba(124,179,66,0.08)' },
  // 2 — orange
  { stroke: '#F5A623', fill: 'rgba(245,166,35,0.20)',  fillSolid: '#FFE0B2', text: '#92400E', soft: 'rgba(245,166,35,0.08)' },
  // 3 — violet
  { stroke: '#A855F7', fill: 'rgba(168,85,247,0.18)',  fillSolid: '#E9D5FF', text: '#5B21B6', soft: 'rgba(168,85,247,0.08)' },
  // 4 — rose
  { stroke: '#EC4899', fill: 'rgba(236,72,153,0.18)',  fillSolid: '#FBCFE8', text: '#9D174D', soft: 'rgba(236,72,153,0.08)' },
  // v2.8.10 — 3 nouvelles couleurs pour les rôles supplémentaires
  // 5 — cyan
  { stroke: '#06B6D4', fill: 'rgba(6,182,212,0.18)',   fillSolid: '#CFFAFE', text: '#155E75', soft: 'rgba(6,182,212,0.08)' },
  // 6 — indigo
  { stroke: '#6366F1', fill: 'rgba(99,102,241,0.18)',  fillSolid: '#E0E7FF', text: '#3730A3', soft: 'rgba(99,102,241,0.08)' },
  // 7 — rouge
  { stroke: '#EF4444', fill: 'rgba(239,68,68,0.18)',   fillSolid: '#FEE2E2', text: '#991B1B', soft: 'rgba(239,68,68,0.08)' },
]

/**
 * v2.8.10 — Résout la palette couleur d'un destinataire.
 * Si le recipient/recipientSchema a un `colorIdx` explicite (0-7) → utilise.
 * Sinon → fallback sur l'index dans le tableau (modulo length).
 */
export function getRecipientPalette(
  rec: { colorIdx?: number | null; order?: number } | undefined | null,
  fallbackIdx: number = 0,
): RecipientColorPalette {
  const idx = (typeof rec?.colorIdx === 'number' && rec.colorIdx >= 0 && rec.colorIdx < RECIPIENT_COLORS.length)
    ? rec.colorIdx
    : (typeof rec?.order === 'number' ? rec.order % RECIPIENT_COLORS.length : fallbackIdx % RECIPIENT_COLORS.length)
  return RECIPIENT_COLORS[idx]
}

export const FIELD_TYPE_LABELS: Record<SignFieldType, string> = {
  // Signature
  signature:  'Signature',
  initial:    'Paraphe',
  // v2.2.4 — Renommé "Date de signature" → "Date" (utilisable comme cellule date
  // normale. L'auto-fill date-du-jour est uniquement actif si metadata.tabType==='datesigned'
  // (legacy DocuSign import) — sinon c'est un date input normal saisissable + auto-fill
  // par wizardSection si "Lundi"/"Mardi"/etc. configuré.
  date:       'Date',
  // Coordonnées
  firstname:  'Prénom',
  lastname:   'Nom',
  fullname:   'Nom complet',
  email:      'E-mail',
  company:    'Société',
  title:      'Fonction',
  // Entrées
  text:       'Texte',
  number:     'Numéro',
  time:       'Heure (HH:MM)',
  pointage:   'Pointeuse (timbrage)',
  zone:       'Zone de travail',
  checkbox:   'Case à cocher',
  select:     'Liste',
  annotation: 'Annotation',
  // Autre
  formula:    'Formule',
  attachment: 'Pièce jointe',
}

// Catégories pour la toolbar de l'éditeur
export const FIELD_TYPE_CATEGORIES: { key: string; label: string; types: SignFieldType[] }[] = [
  // v2.2.4 — date déplacé dans Entrées (utilisé comme cellule date saisissable
  // dans la majorité des cas, ex: rapports d'heures jour par jour).
  { key: 'signature',  label: 'Signature',   types: ['signature', 'initial'] },
  { key: 'identity',   label: 'Coordonnées', types: ['firstname', 'lastname', 'fullname', 'email', 'company', 'title'] },
  { key: 'entries',    label: 'Entrées',     types: ['text', 'number', 'zone', 'date', 'checkbox', 'select', 'annotation'] },
  { key: 'other',      label: 'Autre',       types: ['formula', 'attachment'] },
]

// Auto-fill : ces types sont remplis automatiquement par DocuSign depuis le profil
// du destinataire (Phase 4 = signing time). Read-only par défaut.
export const AUTO_FILL_FIELD_TYPES: SignFieldType[] = [
  'firstname', 'lastname', 'fullname', 'email', 'company', 'title', 'date',
]
