// TalentFlow Version Configuration
// Convention: MAJOR.MINOR.PATCH (semver)
//
// Le CHANGELOG in-app est volontairement condensé par PHASES (1 entrée par thème majeur),
// pas par patch. Les détails ligne-à-ligne vivent dans CHANGELOG.md (racine du repo).

export const APP_VERSION = '1.9.65'
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
    version: '1.9.65',
    date: '2026-04-20',
    label: 'Pack UX — mailing, dark mode, modals, pipeline, historique, dev localhost',
    features: [
      'RÈGLE MÉTIER — email / téléphone / localisation désormais ÉCRASÉS sur UPDATE (manuel + OneDrive). DDN et genre restent IMMUABLES.',
      'BADGES COLORÉS 3 types sur liste candidats : 🟢 Nouveau / 🟡 Réactivé / 🔵 Actualisé — source manuelle (localStorage 10min) + OneDrive (DB persistant jusqu\'à ouverture fiche).',
      'MAILING — refonte liste candidats : 1 ligne compacte par candidat (nom · métier · 3 actions). Hover "CV original" → preview iframe portalisée. Bouton "CV original" dans CVCustomizer à côté de Réinitialiser avec même hover preview.',
      'MAILING — distances clients quasi-instantanées : localStorage cache persistant (tf_geocode_cache_v1), géocoding batch parallèle sur clients visibles seulement (pas 500+), delays Nominatim divisés par 3.',
      'MAILING — input "Distance depuis..." : fond jaune hardcodé #FFFBEB → var(--primary-soft), border → var(--primary). Lisible dark mode.',
      'MAILING — historique : campagne_id partagé côté UI → 1 card par envoi multi-destinataires (au lieu de N). Couleurs badge CV personnalisé + chips candidats/destinataires rénovées (fin du jaune sur jaune light mode). DELETE /api/emails/history : vider tout + supprimer par ligne.',
      'MATCHING IA — bouton "Rechercher les meilleurs candidats" dark mode : var(--foreground)/white → var(--primary)/var(--primary-foreground). Contraste propre.',
      'DOCUMENTS — card CV : bg var(--muted) (même couleur que muted-foreground = invisible) → var(--primary-soft) brand. "Autre" → var(--secondary). Dropdown "Déplacer vers..." flip vers le haut si dépasse viewport + maxHeight + scroll interne.',
      'FICHE CANDIDAT — placeholder photo light mode : bg var(--muted) = text var(--muted-foreground) (même couleur #64748B) → initiales invisibles. Swap vers var(--secondary) + var(--foreground) + border.',
      'PIPELINE — aperçu CV au hover : positionnement vertical aligné sur la card (y clampé au viewport) au lieu de top:20/bottom:20 qui le collait en haut de l\'écran.',
      'MODALS — Nouvelle commande / Modifier commande passés en sm:max-w-3xl + max-h-[90vh] + textareas 160/120px. Modal clients 640→820px. Modal missions 520→900px.',
      'BOUTONS JAUNE BRAND — .neo-btn-yellow color: var(--ink) (=var(--foreground), devenait clair en dark) → var(--primary-foreground) (toujours sombre). 6 fichiers nettoyés (color:white sur bg:primary → color:primary-foreground).',
      'LISTE CANDIDATS — debounce recherche 300ms → 150ms. Prefetch automatique de la page suivante (queryClient.prefetchQuery) → clic "suivante" instantané. Couplé avec placeholderData existant, zéro flicker entre pages/filtres.',
      'DEV LOCALHOST — /admin refondu : purge des cookies sb-* + magiclink → fin définitive du HTTP 431. NODE_OPTIONS=--max-http-header-size=65536 dans npm run dev. Suppression ALLOW_DEV_BYPASS (cause racine du "UI sans candidats" en dev).',
      'PDF — logo L-AGENCE officiel (public/logo-lagence.png) dans "Rapport de travail" — aligné sur le CV brandé.',
      'FIX — archivage [Ancien] uniforme (cv/parse + onedrive/sync), textMatch sans guard hash/size (duplicates type Luce), created_at dans SELECT update, await invalidateQueries avant dispatchBadgesChanged, normalisation genre dans merge-candidat.',
      'CHANGELOG condensé : CHANGELOG.md 575→285 lignes + lib/version.ts 1715→130 lignes. Historique regroupé par phases thématiques au lieu de 90 entrées patch.',
    ],
  },
  {
    version: '1.9.40 → 1.9.64',
    date: '2026-04-19',
    label: 'Refonte dashboard + dark mode complet + polish badges',
    features: [
      'DASHBOARD — Header riche + 3 badges cliquables (À traiter / Rappels / Alertes), KPIs dynamiques (4 pour João avec ETP Missions), pipeline par consultant segmenté par métier, chart imports BarChart, widgets Activité récente + Top 10 villes, panel Mes rappels 2 onglets, questionnaire phrases 1er login (4 styles), avatar animé WavingAvatar, semaine ISO.',
      'DARK MODE — :root = LIGHT / .dark = DARK (2 jeux OKLCH distincts), nouveaux tokens --success / --warning / --info / --destructive / --*-foreground / --*-soft. classList.add(\'dark\') active Tailwind dark:*. ~350 hex hardcodés remplacés par var(--token) sur 27+ fichiers.',
      'TOPBAR — Bouton "Importer candidat" global sur toutes les pages dashboard, suppression split isOnCandidats + bouton sync Microsoft retiré. /parametres redirect direct vers /parametres/profil, sous-page /parametres/metiers, fusion Mon profil sidebar.',
      'BADGES per-user STRICTS — last_import_at TIMESTAMPTZ (remplace has_update bool global), hasBadge() DB source de vérité (fin UNION localStorage), debounce sidebar 500ms → 50ms, boutons Marquer vu / Non vu conditionnels.',
      'SHA256 CV — cv_sha256 + cv_size_bytes + index partiel. contenuIdentique = hashMatch || sizeMatch || textMatch (filename matching banni). Backfill one-shot ~10min + cron hebdo check-sha256-integrity.',
      'MATCHING — Pending Validation OneDrive (score 8-10 → validation manuelle), table decisions_matching (dataset ML futur), détection doublons déterministe (RPC 4 catégories SQL), merge intelligent (lib/merge-candidat.ts : IMMUABLES / MERGE / ÉCRASÉS), seuil strictExact 5 → 8 (fin écrasement homonymes).',
      'CLASSIFICATION — lib/document-classification.ts source unique CV/non-CV, filename matching BANNI définitivement. Fix extraction photo uniqueColors < 40, IA noms composés portugais/espagnols préservés.',
      'OBSERVABILITÉ — admin_detect_anomalies() v2 + résolution collaborative (anomalies_resolved), AlertsBanner 3 boutons + historique 50, banc DRY-RUN OneDrive mode live Graph.',
      'DIVERS — Historique envois email par campagne per-user, alerte doublon renforcée (per-user + 30j), veille offres suspendue, Speed Insights, ETP Missions unifié (lib/missions-etp.ts), fix 3 bugs critiques imports, 6 modals via createPortal.',
    ],
  },
  {
    version: '1.9.10 → 1.9.39',
    date: '2026-04-18',
    label: 'Matching hardening + veille offres + observabilité',
    features: [
      'VEILLE OFFRES — Scraping Apify jobs.ch / jobup.ch / Indeed CH (27 requêtes × 3 sources), Suisse romande uniquement, détection agences (60+ mots-clés), modération 3 onglets + badge sidebar, cron 6h.',
      'CDC VIEWER — Upload dans bucket cvs/cdc/, colonne offres.cdc_url, modal portalisé (PDF/image via iframe, DOCX via Office Web Viewer).',
      'MATCHING IA — Déterminisme (tiebreaker candidat.id), combobox offres, cv_texte_brut 1500 → 2500 chars, bonus localisation +6 ville / +4 canton (26 cantons), pénalité ancienneté, normalisation compétences. Logo L-AGENCE PNG dans cv-generator.ts.',
      'SIGNATURE EMAIL — Outlook personnalisable user_metadata.signature_html, bucket public-assets, preset dynamique par prénom consultant, templates SMS en masse avec variables [MÉTIER]/[LIEU], WhatsApp fiche candidat avec signature.',
      'MATCHING REFONTE identité-first — 5 étapes (présélection → reject DDN → scoring → filtre → tiebreak), scoring pondéré (DDN=+10, tel9=+8, email=+8, nom_exact=+5, nom_subset=+3, ville=+3). Fail-safe DDN immutable, wordsOverlapExact, collision tel9 seule insuffisante. Modale confirmation sur match détecté + cache 5min.',
      'ANOMALIES — admin_detect_anomalies() 3 familles, AlertsBanner /integrations, route DRY-RUN /api/onedrive/sync-test, TestFolderRunner.',
      'CLEANUP — Fix RLS pipeline_rappels (policy SELECT filtrée user_id), refetchOnWindowFocus, suppression cv/bulk + sharepoint/import (854 lignes orphelines), /api/cv/parse = route unifiée d\'import, lib/document-classification.ts + lib/normalize-candidat.ts.',
      'FIXES — Timer inactivité (4 chemins login), 3 bugs imports (non-CVs fantômes, memeTexte 500 → 2000, attachmentMode cv/parse), extraction photo rigoureuse, prompt IA enrichi noms composés.',
    ],
  },
  {
    version: '1.8.13 → 1.9.9',
    date: '2026-04-15',
    label: 'Audit sécurité + logique import CV finalisée + cv_texte_brut',
    features: [
      'AUDIT DB — 8 fixes : index dupliqué, auth.uid() → (select auth.uid()) sur 8 policies, search_path = public sur 7 fonctions, tables fantômes supprimées, 3 index FK ajoutés, vues SECURITY INVOKER.',
      'SÉCURITÉ — requireAuth() sur 51 routes API (middleware exclut /api/*), SMTP AES-256-GCM (lib/smtp-crypto.ts), RLS sur 33 tables, Sentry, timer inactivité 2h, 14 <img> → <Image> Next.js.',
      'IMPORT CV FINAL — Logique Skip / Réactivé / Update / Archive déterministe, has_update → last_import_at per-user, normFn noms fichiers (Storage encode espaces en underscores), fix [Ancien]/[Archive] promotion, DEFAULT \'nouveau\' supprimé sur statut_pipeline + 21 fantômes nettoyés.',
      'CV_TEXTE_BRUT + VISION IA — Colonne alimentée par 3 pipelines (manuel, masse, OneDrive). Vision Claude Haiku fallback PDFs scannés + JPG/PNG via URL (pas de limite taille). Marqueurs [scan-non-lisible] / [pdf-chiffre]. Cron */5min extract-cv-text batch 20 + card Outils.',
      'MISSIONS — Colonnes vacances et arrets JSONB, badges colorés par priorité (arrêt orange, vacances bleu, absence jaune, début bientôt, fin mission), ETP prorata déduit absences/vacances/arrêts.',
    ],
  },
  {
    version: '1.5.0 → 1.8.12',
    date: '2026-04-12',
    label: 'Module Secrétariat + détection doublons + missions',
    features: [
      'SECRÉTARIAT — Dashboard séparé (rôle Secrétaire), 6 tables (candidats, accidents, ALFA, paiements, loyers, notifications), import Excel batch (430 + 113 + 180 + 76 + 2 lignes), historique modifications, notifications auto+manuelles avec badge sidebar, WhatsApp + lien fiche candidat partout.',
      'DOUBLONS — Détection instantanée sans IA : email score 100, téléphone normalisé +41 score 95, nom+prénom score 85. Historique DB (doublons_historique), fusion guidée champ par champ.',
      'MISSIONS — CRUD complet + stats marge brute/coefficient + bilan mensuel, jours fériés cantonaux (Easter algo, lib/jours-feries.ts), import Notion flexible, sync Quadrigis avec validation manuelle (missions_pending). Sidebar adminOnly.',
      'NAVIGATION — Pipeline consultant obligatoire (erreur 400), ?from=pipeline|missions|secretariat sur fiche candidat, scroll sur .d-content (PAS window), recherche client Zefix → Claude web_search.',
    ],
  },
  {
    version: '1.0.0 → 1.4.0',
    date: '2026-04-07',
    label: 'Fondations TalentFlow',
    features: [
      'STACK — Next.js 16 (App Router) + React 19 + TypeScript 5 + Tailwind 4, Supabase (PostgreSQL + RLS) + Auth OTP 2FA, déploiement Vercel Pro région dub1.',
      'CORE — Candidats (6000+), clients (1200+), pipeline 3 colonnes, entretiens, missions, import masse ZIP/PDF/Word avec OCR fallback Vision IA.',
      'PARSING CV — Multi-modèle (Claude Anthropic, Google Gemini, Groq).',
      'INTÉGRATIONS — Microsoft 365 OAuth (Outlook multi-compte), emails/SMS/WhatsApp (Resend + SMTP fallback + WhatsApp Business API), France Travail (formulaire Word pré-rempli).',
      'FEATURES — Matching IA candidats ↔ offres + historique, timeline activité, doublons guidés, normalisation affichage (Prénom Nom, email lowercase, ville capitalisée).',
    ],
  },
]
