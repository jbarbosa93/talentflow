// TalentFlow Version Configuration
// Convention: v0.X.Y — X = feature group, Y = bugfix/polish

export const APP_VERSION = 'v0.9.0'
export const APP_ENV: 'beta' | 'production' = 'beta'
export const APP_NAME = 'TalentFlow'

export interface ChangelogEntry {
  version: string
  date: string
  label?: string
  features: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'v0.9.0',
    date: '2026-03-21',
    label: 'Photos & Logs',
    features: [
      'Extraction photos intelligente avec scoring (portraits uniquement)',
      'Correction photos en masse depuis Parametres',
      'Logs d\'activite avec pagination et filtre erreurs',
      'Upload/suppression de photo candidat',
      'Age plus visible sur les fiches candidats',
      'Dropdown pagination deplace en haut',
      'Filtres avances ameliores (Permis de Conduire)',
    ],
  },
  {
    version: 'v0.8.0',
    date: '2026-03-18',
    label: 'Import en masse',
    features: [
      'Import en masse de milliers de CVs (ZIP, dossiers)',
      'Traitement concurrent avec web worker (6 threads)',
      'Detection de doublons automatique',
      'Gestion des erreurs avec retry automatique',
      'Progression temps reel dans la sidebar',
      'Export CSV des resultats d\'import',
      'Categories automatiques par dossier',
    ],
  },
  {
    version: 'v0.7.0',
    date: '2026-03-14',
    label: 'Securite & Email',
    features: [
      'Authentification 2FA par email (OTP HMAC-SHA256)',
      'SMTP Resend pour emails transactionnels',
      'Templates email en francais (Supabase)',
      'Deconnexion securisee (cookies httpOnly)',
      'Systeme de demandes d\'acces',
    ],
  },
  {
    version: 'v0.6.0',
    date: '2026-03-10',
    label: 'Microsoft 365',
    features: [
      'Integration Microsoft 365 (OAuth 2.0)',
      'Synchronisation emails Outlook',
      'Import automatique de CVs depuis emails',
      'Creation de candidats depuis pieces jointes',
      'Deconnexion Microsoft',
    ],
  },
  {
    version: 'v0.5.0',
    date: '2026-03-05',
    label: 'Communications',
    features: [
      'Envoi d\'emails aux candidats',
      'Templates d\'email personnalisables',
      'Integration WhatsApp Business',
      'Envoi SMS/iMessage',
      'Historique des communications',
    ],
  },
  {
    version: 'v0.4.0',
    date: '2026-02-28',
    label: 'Pipeline & Matching',
    features: [
      'Pipeline Kanban (drag & drop)',
      'Etapes : Nouveau, Contacte, Entretien, Place, Refuse',
      'Matching IA candidat/offre (score detaille)',
      'Recherche semantique IA (Claude)',
      'Gestion des entretiens (planning, types, statuts)',
    ],
  },
  {
    version: 'v0.3.0',
    date: '2026-02-20',
    label: 'Offres & Dashboard',
    features: [
      'Creation et gestion des offres d\'emploi',
      'Publication vers Job-Room.ch',
      'Dashboard KPI (candidats, offres, entretiens, places)',
      'Carte geographique des candidats',
      'Widget candidats recents',
    ],
  },
  {
    version: 'v0.2.0',
    date: '2026-02-12',
    label: 'IA & CV',
    features: [
      'Analyse de CV par Claude AI',
      'Extraction automatique : nom, email, telephone, competences',
      'Support PDF, DOCX, DOC, TXT, JPG, PNG',
      'Preview CV avec zoom, scroll, pan',
      'Stockage Supabase Storage',
      'Extraction de photos depuis les PDFs',
    ],
  },
  {
    version: 'v0.1.0',
    date: '2026-02-01',
    label: 'Fondations',
    features: [
      'Architecture Next.js 14 + Supabase',
      'Authentification email/mot de passe',
      'Liste des candidats avec recherche et filtres',
      'Fiche candidat detaillee',
      'CRUD candidats complet',
      'Interface L\'Agence SA (theme noir & jaune)',
      'Parametres utilisateur',
      'Navigation sidebar',
    ],
  },
]
