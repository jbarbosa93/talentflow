# Changelog TalentFlow

## [1.8.13] — 13 avril 2026

### Fix — Import CV : cv_url préservé sur doublon "même contenu"
- Bug : ré-import d'un CV existant avec contenu similaire (`hasNewContent = false`) ne sauvegardait pas `cv_url` → candidat sans CV visible
- Fix : le chemin "même contenu" met maintenant à jour `cv_url` et `cv_nom_fichier` si un nouveau fichier a été uploadé en Storage

### Email invitation — template custom
- Email d'invitation styled avec le template TalentFlow (#F5A623, header dark)
- Remplacement de l'email Supabase générique par Resend (nouvel utilisateur + renvoi)
- Email de bienvenue envoyé automatiquement après création du compte (`/accepter-invitation`)

---

## [1.8.12] — 12 avril 2026

### Pipeline — consultant obligatoire
- Ajout au pipeline sans consultant = erreur (empêche les candidats orphelins sous "Tous")
- Luis Filipe Pinto Rodrigues assigné à Seb (corrigé en DB)

### Navigation — bouton retour intelligent
- Fiche candidat : bouton retour renvoie vers la page d'origine (pipeline, missions, secrétariat, candidats)
- Paramètre `?from=` ajouté sur tous les liens vers fiche candidat depuis pipeline, secrétariat, missions
- Label dynamique : "Retour au pipeline", "Retour aux missions", "Retour au secrétariat"

### Scroll position — liste candidats
- Position scroll sauvegardée dans sessionStorage avant d'ouvrir une fiche
- Restaurée automatiquement au retour (délai 100ms pour laisser la liste charger)

---

## [1.8.11] — 12 avril 2026

### Module Secrétariat
- Dashboard secrétaire complet (KPIs, alertes, urgents)
- Notifications automatiques + manuelles avec badge sidebar
- Historique modifications (logs_secretariat)
- Import Excel complet : 430 candidats, 113 accidents, 180 ALFA, 76 paiements ALFA
- Couleurs lignes, filtres, sélection multiple
- WhatsApp partout, lien fiche candidat, IMES
- Enfants charge 3 états (OUI/NON/?)

### Doublons améliorés
- Détection instantanée par critères exacts : même email, même téléphone (normalisé +41/078), même nom+prénom
- Historique en DB `doublons_historique` (cross-device, multi-utilisateur)
- UI : tri/filtre score, highlighting champs différents, fusion guidée champ par champ

