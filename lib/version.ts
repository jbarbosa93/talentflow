// TalentFlow Version Configuration
// Convention: MAJOR.MINOR.PATCH (semver)
//
// Le CHANGELOG in-app est volontairement condensé par PHASES (1 entrée par thème majeur),
// pas par patch. Les détails ligne-à-ligne vivent dans CHANGELOG.md (racine du repo).

export const APP_VERSION = '1.9.72'
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
    version: '1.9.72',
    date: '2026-04-22',
    label: 'Fixes rapides v1.9.71 : popover notes, persistance filtres, commandes introuvables, candidats liés visibles',
    features: [
      'NOTES POPOVER — le modal d\'ajout de note s\'ouvre maintenant sous le bouton par défaut. Il ne remonte en haut que si vraiment pas la place en bas. Fini le bug où le popover s\'affichait près du header.',
      'PERSISTANCE FILTRES LISTE CANDIDATS — correction du vrai bug : le clic sur "Candidats" dans la sidebar effaçait la recherche + filtres. Désormais ils restent jusqu\'à "Tout effacer" ou déconnexion.',
      'LIER À COMMANDE (depuis liste candidats) — le modal affichait "Aucune commande ouverte" parce qu\'il interrogeait une API inexistante et filtrait un mauvais statut. Désormais il utilise le hook useOffres et filtre correctement statut=active.',
      'LIER À COMMANDE — la barre de recherche a été remplacée par une liste déroulante simple (dropdown) avec "Client — Titre — Ville" pour chaque commande. Plus rapide, plus clair.',
      'PAGE COMMANDES — chaque card affiche désormais les candidats liés (photo + nom + métier, max 3 + "autres"). Le bouton passe de "Candidats" à "Gérer (N)" quand il y a des liens.',
    ],
  },
  {
    version: '1.9.71',
    date: '2026-04-21',
    label: 'UX liste candidats + fiche + envoi CV rapide + lier candidats aux commandes + fixes CV personnalisé',
    features: [
      'LISTE CANDIDATS — l\'âge du candidat s\'affiche désormais aussi dans l\'onglet Actif, juste après la localisation (cohérent avec À traiter). Plus de pill séparée à droite.',
      'FICHE CANDIDAT — date d\'ajout affichée au-dessus de la photo ("Ajouté le 15 mars 2026") pour voir d\'un coup d\'œil quand le candidat est arrivé.',
      'BOUTON ENVOYER (fiche candidat) — nouveau bouton "mail" à côté de l\'œil dans le viewer CV : clic → ouvre /messages avec le candidat pré-sélectionné et son CV original attaché. Un seul clic pour envoyer.',
      'BOUTON ENVOYER (CV personnalisé) — même bouton à côté de Télécharger PDF : redirige vers /messages avec le candidat présélectionné ; clic sur "Personnaliser" dans la ligne pour ré-attacher le CV customisé.',
      'LIER CANDIDAT À COMMANDE — nouveau bouton "Lier à commande" dans la barre d\'actions bulk de la liste candidats (sélectionne plusieurs candidats → les lier d\'un coup à une commande ouverte).',
      'PAGE COMMANDES — bouton "Candidats" sur chaque card : ouvre un modal avec les candidats liés et leur statut (À envoyer / Envoyé avec date), plus une recherche flexible (accents/casse insensibles + ET/OU/SAUF) pour en ajouter.',
      'PERSISTANCE RECHERCHE LISTE CANDIDATS — quand tu changes d\'onglet et reviens sur /candidats, ta recherche, tes filtres, ta pagination et ta sélection sont conservés jusqu\'à "Tout effacer" ou déconnexion. Plus besoin de tout retaper.',
      'CV PERSONNALISÉ — les formations ont maintenant la même structure que les expériences : titre du diplôme, école, date début, date fin (ou "En cours"), description. Plus facile de modifier, ajouter, supprimer ou réordonner. Rétrocompat complète avec l\'ancien format (année simple).',
      'CV PERSONNALISÉ — le modal est plus large (1500px au lieu de 1100) pour voir confortablement les champs et l\'aperçu côte à côte.',
    ],
  },
  {
    version: '1.9.70',
    date: '2026-04-21',
    label: 'Historique d\'envois partagé team + mailing refondu (À/CC, aperçu blanc, auto-complete, perso par destinataire) + signature Seb',
    features: [
      'HISTORIQUE TEAM PARTAGÉ — tous les envois email/WhatsApp/iMessage/SMS sont désormais visibles par toute l\'équipe, avec un badge « Vous » ou « Prénom » qui indique qui a envoyé. Chacun peut seulement supprimer ses propres envois.',
      'AVERTISSEMENT 7 JOURS — avant d\'envoyer un email/WhatsApp/iMessage, TalentFlow vérifie si un candidat sélectionné a déjà été contacté par toi ou un collègue dans les 7 derniers jours. Si oui, un encart orange liste les candidats concernés avec « il y a X jours par Y via Z ». Non bloquant : boutons « Fermer » et « Continuer malgré tout ».',
      'MODE D\'ENVOI — nouveau toggle dans /messages → Mailing : « Envoi individuel personnalisé » (défaut, 1 mail par destinataire) OU « Envoi groupé À + CC » (1 seul mail avec destinataires visibles + copies CC). Le champ CC n\'apparaît qu\'après avoir ajouté au moins 1 destinataire.',
      'APERÇU MAIL FOND BLANC — le preview du mail affiche désormais toujours fond blanc + texte noir, même en mode sombre TalentFlow. Plus fidèle à ce que le destinataire voit dans Outlook.',
      'FLÈCHES ← → + PERSONNALISATION PAR DESTINATAIRE — en mode individuel avec plusieurs destinataires, navigue entre les aperçus avec les flèches. Bouton « Personnaliser ce mail » pour modifier sujet/corps d\'un destinataire spécifique sans toucher aux autres. Badge « ✏️ Personnalisé » visible.',
      'AUTO-COMPLÉTION EMAILS (type Outlook) — quand tu tapes dans le champ destinataires, un menu propose les emails connus : contacts clients (base TalentFlow), membres de l\'équipe, et destinataires récents (30 derniers jours). Navigation ↑↓ + Entrée, tri par type.',
      'RECHERCHE CLIENTS MAILING — le « Choisir clients » trouve désormais tous les clients (limite 500 → 2000), supporte la recherche avancée ET/OU/SAUF + parenthèses, insensible aux accents et à la casse. Tooltip ⓘ avec exemples.',
      'TEMPLATES REFONTE — nouveau modal Nouveau template avec 3 canaux en radio-cards (Email / iMessage / WhatsApp). Sujet uniquement pour email. Variables cliquables (insertion au curseur) groupées par usage (communes 3 canaux / email uniquement). Bouton « Copier vers WhatsApp » ou « Copier vers iMessage » sur chaque template.',
      'TEMPLATES WHATSAPP — la modal WhatsApp bulk dans /candidats charge désormais les templates dédiés (type=whatsapp), séparés des templates iMessage.',
      'ACTIVITÉS — badges compteurs sur chaque onglet (Tous / Candidats / Imports / Clients). Les filtres recherche + date sont respectés dans les compteurs.',
      'NETTOYAGE AUTO 30 JOURS — tous les envois (emails_envoyes) et événements d\'activité (activites) de plus de 30 jours sont supprimés automatiquement chaque nuit à 03:15. Garantit une base légère et pas d\'accumulation.',
      'SIGNATURE SEB — signature email officielle ajoutée pour Sébastien D\'Agostino (même template que João, photo dédiée, LinkedIn personnel, numéro +41 79 219 16 88). À lui de se déconnecter/reconnecter 1 fois pour l\'activer.',
      'FIX APERÇU CV — les CV dans la fiche candidat s\'affichaient trop grands à l\'ouverture (zoom 100% pixel). Désormais calés sur la largeur de la page par défaut (zoom page-width).',
    ],
  },
  {
    version: '1.9.67',
    date: '2026-04-21',
    label: 'WhatsApp bulk depuis liste candidats + cleanup /messages (onglets WhatsApp/SMS retirés)',
    features: [
      'NOUVEAU — Bouton "💬 WhatsApp" dans la barre d\'actions bulk de /candidats (à côté du bouton Message). Ouvre un modal dédié vert #25D366.',
      'MODAL WhatsApp bulk — templates SMS partagés (variables [MÉTIER]/[LIEU] globales + {prenom}/{nom} per-candidat), textarea + aperçu personnalisé pour le 1er candidat, liste des destinataires avec 1 bouton "Ouvrir" par candidat + bouton "Suivant (Nom)" pour passage rapide.',
      'SÉQUENTIEL user-driven — pas de boucle window.open() (anti-popup-blocker). Chaque clic = 1 chat WhatsApp ouvert. Badge "✓ Ouvert" + compteur X/N avec barre progression verte.',
      'LOG /api/messages/log canal:"whatsapp" — fire-and-forget au 1er clic uniquement (campagne_id partagé, 1 row par destinataire). Apparaît dans /messages Historique.',
      'LIB /phone-format.ts — fonction toWaPhone() factorisée (DRY). Imports candidats/[id]/page.tsx + messages/page.tsx nettoyés.',
      'CLEANUP /messages — onglets "WhatsApp" et "SMS / iMessage" SUPPRIMÉS de la page Envois (dead UI, tout le bulk se fait désormais depuis /candidats). 254 lignes de code mort retirées (WhatsAppTab + SmsTab fonctions).',
      'TAB /messages désormais : Mailing, Templates, Historique (l\'historique conserve le filtre multi-canal email/iMessage/WhatsApp/SMS).',
    ],
  },
  {
    version: '1.9.66',
    date: '2026-04-20',
    label: 'Historique messages unifié + UX liste/matching + recherche booléenne parenthèses',
    features: [
      'HISTORIQUE UNIFIÉ — /messages onglet Historique inclut désormais email, iMessage, WhatsApp, SMS. Filtre par canal en haut (tabs). Badge canal + icône sur chaque card.',
      'MIGRATION DB — colonne emails_envoyes.canal (CHECK IN email/imessage/whatsapp/sms, default email). Index sur canal + (user_id, created_at). Rows existantes = "email".',
      'API /api/messages/log — endpoint POST pour logger iMessage/WhatsApp/SMS avant ouverture de l\'app native. Fire-and-forget côté client, statut "tentative".',
      'LIEN WhatsApp fiche candidat + BOUTON "Ouvrir WhatsApp"/Messages dans /messages et CandidatsList — log avant navigation.',
      'FIX rapport d\'heures — calcul semaine ISO 8601 (avant: off-by-one, W16 pour 20-26.04.2026 alors que ISO = W17).',
      'LISTE CANDIDATS — étoiles interactives + bouton "Ajouter note" désormais disponibles dans TOUS les onglets (avant: à-traiter uniquement). Badge âge conservé en mode Actif.',
      'LISTE CANDIDATS — popover notes portalisé (createPortal) avec calcul dynamique top/bottom selon l\'espace dispo → fin du clipping quand la carte est proche du haut du viewport.',
      'MATCHING IA — résultats terminés préservés au retour depuis fiche candidat. L\'auto-reset au mount ne fire plus sur phase "done". Seuls les boutons "Nouvelle analyse" / "Vider les résultats" réinitialisent. selectedOffre restauré depuis matching.offreId.',
      'MATCHING IA + HISTORIQUE — aperçu CV au survol sur chaque card (pill "CV" avec Eye), même pattern que liste candidats (createPortal + panelW/panelH dynamique 480-1100 × 360-900). FIELDS preselect + MatchResult.candidat + MatchHistoryItem.results enrichis avec cv_url/cv_nom_fichier.',
      'RECHERCHE BOOLÉENNE — parser recursive descent avec support des PARENTHÈSES. Nouvel exemple dans popover: "(magasinier OU logisticien) ET bâtiment". Précédence OU (basse) < ET/SAUF (haute). AND implicite entre mots adjacents. Fetch-all client-side si parenthèses détectées.',
      'TOOLTIP "Recherche avancée" — 4 blocs pastel (--success-soft / --info-soft / --destructive-soft / --primary-soft) au lieu de var(--muted) gris illisible. Code exemples avec fond --card + bordure → lisibles light + dark.',
      'INTÉGRATIONS — modal sync OneDrive + pill 📎 historique : fond var(--muted) → var(--secondary) + texte var(--foreground) (gris-sur-gris illisible en light mode).',
    ],
  },
  {
    version: '1.9.65',
    date: '2026-04-20',
    label: 'Pack UX massif — 20+ bugs (mailing, dark mode, modals, pipeline, historique, dev localhost)',
    features: [
      'RÈGLE MÉTIER — email / téléphone / localisation désormais ÉCRASÉS sur UPDATE (manuel + OneDrive). DDN et genre restent IMMUABLES.',
      'BADGES COLORÉS 3 types sur liste candidats : 🟢 Nouveau / 🟡 Réactivé / 🔵 Actualisé — source manuelle (localStorage 10min) + OneDrive (DB persistant jusqu\'à ouverture fiche).',
      'MAILING — refonte liste candidats : 1 ligne compacte par candidat (nom · métier · 3 actions). Hover "CV original" → preview iframe portalisée. Bouton "CV original" dans CVCustomizer à côté de Réinitialiser.',
      'MAILING — distances clients quasi-instantanées : localStorage cache persistant, géocoding batch parallèle sur clients visibles seulement, delays Nominatim divisés par 3. Input "Distance depuis..." tokens sémantiques.',
      'MAILING — historique envois : campagne_id partagé → 1 card par envoi (au lieu de N destinataires). DELETE /api/emails/history via service role (bypass RLS bloquante sur legacy NULL). Vider tout + supprimer par ligne. Couleurs badge + chips rénovées.',
      'MODAL SMS/iMessage — maxWidth 500→720, photos destinataires (Image.src={c.photo_url} avec fallback initiales). Tokens sémantiques partout (textarea numéros, bouton Copier, dropdown templates, inputs Métier/Lieu) → lisible dark + light.',
      'LISTE CANDIDATS — FILTRE MÉTIERS MULTI-SELECT : dropdown checkboxes (avant: radio single). "Sanitaire" + "Aide sanitaire" cochés → liste OR côté serveur (.overlaps sur tags). Footer "N sélectionnés — Appliquer".',
      'LISTE CANDIDATS — recherche instant narrow-down client-side pendant debounce 150ms serveur. Prefetch automatique page suivante → clic "suivante" instantané.',
      'MATCHING IA — bouton "Rechercher les meilleurs candidats" dark mode : var(--foreground)/white → var(--primary)/var(--primary-foreground). Contraste propre.',
      'DOCUMENTS — card CV : bg var(--muted) → var(--primary-soft) brand. "Autre" → var(--secondary). Dropdown "Déplacer vers..." flip haut si dépasse viewport + maxHeight + scroll interne.',
      'FICHE CANDIDAT — placeholder photo light mode : var(--muted) = var(--muted-foreground) (invisible) → var(--secondary) + var(--foreground) + border.',
      'PIPELINE + LISTE CANDIDATS — hover CV : createPortal(..., document.body) pour échapper au containing block (Framer Motion transform). Hauteur 360 → max(360, min(900, 80vh)) dynamique. Largeur max 820 → 1100 pour grands écrans. Positionnement centré sur la card via rect.height. Hover preview enter/leave timers (pas de disparition quand on entre dans le popup).',
      'MODALS — Nouvelle commande / Modifier commande : sm:max-w-3xl + max-h-[90vh] + textareas 160/120px. Modal clients 640→820px. Modal missions 520→900px.',
      'BOUTONS JAUNE BRAND — .neo-btn-yellow color: var(--ink) (clair en dark) → var(--primary-foreground) (toujours sombre). 6 fichiers : color:white sur bg:primary → color:primary-foreground.',
      '/ACTIVITES — onglets Messages, Entretiens, Notes, Pipeline, Système supprimés. Restent : Tous, Candidats, Imports, Clients.',
      'DEV LOCALHOST — /admin refondu : purge cookies sb-* + magiclink → fin HTTP 431. NODE_OPTIONS=--max-http-header-size=65536 dans npm run dev. Suppression ALLOW_DEV_BYPASS.',
      'PDF — logo L-AGENCE officiel dans "Rapport de travail" — aligné sur le CV brandé.',
      'FIX IMPORT CV — archivage [Ancien] uniforme (cv/parse + onedrive/sync), textMatch sans guard hash/size (dup Luce), created_at dans SELECT update, await invalidateQueries avant dispatch, normalisation genre dans merge-candidat.',
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
