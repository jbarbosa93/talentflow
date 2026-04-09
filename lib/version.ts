// TalentFlow Version Configuration
// Convention: MAJOR.MINOR.PATCH (semver)

export const APP_VERSION = '1.5.6'
export const APP_ENV: 'beta' | 'production' = 'production'
export const APP_NAME = 'TalentFlow'

export interface ChangelogEntry {
  version: string
  date: string
  label?: string
  features: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.5.6',
    date: '2026-04-08',
    label: 'Documents modal centré + Pipeline redesign + UI fixes',
    features: [
      'Documents : panel latéral → modal centré (createPortal, position: fixed, animation scaleIn)',
      'Documents : s\'affiche correctement peu importe le scroll ou les animations Framer Motion parentes',
      'Candidats : barre de sélection multi — 2 rangées, couleurs distinctes par action, glow orange correct',
      'Candidats : bouton "Ajouter au Pipeline" dans la sélection (onglet Actif uniquement)',
      'Candidats : tooltip notes — jusqu\'à 3 notes avec date + séparateur',
      'Pipeline : colonnes flex:1 (remplissent l\'espace), 2 cards par colonne, mode liste supprimé',
      'Pipeline : notes toujours visibles sur les cards, actions au survol uniquement',
      'Fix : photos pipeline — handler onError avec fallback initiales',
      'Fix : RLS app_settings — sauvegarde étapes via /api/pipeline/stages + createAdminClient()',
      'Fix : glow inputs — orange rgba(245,167,35,0.15) au lieu du jaune fluo',
      'Fix : métier sync liste ↔ fiche (invalidation queryKey manquante)',
      'Fix : CV preview — createPortal pour échapper Framer Motion transform',
    ],
  },
  {
    version: '1.5.5',
    date: '2026-04-08',
    label: 'Fix badges, CV preview, MetierPopover, notes tooltip',
    features: [
      'Fix : badge sidebar candidats — #EF4444 rouge au lieu de #F5A623 orange',
      'Fix : badge non-vus onglets — z-index 50, visible au-dessus du bouton "À traiter"',
      'Fix : aperçu CV — panneau centré sur la card via e.clientY + ref DOM directe (bypass React), panelH max 55vh/520px',
      'Fix : tooltip notes — createPortal dans document.body, position fixed viewport-aware',
      'Fix : MetierPopover — createPortal + anchorRect au clic, position fixed z-index 9999',
      'Fix : Sidebar.tsx — #FFE800 → #F5A623 (2 occurrences)',
    ],
  },
  {
    version: '1.5.3',
    date: '2026-04-08',
    label: 'Revert UI redesign + Fix MetierPopover',
    features: [
      'Revert : couleur primaire #FFE800 → #F5A623 (retour à l\'orange original)',
      'Revert : tokens CSS — suppression blocs dark/light séparés, retour au :root original',
      'Revert : sidebar — suppression gradient, border-left nav links, transitions cubic-bezier',
      'Revert : boutons — .neo-btn border-radius 100px, .neo-btn-yellow border noire + shadow brutalist',
      'Revert : KPI cards dark — suppression backdrop-filter blur',
      'Fix : MetierPopover — position fixed + z-index 9999, plus caché derrière les cards',
    ],
  },
  {
    version: '1.5.2',
    date: '2026-04-08',
    label: 'Sécurité RLS + Pipeline enrichi',
    features: [
      'Sécurité : RLS activé sur 5 tables (candidats, app_settings, email_otps, jobs, onedrive_fichiers) avec policies service_role + authenticated',
      'Pipeline : recherche dans le board (champ manquant corrigé)',
      'Pipeline : cards enrichies — photo, téléphone cliquable, badges CFC/Engagé, avatar 44px, nom 14px',
      'Pipeline : mode grille (2 cards côte à côte, toggle liste/grille persisté en localStorage)',
      'Pipeline : scroll horizontal amélioré — gradient fade, scrollbar fine stylée 6px',
      'Pipeline : icône Aperçu CV différenciée (FileText au lieu de Eye dupliqué)',
    ],
  },
  {
    version: '1.5.1',
    date: '2026-04-08',
    label: 'Fix sync métier liste ↔ fiche',
    features: [
      'Fix : métier assigné depuis la liste candidats maintenant reflété immédiatement à l\'ouverture de la fiche (invalidation queryKey [\'candidat\', id] manquante)',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-04-08',
    label: 'OneDrive Sync v2 — Refonte complète',
    features: [
      'Historique fichiers groupé par jour (accordion, 5 catégories : créés / mis à jour / réactivés / documents / erreurs)',
      'Catégorisation automatique des documents non-CV (Certificat · Diplôme/Formation · Lettre de motivation · Permis · Référence · Contrat · Bulletin de salaire)',
      'Rapport de synchronisation détaillé (créés / mis à jour / réactivés / déjà à jour / erreurs)',
      'Identification robuste — 5 méthodes, insensible aux accents, tolérance prénom préfixe, désambiguïsation multi-candidats',
      'Logique mise à jour CV basée sur le contenu (500 chars) — SKIP / réactivation / update complet',
      'Batch 50 CVs/cycle, auto-refresh 5s/30s, retry automatique documents "candidat introuvable"',
      'Fix boucle infinie : memeDate cassé (format Z vs +00:00) + certificats retentés à l\'infini',
      'Fix race condition lors d\'imports parallèles, déduplication suffixes [45]/(45)',
      'Fix cron : Authorization header manquant → 401 permanent',
      'Fix filtre "Non vus" perdu au retour de la fiche candidat',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-04-07',
    label: 'Entretiens, Hardening & Activités',
    features: [
      'Entretiens / Suivi : page redessinée en vue liste, rappels avec date, notifications popup, badge sidebar',
      'Outil "Corriger photos" : extraction batch DOCX/DOC/PDF, UI 3 boutons, historique portraits cliquables',
      'Activités : logs unifiés (table activites), WhatsApp loggué, fusion doublons loggée, recherche PostgreSQL',
      'Badges "non vus" animés par onglet (Actif / À traiter / Archivé)',
      'Sync cache liste ↔ fiche (CFC, engagé, étoiles, notes)',
      'Fix recherche : URL overflow 650+ IDs, filtres CFC et Déjà engagé serveur-side',
      '15 corrections hardening : rate limiting, circuit breaker, FK cascade, PDFs chiffrés, RLS, erreurs masquées',
      'Dark mode : corrections dans Paramètres, Profil, Logs, Doublons, Intégrations, Documents',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-03-29',
    label: 'Mobile, France Travail & Planning',
    features: [
      'Mobile : layout responsive complet, HEIC/HEIF, touch, boutons agrandis, viewer CV masqué sous 768px',
      'France Travail : formulaire Word fidèle, envoi Resend, CC automatique, historique des envois',
      'Planning : refonte majeure — périodes, ETP par semaine, marge horaire, tri colonnes, candidats hors-système',
      'Parsing IA : détection date naissance, genre, permis, documents non-CV (certificats, permis nacelle…)',
      'Doublons : carte enrichie (photo, expériences, stats, badge source)',
      'Cross-device : "Tout marquer vu" synchronisé, OTP grace 4h (cookie httpOnly HMAC-SHA256)',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-03-24',
    label: 'OneDrive v1, Doublons & Mailing',
    features: [
      'OneDrive Sync v1 : récursif, smart update (mise à jour / réactivation), images JPG/PNG/WebP',
      'Doublons : fusion atomique (RPC), actions individuelles, ré-analyse par paire',
      'Mailing géographique : filtre distance, tri km, badge code-couleur, CV personnalisé en PJ via Microsoft Graph',
      'Activités : timeline collaborative, filtres type/date, onglets Pipeline/Messages/Candidats/Imports',
      'Métiers : partagés via Supabase, catégories colorées, filtre avancé',
      'Recherche booléenne ET/OU/SAUF, filtre étoiles, badges CFC, dates de fichier DD.MM.YYYY',
      'Outlook per-user : chaque utilisateur connecte son propre compte',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-03-22',
    label: 'Import IA, Recherche & Documents',
    features: [
      'Import IA multi-modèle (Claude, Gemini, Groq), parsing masse ZIP/PDF/DOCX/DOC en arrière-plan',
      'Classification IA : CV, certificat, diplôme, formation, attestation, permis',
      'Recherche full-text PostgreSQL (compétences, expériences, formations, CV brut, résumé IA)',
      'Pagination serveur (20/50/100), page mémorisée, filtres avancés (permis, genre, âge, langue)',
      'Panel Documents : catégories, drag & drop, CV principal, upload depuis la fiche',
      'Zoom CV qualité HD (iframe agrandie, scroll, drag, rotation)',
      'Score étoiles 0-5, crop photo manuel, re-parsing additif',
      'Module Clients : 1207 entreprises, fiche, filtres, recherche',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-03-21',
    label: 'Version stable initiale',
    features: [
      'Candidats : CRUD complet, fiche détaillée, CV viewer, photos, doublons, pipeline Kanban',
      'Import CV : PDF/DOCX/DOC, parsing IA (Claude), extraction photo, détection doublons',
      'Pipeline Kanban : drag & drop, étapes, matching IA candidat/offre',
      'Communications : email (Resend/SMTP), WhatsApp Business, SMS, templates',
      'Microsoft 365 OAuth : synchronisation Outlook, import CVs depuis emails',
      'Authentification OTP email (HMAC-SHA256), gestion des accès',
      'Interface L\'Agence SA (thème noir & jaune), dark mode, sidebar',
    ],
  },
]