### Import en masse aligné avec import normal
- Rotation 180° PDF si analyse vide (détection CV à l'envers)
- Fallback Vision si nom = "Candidat" (bandeau graphique)
- Timeouts par étape : extraction 10s, analyse 45-55s, upload 15s (plus de blocage batch)
- `created_at` depuis `lastModified` du fichier ZIP ou date dans le nom de fichier
- `cvScore=0` OneDrive → classé diplôme/certificat, pas candidat vide

### Sécurité & Qualité
- SMTP chiffré AES-256-GCM (`lib/smtp-crypto.ts`)
- `requireAuth()` sur 9 routes API critiques
- RLS corrigé (logs_acces, pipeline_rappels, entretiens, candidates)
- Sentry monitoring
- Timer inactivité persisté en localStorage

### UI & Nettoyage
- Page Outils redesignée : grille 2×2, 4 outils, badge IA retiré des doublons
- Suppression 4 outils inutilisés (~2400 lignes) : Analyse complète IA, Planning, Sync dates, Genre
- Icônes Lucide + titres harmonisés sur toutes les pages
- ALFA : onglets séparés (Suivi / À Payer), suppression scroll horizontal
- Dashboard : noms cliquables, sinistres filtrés par année courante
- Fix 780 notifications obsolètes `permis_expiration`

---

## [1.5.18] — 9 avril 2026

### Fix dark mode par défaut + flash non-vus
- Fix : thème par défaut `'dark'` → `'light'` — Safari et nouveaux appareils sans localStorage démarrent en light
- Fix : flash "479 non vus" au chargement — `nonVusTotal` effect bloqué par `isReady = false` jusqu'à `ensureInit()` résolu

---

## [1.5.17] — 9 avril 2026

### Fix flash badge — init synchrone depuis localStorage
- `_viewedAllAt` initialisé synchrone au chargement du module via `localStorage.getItem('talentflow_viewed_all_at')` — premier render correct, zéro flash
- `initViewedFromDB()` écrit `viewedAllAt` dans localStorage après sync DB — disponible au prochain chargement
- `markAllVu()` — nouveau helper : met à jour `_viewedAllAt` + localStorage + dispatch event après "Tout marquer vu"
- Suppression du gate `badgeInitialized` dans Sidebar et CandidatsList (plus nécessaire)

---

## [1.5.16] — 9 avril 2026

### Fix flash badge 8→2 — badgeInitialized gate
- Fix : badge sidebar et boutons "Non vus" / "Tout marquer vu" masqués jusqu'à `ensureInit()` résolu
- `badgeInitialized = false` au montage → badges invisibles → `true` après init → apparaissent directement avec la bonne valeur

---

## [1.5.15] — 9 avril 2026

### Fix badge sidebar — ensureInit + lisibilité labels
- Fix : race condition badge sidebar — `ensureInit()` dans `badge-candidats.ts` garantit que `_viewedAllAt` est initialisé avant le premier calcul sidebar (plus de flash "5 → 2")
- Fix : un seul appel API `/candidats/vus` partagé (promise cachée) — Sidebar et CandidatsList utilisent la même `_initPromise`
- Fix : labels "Menu" / "Compte" sidebar — `rgba(255,255,255,0.22)` → `0.45`

---

## [1.5.14] — 9 avril 2026

### Fix badge sidebar non-vus + couleur demande-acces
- Fix : badge sidebar — utilise `hasBadge(id, created_at, viewedSet, viewedAllAt)` au lieu de `viewed.has(id)` (ignorait le timestamp "Tout marquer vu")
- Fix : `CandidatsList` dispatch `talentflow:badges-changed` après `initViewedFromDB()` → sidebar resync immédiat au chargement
- Fix : `/demande-acces` — couleur `#F7C948` → `#F5A623` (cohérence orange app)

---

## [1.5.13] — 9 avril 2026

### Auth pages redesign — fond blanc + card centrée + Framer Motion
- Fond blanc `#FFFDF5` avec 2 orbes animées subtiles (orange + bleu)
- Card blanche centrée : border cream, shadow subtile, logo orange neo-brutalist
- Logo TalentFlow : fade-in + scale au montage, icône orange avec shadow offset
- Champs : stagger Framer Motion (fadeUp delay progressif par champ)
- Bouton submit : orange `#F5A623`, border noire + shadow offset, hover `-1px -1px`
- Input focus : border orange + glow `rgba(245,166,35,0.12)`
- Footer légal discret sur chaque page (CGU · Confidentialité · © 2026)
- Pages converties : `/login`, `/verify-email`, `/accepter-invitation` (4 états)
- Panel gauche branding supprimé — card centrée full-page sur toutes les pages
- `auth.css` : `--y: #F7C948` → `#F5A623`

---

## [1.5.12] — 9 avril 2026

### Landing page — Redesign complet + pages légales
- Couleur landing `#F7C948` → `#F5A623` (cohérence avec l'app orange)
- Hero : CTA "Demander une démo →" + lien "Se connecter", social proof avatars, eyebrow mis à jour
- Strip : stats mises à jour (OneDrive Sync, Matching IA, Pipeline Kanban, LPD, WhatsApp)
- Features : 12 cartes — OneDrive Sync automatique + Matching IA en avant, Conformité LPD/RGPD
- Section bêta : remplace l'ancienne section Pricing — encart dark "plateforme en développement" + CTA démo
- Footer redesigné : 3 colonnes (brand + tagline, navigation, légal), badge "En phase bêta"
- Navbar : liens "Fonctionnalités" + "Contact" ajoutés
- Pages légales provisoires : `/cgu`, `/confidentialite`, `/mentions-legales` — droit suisse, LPD, Valais

---

## [1.5.11] — 9 avril 2026

### Fix non-vus — migration viewedAllAt localStorage → Supabase
- Correctif : 491 faux non-vus sur Mac après migration v1.5.9
- Cause : le timestamp "Tout marquer vu" existait en localStorage mais pas en Supabase user_metadata
- Fix : `initViewedFromDB()` détecte `candidats_viewed_all_at` en localStorage et le migre vers Supabase via `PATCH /api/candidats/vus` (one-shot, fire-and-forget)

---

## [1.5.10] — 9 avril 2026

### Drapeaux téléphone — fix Windows
- Drapeaux pays sur les numéros de téléphone remplacés par des images SVG via `flag-icons` CSS
- Fonctionne désormais sur Windows Chrome (les emojis drapeaux Unicode ne s'y affichent pas)
- `detectAndFormat()` centralisée dans `lib/phone-format.ts` — 3 duplications supprimées
- Rendu : `<span class="fi fi-ch">` (Suisse), `fi-fr` (France), `fi-es`, `fi-pt`, `fi-it`

---

## [1.5.9] — 9 avril 2026

### Non vus — cross-device (localStorage → Supabase DB)
- Table `candidats_vus (user_id, candidat_id)` avec RLS par utilisateur
- Au premier chargement : import automatique du localStorage existant vers DB (migration one-shot)
- `hasBadge` tient compte du timestamp `candidats_viewed_all_at` (user_metadata) ET de la table
- Badges cohérents Mac ↔ Windows — plus de 480 faux "non vus" sur un second appareil

### Technique
- Nouvelle route `GET/POST/DELETE /api/candidats/vus`
- `mark-all-vu` : vide la table user + pose le timestamp (au lieu de localStorage)
- `lib/badge-candidats.ts` : DB = source de vérité, localStorage = cache write-through

---

## [1.5.8] — 9 avril 2026

### Recherche candidats — DB, unaccent, champs complets
- Index GIN `fts` (tsvector french STORED) + index trigramme sur nom, prénom, titre, localisation
- `unaccent` sur tous les champs — `macon` trouve `maçon`, `electricien` → `électricien`
- Recherche élargie : compétences, tags, expériences (JSON), formations (JSON), téléphone
- Suppression `linkedin` et `annees_exp` de toute l'interface (non utilisés)

### Technique
- Migration `20260401_candidats_indexes.sql` appliquée en prod (colonne fts + 10 index)
- RPC `search_candidats_filtered` v3 finale : FTS GIN + unaccent + 14 champs couverts

---

## [1.5.7] — 9 avril 2026

### Corrections — Recherche candidats (6 fixes)
- Fix 1 : pagination recherche — `result_offset` manquant dans la RPC (page 2+ retournait toujours les mêmes résultats)
- Fix 2 : multi-mots — "maçon Monthey" cherche les candidats qui ont les deux mots (était phrase exacte → 0 résultat)
- Fix 3 : sync `filtreMetier` ↔ `filterMetier` — le dropdown métier de la liste et les filtres avancés sont maintenant synchronisés
- Fix 4 : RPC `search_candidats_filtered` v3 — utilise `fts @@ plainto_tsquery` (index GIN) + ILIKE sur `cv_texte_brut` et `resume_ia`
- Fix 4 : `total_count` maintenant retourné par la RPC (était toujours 0 → pagination affichait 0 page en mode recherche)
- Fix 5 : booléen ET/AND → envoyé au serveur pour pré-filtrage (FTS + cv_texte_brut) ; OU/SAUF reste client-side
- Fix 5 : corpus client booléen élargi — inclut `resume_ia`
- Fix 6 : fallback ILIKE (si RPC indisponible) — inclut `resume_ia`

### Technique
- Nouvelle migration : `supabase/migrations/20260409_search_rpc_v3.sql`
- ⚠️ Migration à appliquer manuellement dans le dashboard Supabase (SQL Editor)

---

## [1.5.6] — 8 avril 2026

### Nouvelles fonctionnalités
- Documents (fiche candidat) : panel latéral → modal centré avec backdrop flouté
- Documents : `createPortal(document.body)` — s'affiche correctement peu importe le scroll ou les animations Framer Motion parentes
- Documents : animation `scaleIn` au lieu de `slideInRight`, header redesigné avec icône orange + compteur en sous-titre
- Candidats (liste) : barre de sélection multi-sélection entièrement redessinée — 2 rangées, couleurs distinctes par action, border orange, glow orange
- Pipeline : refonte layout — colonnes `flex: 1` (remplissent l'espace), 2 cards par colonne en grille, mode liste supprimé
- Pipeline : cards enrichies — notes toujours visibles, actions uniquement au survol, photos avec fallback initiales
- Pipeline : fix RLS `app_settings` — sauvegarde des étapes via route API `/api/pipeline/stages` + `createAdminClient()`
- Candidats : glow orange correct sur tous les inputs (`rgba(245,167,35,0.15)`) — suppression du jaune fluo `rgba(255,232,0,...)`
- Candidats : bouton "Ajouter au Pipeline" dans la barre de sélection (onglet Actif uniquement)
- Candidats : tooltip notes affiche jusqu'à 3 notes (était 1), avec date + séparateur

### Corrections
- Documents : positionnement cassé quand la page était scrollée (`position: absolute` remplacé par modal `fixed` + portal)
- Pipeline : photos cassées — ajout handler `onError` avec fallback initiales (`#F1F5F9` / `#64748B`)
- Métier : sync bidirectionnel liste ↔ fiche — invalidation `queryKey ['candidat', id]` manquante après sauvegarde
- CV preview : panel apparaissait en mauvaise position quand Framer Motion transform était actif sur le parent — fix via `createPortal`

---

## [1.5.5] — 8 avril 2026

### Corrections
- Badge sidebar candidats : `#F5A623` orange → `#EF4444` rouge (cohérent avec les badges non-vus)
- Badge "non vus" onglets : `z-index: 50`, visible au-dessus du bouton "À traiter"
- Aperçu CV : panneau centré verticalement sur la card survolée — position via `e.clientY` + ref DOM directe (`previewRootRef.current.style.top`), bypass React re-render, `panelH = min(55vh, 520px)`
- Tooltip notes : rendu via `createPortal(document.body)` en `position: fixed`, plus clippé par l'overflow/animation de la card
- MetierPopover : rendu via `createPortal(document.body)`, `anchorRect` capturé au clic, `position: fixed` + `z-index: 9999`
- Sidebar.tsx : `#FFE800` → `#F5A623` (2 occurrences)

---

## [1.5.3] — 8 avril 2026

### Reverts UI
- Couleur primaire : `#FFE800` → `#F5A623` (retour à l'orange original)
- Tokens CSS : suppression des blocs `[data-theme="dark"]` / `[data-theme="light"]` séparés, retour au `:root` unique avec variables light
- Sidebar : suppression du gradient jaune, du `border-left` sur les nav links, des transitions cubic-bezier
- Boutons : `.neo-btn` border-radius 100px + hover original, `.neo-btn-yellow` border noire + box-shadow brutalist (suppression glow + ripple)
- KPI cards dark : suppression du `backdrop-filter: blur` et fond semi-transparent

### Corrections
- MetierPopover (liste candidats) : `position: fixed` + `z-index: 9999` — le dropdown métier n'est plus caché derrière les autres cards

### Gardé intact
- Shimmer/loading amélioré (1.8s, variante dark/light)
- Input focus glow (double shadow + rotation icône)
- Pipeline scrollbar fine stylée

---

## [1.5.2] — 8 avril 2026

### Sécurité
- RLS activé sur 5 tables publiques non protégées : `candidats`, `app_settings`, `email_otps`, `jobs`, `onedrive_fichiers`
- Policies : service_role (all) sur les 5, authenticated (all) sur candidats, authenticated (read) sur app_settings

### Nouvelles fonctionnalités
- Pipeline : recherche dans le board (champ `<input>` manquant — le state existait mais n'était pas rendu)
- Pipeline : mode grille — 2 cards côte à côte par colonne, colonnes élargies (420–560px), toggle persisté en localStorage
- Pipeline : scroll horizontal amélioré — gradient fade gauche/droite, scrollbar fine stylée 6px

### Améliorations
- Pipeline : cards enrichies — photo candidat (fallback initiales), avatar 44px, nom 14px, téléphone cliquable (`tel:`), badges CFC (vert) et Engagé (orange)
- Pipeline : icône Aperçu CV différenciée (`FileText` au lieu de `Eye` dupliqué)
- Pipeline : cards compactes en mode grille (avatar 32px, actions réduites au hover)

---

## [1.5.0] — 8 avril 2026

### Nouvelles fonctionnalités
- OneDrive : historique fichiers groupé par jour (accordion, 5 catégories colorées — créés / mis à jour / réactivés / documents / erreurs)
- OneDrive : catégorisation automatique des documents non-CV (Certificat · Diplôme/Formation · Lettre de motivation · Permis · Référence · Contrat · Bulletin de salaire)
- OneDrive : rapport de synchronisation détaillé (créés / mis à jour / réactivés / déjà à jour / erreurs)
- OneDrive : batch 50 CVs/cycle (était 20), auto-refresh 5s/30s, retry automatique documents "candidat introuvable"

### Améliorations
- OneDrive : identification robuste — 5 méthodes, insensible aux accents, tolérance prénom préfixe, désambiguïsation multi-candidats (email → tel → localisation → mots-clés fichier)
- OneDrive : logique mise à jour CV basée sur le contenu (500 chars) — SKIP / réactivation / update complet selon diff réel
- OneDrive : compteurs précis (traite_le au lieu de created_at, exclusion skipped/abandoned)
- OneDrive : bouton "Vider les erreurs", label "Fichiers détectés", séparation erreurs / en attente

### Corrections
- OneDrive : boucle infinie — memeDate cassé (format "Z" vs "+00:00" → comparaison timestamps ±1s)
- OneDrive : boucle infinie — certificats "introuvable" retraités à l'infini (retryAlwaysIds conditionnel sur nouveau candidat)
- OneDrive : race condition lors d'imports parallèles — vérification email+nom juste avant INSERT
- OneDrive : déduplication suffixes [45]/(45) ajoutés par OneDrive sur les copies de fichiers
- OneDrive : fichiers jamais tentés marqués abandonnés à tort (isStuck ignoré si pas d'erreur)
- OneDrive : fix cron — Authorization header manquant → 401 permanent
- OneDrive : fix fichiers .doc — branche isDoc manquante
- Candidats : filtre "Non vus" perdu au retour de la fiche (guard nonVusBadgeLoaded, persistence statusBeforeNonVuRef)

---

## [1.4.0] — 7 avril 2026

### Nouvelles fonctionnalités
- Entretiens / Suivi : page redessinée en vue liste, rappels avec date, notifications popup, badge sidebar
- Candidats : outil "Corriger photos" — extraction batch DOCX/DOC/PDF, UI 3 boutons, historique portraits cliquables
- Activités : logs unifiés (table activites), WhatsApp loggué, fusion doublons loggée, recherche serveur PostgreSQL

### Améliorations
- Candidats : badges "non vus" animés par onglet (Actif / À traiter / Archivé)
- Candidats : sync cache liste ↔ fiche (CFC, engagé, étoiles, notes)
- Candidats : sidebar réinitialise tous les filtres à l'ouverture
- Candidats : bouton ✂️ crop photo visible sans mode édition, suppression CV corrigée, ordre liste stable
- Dark mode : corrections dans Paramètres, Profil, Logs, Doublons, Intégrations, Documents, UploadCV

### Corrections
- Recherche : URL overflow sur 650+ IDs — batch par 200 avant pagination
- Recherche : filtres CFC et "Déjà engagé" serveur-side (plus de fetch 6000 candidats)
- Sécurité : 15 corrections hardening (rate limiting, circuit breaker, FK cascade, PDFs chiffrés, RLS, erreurs masquées…)

---

## [1.3.0] — 28–29 mars 2026

### Nouvelles fonctionnalités
- Mobile : layout responsive complet, HEIC/HEIF, touch, boutons agrandis, viewer CV masqué sous 768px
- France Travail : formulaire Word fidèle, envoi Resend, CC automatique, historique des envois
- Planning : refonte majeure — périodes par ligne, ETP par semaine, marge horaire, tri colonnes, candidats hors-système

### Améliorations
- Parsing IA : détection date naissance, genre, permis, documents non-CV (certificats, permis nacelle…)
- Doublons : carte enrichie (photo, expériences, stats, badge source OneDrive/Upload)
- Cross-device : "Tout marquer vu" synchronisé, OTP grace 4h (cookie httpOnly HMAC-SHA256)

---

## [1.2.0] — 26 mars 2026

### Nouvelles fonctionnalités
- OneDrive Sync v1 : récursif, smart update (mise à jour / réactivation), images JPG/PNG/WebP
- Doublons : fusion atomique (RPC), actions individuelles, ré-analyse par paire
- Mailing : CV original + CV personnalisé en PJ, envoi via Microsoft Graph
- Activités : timeline enrichie avec badge nouveaux CVs dans la sidebar
- Métiers : partagés via Supabase, filtre par catégorie avec couleurs

---

## [1.1.0] — mars 2026

### Nouvelles fonctionnalités
- Import IA multi-modèle (Claude, Gemini, Groq), parsing masse ZIP/PDF/DOCX/DOC
- Recherche full-text, pagination serveur, audit IA
- Documents : gestion pièces jointes, classification IA, retry intelligent

---

## [1.0.0] — mars 2026

Version stable initiale — candidats, clients, pipeline Kanban, import CV, CV viewer zoom HD, authentification OTP.
