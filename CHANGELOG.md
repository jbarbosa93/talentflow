# Changelog TalentFlow

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
