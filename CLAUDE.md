# TalentFlow — CLAUDE.md

## Règles de comportement

**Langue** : toujours répondre en **français**, même si le code est en anglais.

**Avant de toucher** :
- Auth / middleware / RLS → demander confirmation explicite, risque élevé de régresser l'accès
- Migrations Supabase → toujours montrer le SQL avant d'exécuter
- Suppression de données ou colonnes → demander confirmation, action irréversible
- `app_settings`, `email_otps`, `onedrive_fichiers`, `secretariat_*`, `logs_secretariat` → tables sensibles, vérifier les RLS

**Signaler les risques** :
- Tout changement dans `lib/supabase/`, `middleware.ts` ou `app/(auth)/` → mentionner le risque
- Modifications des routes API existantes → vérifier les usages côté client avant
- Ajout de dépendances npm lourdes → signaler l'impact sur le bundle Vercel

**Style de réponses** : concis, direct, pas de résumé en fin de réponse.

---

## Règles de workflow — Modifications & Déploiement

### RÈGLE — Avant chaque modification de code
1. Identifier tous les fichiers qui seront touchés
2. Pour chaque fichier → lister les fonctionnalités qui utilisent ce fichier
3. Signaler avec ⚠️ toute fonctionnalité qui pourrait être impactée par le changement
4. Attendre confirmation de João avant de continuer

### RÈGLE — Après chaque modification
1. Relire les fichiers modifiés
2. Vérifier mentalement qu'aucune fonctionnalité existante n'est cassée
3. Lister les fonctionnalités à tester manuellement
4. Signaler si un test est recommandé avant déploiement

### RÈGLE — Avant chaque `vercel --prod`
1. `git add -A`
2. `git commit -m "feat/fix: description + version"`
3. `git tag vX.X.X`
4. **DEMANDER CONFIRMATION EXPLICITE À JOÃO AVANT TOUT `git push`** — Vercel est connecté au repo GitHub et déploie automatiquement à chaque push sur `main`. Un push = un deploy. Donc jamais de push sans validation.
5. `git push origin main --tags` (seulement après le "oui déploie" de João)
6. Optionnel : `vercel --prod` (normalement plus nécessaire, le push GitHub déclenche le déploiement Vercel)

### ⛔ JAMAIS pusher sur GitHub sans l'accord explicite de João
- Vercel déploie auto sur chaque push vers `main` → pas de safety net
- Toujours préparer le commit localement, montrer le récap, attendre "oui déploie" / "push-le", puis seulement `git push`
- Règle ajoutée le 21/04/2026 suite à un push automatique non-validé (v1.9.71)

### ⛔ RÈGLE — Build local + vérif Vercel après chaque push (v1.9.78)
Ajoutée le 22/04/2026 après bug build Next.js 16 (useSearchParams sans Suspense sur /messages) qui a laissé prod en état ERROR alors que le changelog s'affichait déjà chez João.

**Avant tout `git push` qui touche :**
- Hooks de navigation (`useSearchParams`, `useRouter`, `usePathname`) ajoutés dans un nouveau composant top-level
- Layouts, middleware, `next.config.ts`
- Nouvelles dépendances npm
- Routes API nouvelles ou leur runtime config
- Toute logique SSR/SSG (generateStaticParams, metadata, revalidate)

→ **Obligatoire** : `npm run build` local (pas juste `tsc --noEmit`). `tsc` ne détecte pas les erreurs de prerendering Next.js.

**Après chaque `git push` :**
1. Récupérer l'ID du deploy via MCP Vercel (`list_deployments`)
2. Attendre l'état : soit READY (OK), soit ERROR (fetch build logs)
3. Si ERROR → fix immédiat + re-push + revérif
4. Ne JAMAIS considérer le push comme "déploiement terminé" tant que Vercel ne dit pas READY

Une prod en ERROR = user sees "changelog dans l'app" mais ancienne version active → impression que les fixes n'ont pas été déployés.

### RÈGLE — Commits
- Commiter uniquement avant chaque déploiement prod
- Pas obligatoire pendant le développement localhost
- Message commit clair avec la version et description

### RÈGLE — Mise à jour automatique MEMORY.md et CLAUDE.md
À chaque fin de session (avant `vercel --prod`) :
1. Mettre à jour `MEMORY.md` avec les features/fixes de la session
2. Mettre à jour `CLAUDE.md` si nouvelles règles ou patterns
3. Inclure dans le même commit que le déploiement
4. Ne jamais attendre que João le demande explicitement

**Déploiement Vercel** : ne jamais lancer `vercel --prod` sans avoir suivi la séquence git ci-dessus et obtenu la confirmation explicite de João. Récap obligatoire avant chaque déploiement :

```
✅ Tâches terminées : [liste]
⚠️ Points d'attention : [liste si applicable]
🚀 Prêt à déployer sur Vercel — tu confirmes ? (oui / non)
```

---

## Version actuelle
**1.9.99 prod (croix Date modif → last_import_at = created_at au lieu de NULL — fini candidat perdu en page 150)** — 23/04/2026

---

## 🔴 RÈGLES MÉTIER ABSOLUES (jamais violer)

Règles consolidées après 2 jours de travail intensif avec João. À appliquer avant toute autre décision technique.

### Import & Matching
- **JAMAIS** utiliser le nom du fichier pour matcher un candidat (ni pour classifier CV/non-CV)
- **JAMAIS** matcher sur un seul signal (prénom seul, tel seul, email seul)
- Toujours : **tous les nom + tous les prénom** d'abord, puis email/tel/DDN pour confirmer
- **DDN différente = toujours 2 personnes différentes**, sans exception
- Couples/familles peuvent partager email/tel → **ne jamais fusionner** sur ces signaux seuls
- **Noms composés portugais/espagnols** (Da Silva, Dos Santos, Fragoso Costa) → ne JAMAIS tronquer, extraire tous les mots du nom
- **"SA", "Sàrl", "AG", "GmbH", "Ltd"** dans le nom extrait → c'est une entreprise, pas un candidat → rejeter
- Un certificat/diplôme/lettre ne crée **JAMAIS** un nouveau candidat
- Un non-CV sans candidat identifié → erreur propre, pas de création

### Normalisation données
- **Noms/prénoms** : toujours Title Case (Pedro Ferreira, pas PEDRO FERREIRA ni pedro ferreira). Extraire tous les mots trouvés (plusieurs prénoms, nom composé).
- **Particules** : `de, da, dos, du, van, von, del, di` → minuscule (sauf en 1ère position)
- **Email** : toujours lowercase + trim. Email vide `""` → `NULL` (jamais chaîne vide)
- **Téléphone** : toujours avec indicatif pays (+41 79..., +33 6...) si inférable, sinon copier-coller l'extraction du CV
- **Localisation** : toujours "Ville, Pays" (Monthey, Suisse)

### Règle UPDATE coords (changement 20/04/2026, décision João)
- **email / telephone / localisation** → ÉCRASÉS par le nouveau CV si valeur non vide (manuel + OneDrive). Avant : IMMUABLES (remplis seulement si vides). Raison : un candidat change de mail / déménage → la fiche doit refléter. Modale confirm-match affiche déjà les diffs → user valide consciemment.
- **date_naissance** → **IMMUABLE** (règle métier absolue : DDN différente = 2 personnes différentes — homonymes).
- **genre** → **IMMUABLE** (Claude se trompe souvent sur le genre, normalisation fragile).
- Implémenté dans `lib/merge-candidat.ts` (sections 1a DDN immuable / 1b coords replaced) + `onedrive/sync` branche classique.

### Déploiement
- **TOUJOURS** tester en localhost avant `vercel --prod`
- **JAMAIS** déployer un fix sans avoir testé le scénario exact qui a causé le bug
- Un fix non testé n'est pas un fix
- Confirmation explicite "oui déploie" obligatoire avant `vercel --prod`
- Bump version (`lib/version.ts`) + entrée changelog à chaque déploiement
- À chaque déploiement validé : mettre à jour CLAUDE.md + MEMORY.md **dans le même commit**, supprimer les règles obsolètes des versions précédentes

### Architecture import
- **2 routes d'import actives** : `cv/parse` (manuel UI) + `onedrive/sync` (cron auto 10min + manuel)
  - `cv/parse` → modale de confirmation si match trouvé (UX interactive)
  - `onedrive/sync` → silencieux, pas de modale (cron)
- **`cv/bulk` et `sharepoint/import` SUPPRIMÉES en v1.9.23** (854 lignes de code mort, 0 trafic prod vérifié). **Ne pas recréer ces routes**. Toute la logique batch passe par `cv/parse` avec `skip_confirmation=true`.
- **SHA256 du buffer PDF** = source de vérité pour identifier un fichier identique (`cv_sha256` + `cv_size_bytes` + index partiel). Jamais filename, jamais texte extrait.
- **`findExistingCandidat`** (`lib/candidat-matching.ts`) = source de vérité pour identifier un candidat existant
- **`classifyDocument`** (`lib/document-classification.ts`) = source unique CV vs non-CV (patterns contenu + email générique + hasName && !hasExperiences)

### Seuils matching (ne pas modifier sans simulation sur 6000+ candidats)
- Score ≥ 16 → match certain → update automatique
- Score 11-15 → match standard → update (onedrive/sync) ou modale (cv/parse)
- Score 8-10 → zone uncertain → pending_validation dans `/integrations`
- Score < 8 → nouveau candidat
- **strictExact (nom identique) → seuil 8 minimum** (v1.9.27, pas 5 qui fusionnait les homonymes)
- **Simulation obligatoire** avant tout changement de seuil (script `scripts/sim-*.mjs`)

### UX & Interface
- **Badges** : per-user strict via `candidats_vus + auth.users.candidats_viewed_all_at`, jamais global
- **DB source de vérité** pour `candidats_vus` (pas d'UNION avec localStorage client)
- **Modale confirmation** : score + diff côte à côte + 3 boutons (Update / Créer / Voir fiche)
- **`/integrations`** = supervision imports + anomalies + pending validation
- **`/parametres/doublons`** = fusion candidats existants (4 catégories SQL v1.9.45 + fallback client)
- **Jamais d'action irréversible** sans confirmation explicite
- **Invalidation React Query explicite** après toute action user qui modifie candidats (`['candidats']` + `['candidat']`)

### Vision produit João
- Import CVs = cœur du produit, doit être parfait
- **Zéro contamination** de fiches (un CV ne doit jamais écraser la mauvaise fiche)
- **Zéro doublon silencieux** (le système doit toujours demander en cas de doute)
- Normalisation automatique = données propres dès l'entrée
- Traitement parfait des non-CV, mappés dans la bonne catégorie (`mapDocumentType`)
- **Ne pas dupliquer un CV dans `documents[]`** si déjà existant : juste changer date d'import + badge (reactivated/updated)
- ML progressif = le système apprend des décisions humaines (`decisions_matching` JSONB → `/api/ml/insights`)

### Ce qu'on ne fait PAS
- ❌ Pas de matching sur filename
- ❌ Pas d'écrasement silencieux sans signal fort
- ❌ Pas de création de candidat depuis un non-CV
- ❌ Pas de déploiement sans test
- ❌ Pas de nouvelle feature avant que les bugs existants soient corrigés
- ❌ Pas de refactoring massif d'un code qui marche

---

## Stack technique
- **Frontend** : Next.js 16.1.7 (App Router), React 19, TypeScript 5, Tailwind CSS 4
- **Backend/DB** : Supabase (PostgreSQL + RLS), Supabase Auth + OTP email
- **State** : React Query v5 (serveur), Context API (client), localStorage/sessionStorage (UI persistant)
- **IA** : Claude API (Anthropic `^0.79`), Google Generative AI (`^0.24`), Groq (`^1.1`) — parsing CV et matching
- **Docs** : pdf-lib, pdfjs-dist v5, mupdf v1.27, tesseract.js v7 (OCR), docx, mammoth, word-extractor
- **Emails** : Resend (prioritaire), Nodemailer/SMTP (fallback, chiffré AES-256-GCM), WhatsApp Business API
- **Intégrations** : Microsoft Graph API (Outlook, OneDrive, SharePoint)
- **UI** : Framer Motion, Recharts, Leaflet, Radix UI, shadcn, sonner
- **Déploiement** : Vercel Pro — région `dub1`
- **Dev local** : port 3001, commande `next dev --port 3001 --webpack` (Turbopack désactivé en dev)

---

## Structure du projet
```
app/
  (auth)/             — login, register, reset-password, verify-email, auth.css
  (dashboard)/        — toutes les pages protégées + API routes
    api/              — routes API server-side
    candidats/        — liste + fiche détail [id]
    pipeline/         — grille 3 cols (consultant + métier + rappels)
    secretariat/      — dashboard secrétaire (rôle dédié)
    missions/         — CRUD missions
    clients/          — liste + fiche [id]
    offres/           — offres emploi
    entretiens/       — calendrier entretiens
    matching/         — scoring candidats ↔ offres + historique
    messages/         — email/SMS/WhatsApp
    activites/        — timeline activité
    integrations/     — OAuth Microsoft, WhatsApp config
    outils/           — outils spécialisés (analyser candidats, rapport heures)
    parametres/       — profil, sécurité, admin, logs, doublons, photos, import-masse
    dashboard/        — page d'accueil avec KPIs
    import-masse/     — upload ZIP/PDF/Word batch
components/           — composants React (PascalCase)
contexts/             — Context API (Upload, Import, Matching, Photos, Doublons, Theme)
hooks/                — custom hooks (useCandidats, useClients, useMetiers…)
lib/                  — utils, supabase clients, cv-parser, onedrive, version, format-candidat, normalize-candidat
types/database.ts     — types Supabase auto-générés (snake_case)
supabase/migrations/  — SQL migrations versionnées
```

---

## Pages et accès

| Page | URL | Rôles | Description |
|------|-----|-------|-------------|
| Dashboard | `/dashboard` | Tous | KPIs: clients actifs, candidats entretien/placés. 5 count queries |
| Candidats liste | `/candidats` | Tous | Liste 6302+ candidats, filtres, pagination, hover CV preview |
| Candidats à traiter | `/candidats/a-traiter` | Admin, Consultant | Vue filtrée `import_status='a_traiter'` |
| Fiche candidat | `/candidats/[id]` | Tous | Détail complet + CV zoomable + notes + documents + activité |
| Pipeline | `/pipeline` | Admin, Consultant | Grille 3 cols, onglets consultants (João/Seb), onglets métiers, rappels |
| Clients | `/clients` | Admin, Consultant | 1200+ entreprises, recherche IA (Claude web_search) |
| Fiche client | `/clients/[id]` | Admin, Consultant | Détail + missions + candidats proposés |
| Offres | `/offres` | Admin, Consultant | CRUD offres emploi + veille offres externes (scraping) |
| Entretiens | `/entretiens` | Tous | Calendrier entretiens, rappels, badge sidebar |
| Matching | `/matching` | Admin, Consultant | Scoring candidats ↔ offres (IA) |
| Missions | `/missions` | Admin, Consultant | CRUD missions, stats marge, bilan mensuel, sync Quadrigis |
| Messages | `/messages` | Admin, Consultant | Envoi email/SMS/WhatsApp multi-candidats, templates |
| Activités | `/activites` | Admin, Consultant | Timeline: Pipeline, Messages, Candidats, Imports OneDrive |
| Secrétariat | `/secretariat` | **Secrétaire uniquement** | 6 modules: candidats/accidents/ALFA/paiements/loyers/notifs |
| Import masse | `/import-masse` | Admin, Consultant | Upload ZIP/PDF/Word batch |
| Intégrations | `/integrations` | **Admin uniquement** | OAuth Microsoft 365, WhatsApp config |
| Outils | `/outils` | Admin, Consultant | Index outils spécialisés |
| Analyser candidats | `/outils/analyser-candidats` | Admin, Consultant | Analyse batch IA |
| Rapport heures | `/outils/rapport-heures` | Admin, Consultant | Rapport heures + envoi email/WhatsApp |
| Paramètres | `/parametres` | Tous | Index paramètres |
| Profil | `/parametres/profil` | Tous | Édition profil |
| Sécurité | `/parametres/securite` | Tous | MDP, OTP 2FA, session timeout |
| Admin users | `/parametres/admin` | **Admin uniquement** | CRUD utilisateurs, invitations |
| Logs | `/parametres/logs` | Admin, Consultant | Logs accès + modifications |
| Doublons | `/parametres/doublons` | Admin, Consultant | Historique doublons résolus |
| Corriger photos | `/parametres/corriger-photos` | Admin, Consultant | Extraction photos CV |
| Demandes accès | `/parametres/demandes-acces` | **Admin uniquement** | Gestion demandes landing page |
| Import masse (params) | `/parametres/import-masse` | Admin | Import Excel secrétariat |

---

## Routes API critiques

⚠️ **État au 13/04/2026 (v1.8.33)** : Le middleware.ts exclut TOUTES les routes `/api/` de son matcher. La protection repose uniquement sur `requireAuth()` dans chaque route. **51 routes** sur 63 sont désormais protégées.

### Routes avec `requireAuth()` — 51 routes protégées (v1.8.33)
Toutes les routes critiques et importantes : `candidats/*`, `clients/*`, `admin/users`, `smtp/*`, `entretiens/*`, `integrations/*`, `cv/*`, `notes/*`, `matching/*`, `pipeline/*`, `logs`, `activites/*`, `whatsapp/send`, `microsoft/send`, `microsoft/email-*`, `email-templates`, `onedrive/folders`, `onedrive/reset-orphans`, `annonces/france-travail`, `candidats/audit/*`, `candidats/doublons/*`, `candidats/recheck-*`, `demande-acces/[id]`, `offres/externes`, `offres/externes/count`, `offres/externes/statut`, `offres/sync`

⚠️ v1.9.23 — Routes `cv/bulk` et `sharepoint/import` supprimées (orphelines, 0 trafic prod vérifié sur 30 jours). La route unifiée d'import est `/api/cv/parse` (appelée par UploadCV et public/import-worker.js pour les batches). Les syncs automatiques passent par `/api/onedrive/sync` (cron 10min).

### Routes sans requireAuth — restant (12 routes, toutes justifiées)
- `/api/onedrive/sync` — protégé par header CRON_SECRET
- `/api/missions`, `/api/missions/[id]` — user client + RLS (pas admin client)
- `/api/auth/*` — flows OTP/MDP/OAuth (pré-authentification)
- `/api/whatsapp/webhook` — webhook Meta avec validation signature
- `/api/microsoft/callback` — OAuth2 callback
- `/api/demande-acces` POST — formulaire public landing page
- `/api/metiers`, `/api/metier-categories` — données référence publiques
- `/api/geo` — données géo publiques

### Routes intentionnellement sans auth (acceptables)
- `/api/auth/*` — flows OTP/MDP/OAuth (pré-authentification)
- `/api/whatsapp/webhook` — webhook Meta avec validation signature
- `/api/microsoft/callback` — OAuth2 callback
- `/api/geo`, `/api/metiers`, `/api/metier-categories` — données référence publique

### Routes spéciales
- **`/api/cv/print`** — Proxy PDF (force `Content-Disposition: inline`)
- **`/api/cron/onedrive-sync`** — Cron Vercel 10min
- **`/api/cron/offres-sync`** — Cron Vercel 6h (scraping offres externes)
- **`/api/auth/*`** — Auth flows (OTP, MDP, OAuth callback)

---

## Features principales

- **Candidats** : import masse (ZIP/PDF/Word, rotation 180°, fallback Vision, timeouts par étape), parsing IA multi-modèle, fiche détaillée, CV viewer zoomable, photos, normalisation affichage (Prénom Nom, email minuscule, ville capitalisée)
- **cv_texte_brut** : colonne texte brut du CV (max 10 000 chars). Alimentée automatiquement par les 3 pipelines (import normal, import masse, OneDrive sync). Utilisée par : matching (pré-sélection 3000 chars + score final 2500 chars), recherche IA (snippet 300 chars), doublons (400 chars), recheck-batch (source principale), dédup import (500 chars anti-doublon). **Cron Vercel `*/5min`** (`/api/cron/extract-cv-text`) traite automatiquement les candidats avec cv_texte_brut NULL/vide — batch 20, filtre exclut `[scan-non-lisible]`/`[pdf-chiffre]`. Route status `/api/cron/extract-cv-text/status` (requireAuth) utilisée par la card Outils et la Sidebar. L'outil `/api/outils/extract-cv-text` reste disponible pour forçage manuel. Vision IA (Claude Haiku) en fallback pour PDFs scannés et images JPG/PNG — passés via URL source (pas de limite taille).
- **Doublons** : détection instantanée par critères exacts (email score 100, téléphone normalisé +41 score 95, nom+prénom score 85), historique en DB (`doublons_historique`), fusion guidée champ par champ — sans IA
- **Clients** : base de 1200+ entreprises, campagnes e-mail, gestion des contacts, filtre géographique, recherche IA (Claude web_search + zefix.ch/local.ch)
- **Pipeline** : grille 3 colonnes, onglets consultants (João/Seb) avec compteurs, sous-onglets métiers filtrés par consultant actif avec compteurs, cards enrichies, rappels (toast permanent), ModifierModal, aperçu CV au survol, catégorie "Non classés". Consultant **obligatoire** — erreur 400 si ajout sans consultant
- **Missions** : CRUD complet, stats marge brute/coefficient, bilan mensuel (jours fériés cantonaux), import Notion, sync Quadrigis (validation manuelle via missions_pending). Colonnes `vacances` et `arrets` (JSONB) — badges colorés par priorité (arrêt orange, vacances bleu, absence jaune, début bientôt, fin de mission), tri automatique, ETP prorata déduit absences/vacances/arrêts, marge moyenne dès avril 2026
- **Secrétariat** : dashboard séparé (rôle Secrétaire), 6 tables DB (candidats, accidents, ALFA, paiements, loyers, notifications), import Excel (430 candidats + 113 accidents + 180 ALFA + 76 paiements + 2 loyers), historique modifications, notifications auto+manuelles avec badge sidebar, WhatsApp partout, lien fiche candidat
- **Entretiens / Suivi** : vue liste, rappels avec notification, badge sidebar (lien sidebar masqué)
- **OneDrive** : sync automatique récursif (cron 10min), déduplication, historique fichiers, `cvScore=0` classé diplôme/certificat
- **France Travail** : formulaire Word pré-rempli, envoi Resend, CC fixe, historique
- **Messages** : email/SMS/WhatsApp avec templates, activité loggée
- **Intégrations** : Microsoft 365 OAuth par utilisateur (Outlook multi-compte)
- **Veille offres** : scraping automatique jobs.ch, jobup.ch, Indeed CH via Apify (27 requêtes métier × 3 sources). Table `offres_externes` avec upsert par `url_source`. Détection agences (60+ mots-clés). Modération 3 onglets (À traiter / Ouvertes / Ignorées). Badge sidebar compteur. Cron Vercel 6h + sync manuelle. Ciblage Suisse romande uniquement.
- **CDC viewer** : analyse IA d'un cahier des charges (PDF/DOCX/image) upload le fichier original vers `cvs/cdc/` (signed URL 10 ans), stocké dans `offres.cdc_url`. Bouton 📄 CDC sur les cards commandes ouvre un modal portalisé (`createPortal`). PDF/image via iframe `/api/cv/print`, DOCX/DOC via Office Web Viewer (`view.officeapps.live.com`), fallback "Télécharger" sinon.
- **Activité** : timeline par onglets (Pipeline, Messages, Candidats, Imports OneDrive)

---

## Variables d'environnement

### Publiques (NEXT_PUBLIC_*)
```
NEXT_PUBLIC_SUPABASE_URL          URL projet Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY     Anon key publique
NEXT_PUBLIC_APP_URL               Base URL app (localhost:3001 dev, talent-flow.ch prod)
```

### Serveur (jamais exposées côté client)
```
SUPABASE_SERVICE_ROLE_KEY         Service role (admin, bypasse RLS)
ANTHROPIC_API_KEY                 Claude API
MICROSOFT_CLIENT_ID               OAuth Microsoft 365
MICROSOFT_CLIENT_SECRET           OAuth secret
MICROSOFT_TENANT_ID               Tenant ID (défaut: common)
RESEND_API_KEY                    Emails transactionnels (OTP, France Travail)
SMTP_HOST / SMTP_USER / SMTP_PASS SMTP fallback (PASS chiffré AES-256-GCM)
SMTP_ENCRYPTION_KEY               Clé chiffrement SMTP
WHATSAPP_TOKEN                    WhatsApp Business API
WHATSAPP_PHONE_ID                 WhatsApp phone ID
WHATSAPP_VERIFY_TOKEN             Webhook verify
CRON_SECRET                       Protège /api/cron/*
ADMIN_EMAIL                       Email admin (OBLIGATOIRE sur Vercel, pas de fallback)
NOTION_TOKEN                      Import missions Notion
APIFY_API_KEY                     Scraping offres externes (Apify)
JOBROOM_API_URL / USERNAME / PW   Job-Room Suisse (SECO)
```

---

## Patterns critiques — NE PAS MODIFIER sans raison explicite

**1. Zoom CV** (`candidats/[id]/page.tsx`)
- Pattern : Scroll container → Wrapper div (`width: cvZoom*100%`, `height: cvZoom*5000px`) → iframe (`key` inclut `cvZoom+rotation`, `src: /api/cv/print#zoom=page-width`, `pointerEvents: none` si zoomé)
- Ne jamais utiliser `transform:scale` ou CSS `zoom` sur l'iframe — casse la qualité et le comportement natif
- `#zoom=page-width` obligatoire (jamais numérique)

**2. Batch filtering** (`api/candidats/route.ts`)
- Tous les IDs retournés par la RPC sont filtrés par groupes de 200 AVANT pagination
- `.limit(10000)` obligatoire sur l'appel RPC (limite par défaut Supabase = 1000)

**3. CV inline**
- Toujours passer par `/api/cv/print` comme proxy pour l'iframe PDF
- Les URLs Supabase Storage peuvent retourner `Content-Disposition: attachment` → téléchargement forcé
- Ne jamais utiliser l'URL Supabase directe dans un `<iframe src>`

**4. Pipeline — pas d'auto-ajout**
- `statut_pipeline` doit rester `null` à l'import
- Ne jamais le définir dans `ImportContext` ni dans `/api/cv/parse`
- L'ajout au pipeline se fait uniquement via action manuelle de l'utilisateur
- `pipeline_consultant` **obligatoire** si `statut_pipeline` non-null — erreur 400 sinon
- ✅ Fix v1.8.31 : DEFAULT 'nouveau' supprimé de la colonne (causait 21 fantômes)

**5. Import status**
- `'traite'` = onglet **Actif**
- `'a_traiter'` = onglet **À traiter**
- `'archive'` = onglet **Archivé**
- Ne pas confondre les valeurs — les filtres serveur et les basculements d'onglet en dépendent
- **JAMAIS modifier `import_status` sur un UPDATE candidat existant** — seulement `has_update:true`

**6. Import CV — logique complète (v1.8.30)**
- **Même CV + même date** (±1min) → SKIP total, 0 upload, message "Déjà importé"
- **Même CV + date différente** → update dates + `has_update:true`, 0 upload, statut "réactivé"
- **Nouveau contenu** → upload + update complet + `has_update:true`
- **CV plus ancien que l'actuel** → archiver dans `documents[]`, garder `cv_url` actuel
- JAMAIS changer `import_status` d'un candidat existant (seulement `has_update:true`)
- JAMAIS dupliquer dans `documents[]` (dédup par URL normalisée + nom de base)
- OneDrive sync : même logique, cron 10min = sync manuel
- `memeContenu` / `contenuIdentique` = gardes anti-doublons (texte 500 chars OU nom normalisé)

**7. Badges per-user (v1.9.16, durci v1.9.95) — last_import_at timestamp + sémantique stricte**

🔴 **RÈGLE ABSOLUE v1.9.95** : le badge rouge signale UN CHANGEMENT DE CV uniquement.
Aucune autre modification (notes, statut, rating, tags, pipeline, vu/non-vu) ne déclenche le réarmement du badge chez les autres consultants. Vu/non-vu est strictement per-user.

- `candidats.last_import_at TIMESTAMPTZ` = timestamp du dernier import CV (remplace has_update bool). Mise à jour par tous les imports (cv/parse, onedrive/sync, pending-validation). **JAMAIS écrit en dehors d'un import CV réel.**
- **Per-user strict** : chaque consultant a son propre état de lecture via `candidats_vus (user_id, candidat_id, viewed_at)` + `auth.users.raw_user_meta_data.candidats_viewed_all_at`
- **`hasBadge()`** : badge visible si `last_import_at > max(viewedAllAt du user courant, viewed_at dans candidats_vus)` OU (candidat récent ET pas vu)
- **Ouverture fiche** : `markCandidatVu(id)` → POST `/api/candidats/vus` (upsert candidats_vus du user courant). **Aucun UPDATE global sur la colonne candidats.**
- **"Tout marquer vu"** : DELETE candidats_vus du user + UPDATE user_metadata.candidats_viewed_all_at = now(). **JAMAIS de UPDATE global has_update=false** (c'était le bug multi-user réglé en v1.9.16).
- **"Marquer non vu" (v1.9.95)** : DELETE candidats_vus UNIQUEMENT pour le user courant. **JAMAIS pour tous** (l'ancien hack v1.9.47 forçait UPDATE last_import_at = NOW pour réarmer le badge globalement → polluait la sémantique). Conséquence : si je clique "Non vu", mon badge réapparaît chez moi seul. Seb garde son état "vu" intact.
- **Ré-import CV** : écrit `last_import_at=now()` + DELETE candidats_vus par candidat_id → badge réapparaît chez TOUS les users (même ceux qui avaient déjà vu la fiche).
- **Realtime postgres_changes (v1.9.95)** : le handler `useCandidatsRealtime` (monté au layout level via RealtimeBridge v1.9.94) ne purge le viewedSet local que SI `payload.old.last_import_at !== payload.new.last_import_at`. Pour comparer, **REPLICA IDENTITY FULL** est obligatoire sur la table candidats (migration v1.9.95). Avant ce fix, tout UPDATE (même notes/statut) réarmait le badge à tort chez les autres users → régression v1.9.94 corrigée.
- `has_update` bool reste en DB jusqu'à v1.9.17 pour rétrocompat, mais PLUS LU par le code.

**8. Normalisation noms de fichiers CV**
- Storage encode les espaces en underscores : `"BENCHAAR salim.pdf"` → `"1776xxx_BENCHAAR_salim.pdf"`
- Toute comparaison de noms de fichiers doit utiliser `normFn()` : strip timestamp `^\d+_` + normalise `[_\s]+` → `_` + lowercase
- `memeContenu`/`contenuIdentique` : compare AUSSI le nom de base (pas seulement le texte OCR, qui varie pour les images)
- Early filename match dans cv/parse : fallback `cleanName = file.name.replace(/^\d+_/, '').replace(/_/g, ' ')` pour matcher les noms storage→original
- Ne JAMAIS comparer `file.name` directement avec `cv_nom_fichier` sans normalisation

**9. "Définir comme CV principal" — nettoyage noms**
- Lors de la promotion d'un document `[Ancien] X.pdf` ou `[Archive] X.pdf`, strip le préfixe via `replace(/^\[(Ancien|Archive)\]\s*/i, '')`
- Appliqué sur `cv_nom_fichier` (nom promu) ET `ancienName` (nom archivé)
- **Archivage [Ancien]** : les 2 routes d'import (`cv/parse` L951 + `onedrive/sync` L1026-1042) doivent préfixer `[Ancien] ${oldName}` lors du push dans `documents[]`. Dédup accepte 3 variantes (URL match, nom brut, nom préfixé) pour éviter les doublons lors de ré-sync.

**10. Modaux / overlays avec `position: fixed`**
- Tout composant utilisant `position: fixed` (modaux, panels, tooltips, popovers) doit être rendu via `createPortal(jsx, document.body)`
- Framer Motion `transform` et d'autres propriétés CSS (filter, will-change) créent un nouveau "containing block" → cassent `position: fixed` sur les enfants
- Pattern validé : `if (typeof window === 'undefined') return null; return createPortal(modal, document.body)`

**11. Turbopack**
- Désactivé en dev local via flag `--webpack` (crash sur `app/(auth)/auth.css`)
- Actif uniquement sur le build Vercel (configuré via `turbopack.resolveAlias` dans `next.config.ts`)
- Les deux configs (`turbopack` + `webpack`) doivent coexister dans `next.config.ts`

**12. Scroll position — conteneur `.d-content`**
- Le scroll de l'app est sur `div.d-content` (CSS `overflow-y: auto`), PAS sur `window`
- Pour sauvegarder : `document.querySelector('.d-content')?.scrollTop`
- Pour restaurer : `container.scrollTop = y` (pas `window.scrollTo`)

**13. Navigation retour depuis fiche candidat**
- Paramètre `?from=pipeline|missions|secretariat` dans l'URL de la fiche
- Bouton retour lit ce paramètre → route dynamique
- Ajouter `?from=NOM_PAGE` à TOUS les liens vers `/candidats/[id]` depuis chaque page

**14. Classification document CV/non-CV — source unique `lib/document-classification.ts`**
- Utiliser `classifyDocument({ analyse, texteCV })` partout : import manuel (`cv/parse`), cron OneDrive (`onedrive/sync`), banc DRY-RUN (`onedrive/sync-test`)
- **JAMAIS de détection par nom de fichier** (ni `file.name`, ni `filename`). Règle dure depuis v1.9.33. Faux positifs trop nombreux ("CV_PASCALI..." classé non-CV, inverse possible aussi). Source unique de vérité : IA `document_type` + contenu texte + signaux structurels (email générique entreprise, absence d'expériences)
- Toute nouvelle règle de classification doit être ajoutée dans `lib/document-classification.ts`, pas dans un call site spécifique — sinon les 3 routes divergent et le DRY-RUN se met à mentir

**15. Détection "même fichier" CV — SHA256 du buffer (v1.9.42)**
- Colonnes DB : `candidats.cv_sha256 TEXT` + `candidats.cv_size_bytes INTEGER` + index partiel
- À chaque import (cv/parse + onedrive/sync) : `createHash('sha256').update(buffer).digest('hex')` stocké en DB
- Logique `contenuIdentique` (priorité) : `hashMatch || sizeMatch || textMatch || memeItemLiee` — JAMAIS `memeNomBase` (filename interdit)
- `sizeMatch` et `textMatch` sont des fallbacks pour le stock historique sans hash
- **Backfill opportuniste** : à chaque réactivation, écrire hash/size si absents → le stock historique se remplit naturellement
- Texte extrait par Vision IA (scans) est NON-DÉTERMINISTE → ne jamais l'utiliser comme signal primaire de "même fichier"

**16. Badge rouge per-user — DB source de vérité STRICTE (v1.9.40)**
- `lib/badge-candidats.ts` : `viewedSet = dbSet` (jamais d'UNION avec localStorage)
- localStorage est aligné sur DB à chaque init (`writeViewedSet(dbSet)`)
- Les IDs local-only (migration v1.9.9 résiduelle) sont ignorés — la migration est terminée
- Sans cette règle stricte : le DELETE serveur `candidats_vus` (lors d'un ré-import CV) est annulé par l'UNION client → badge ne réapparaît pas après update/réactivation

**17. SHA256 orphelins — garde-fou permanent (v1.9.43)**
- Cron `/api/cron/check-sha256-integrity` (dimanche 03h UTC) : compte `cv_url IS NOT NULL AND cv_sha256 IS NULL`, backfill batch 100 par exécution, log alerte si > 100
- Si un nouveau code oublie d'écrire `cv_sha256`+`cv_size_bytes` dans un INSERT/UPDATE, le cron le rattrape la semaine suivante
- Backfill initial one-shot : `node --env-file=.env.local scripts/backfill-cv-sha256.mjs` (~10min pour 6000 candidats)
- **Toujours écrire cv_sha256+cv_size_bytes dans tout chemin INSERT/UPDATE sur `candidats` qui touche `cv_url`** — sinon le cron alertera

**18. Invalidation React Query après sync manuel OneDrive (v1.9.43)**
- Après `setOnedriveSyncing(false)` dans `integrations/page.tsx` : invalider `['candidats']` + `['onedrive-fichiers']` + `['integrations']`
- Sans ça, le refetchInterval 30s fait attendre le badge rouge et le nouveau statut
- Pattern à reproduire pour tout futur bouton de sync/refresh manuel

**19. Invalidation React Query après import manuel UploadCV (v1.9.44)**
- Dans `handleUpload` de `UploadCV.tsx`, au `setDone(true)` : invalider `['candidats']` + `['candidat']`
- Couplé avec debounce Sidebar `badges-changed` réduit à 500ms (`components/layout/Sidebar.tsx`)
- Cumul refetchInterval 30s + debounce 3s faisait attendre 10-15s l'apparition du badge après import
- Règle générale : toute action user qui modifie des candidats doit invalider ces queries explicitement
- **AWAIT avant dispatch** (fix 20/04/2026) : dans `handleConfirmMatch` de `UploadCV.tsx`, faire `await Promise.all([invalidateQueries(['candidats']), invalidateQueries(['candidat', id])])` AVANT `dispatchBadgesChanged()`. Sans await, le dispatch tire sur l'ancien cache → la sidebar recalcule `hasBadge()` sur stale data → badge rouge invisible malgré DB OK.

**20. Dark mode — tokens sémantiques + classList ('dark') (v1.9.50)**
- `:root` = LIGHT (défaut), `.dark` = DARK — 2 jeux de variables OKLCH distincts dans `app/globals.css`
- `ThemeContext` pose `document.documentElement.classList.add/remove('dark')` pour activer Tailwind `dark:*`. `data-theme` maintenu en parallèle pour rétrocompat `dashboard.css` (25+ règles `[data-theme="dark"]`)
- Tokens disponibles : `--foreground`, `--background`, `--card`, `--popover`, `--muted`, `--muted-foreground`, `--border`, `--input`, `--primary`, `--primary-foreground`, `--primary-soft`, `--secondary`, `--accent`, `--ring`, `--destructive`, `--destructive-foreground`, `--success`, `--warning`, `--info` (+ variantes `-foreground` et `-soft` pour backgrounds pastel)
- Les tokens `-soft` (`--success-soft`, `--warning-soft`, `--info-soft`, `--destructive-soft`) = couleur avec opacité 12-22% selon le mode → pour fonds pastel d'alertes/badges qui s'adaptent light/dark
- `--destructive-foreground` = blanc constant (pour texte blanc sur bouton rouge, les deux modes)
- **JAMAIS hardcoder hex couleurs** dans `style={{}}` ou classes Tailwind (`bg-white`, `text-gray-900`, etc.). Toujours utiliser les tokens → assure la lisibilité dans les 2 modes. Exceptions : branding externe (Microsoft `#0078D4`, Google `#4285F4`), WhatsApp `#25D366`, données métier cantons suisses, couleurs sémantiques de statuts missions (arrêts orange, vacances bleu, etc.).
- `.glass-card` / `.glass` utilisent `var(--card)` + `var(--border)` — pas de couleurs OKLCH hardcodées

**21. Dashboard consultant enrichi (v1.9.50)**
- Header riche avec gradient `var(--warning-soft) → var(--success-soft)` + phrase motivationnelle via `lib/motivational-phrases.ts` (rotation jour+email, ~40 phrases mixtes).
- 3 badges cliquables À TRAITER / RAPPELS / ALERTES avec compteurs temps réel.
- KPIs dynamiques : 3 cards pour tous (Candidats, Clients, Commandes), 4 pour João (avec "ETP Missions" — détection `user?.email === 'j.barbosa@l-agence.ch'`). "En entretien" supprimé.
- Card "Pipeline par consultant" : barre segmentée par MÉTIER (couleurs via `getColorForMetier()` du hook `useMetierCategories`) pour João + Seb uniquement.
- Chart "Imports" : `BarChart` avec `LabelList` au-dessus + `Cell` colorées (dernière barre primary plein, autres `var(--primary-soft)`). Toggle Jour/Semaine/Mois.
- `RecentActivityWidget` active + Tips IA déterministes basés sur stats (À traiter >10, Commandes >20, Rappels en cours).

**22. TopBar — bouton "Importer" global (v1.9.50)**
- Bouton jaune brand "Importer" (avec icône Upload) à gauche du toggle ☀️/🌙, dans `components/layout/TopBar.tsx`.
- Utilise `useUpload().openUpload()` depuis `contexts/UploadContext.tsx` → ouvre la modale UploadCV globale (même composant que précédemment sur `/candidats`).
- Visible sur **toutes** les pages du dashboard (pas seulement `/candidats`).
- Bouton dupliqué retiré de `components/CandidatsList.tsx`.
- Mobile : classe `.d-topbar-import-label` cache le texte, icône seule reste visible.

**23. Badges colorés changement CV — manuel + OneDrive (v1.9.65, session 20/04/2026)**
- 3 types avec couleurs sémantiques : 🟢 **Nouveau** (`var(--success)`) / 🟡 **Réactivé** (`var(--warning)`) / 🔵 **Actualisé** (`var(--info)`)
- 2 sources de données indépendantes, priorité manuel > OneDrive :
  - **Manuel** (`lib/recently-updated.ts`) : localStorage `tf_recently_updated = { id: { ts, type } }`, TTL 10 min. Rétrocompat legacy format (number → 'mis_a_jour'). Event custom `talentflow:recently-updated-changed` pour re-render. `markRecentlyUpdated(id, type)` appelé dans 4 paths `UploadCV.tsx` (reactivated → 'reactive', doublon_updated → 'mis_a_jour', confirmMatch update → 'mis_a_jour', confirmMatch create → 'nouveau').
  - **OneDrive** (DB persistant) : colonnes `candidats.onedrive_change_type` (text CHECK IN 'nouveau'|'reactive'|'mis_a_jour') + `onedrive_change_at` (timestamptz) + index partiel. Écrit par `onedrive/sync` aux 4 points (Cas 2 reactivated + safety, Cas 3 update CV, INSERT nouveau). Effacé par `POST /api/candidats/[id]/clear-onedrive-badge` appelé depuis `candidats/[id]/page.tsx` useEffect d'ouverture — efface pour tous users (per-candidat, pas per-user, cohérent "changement vu").
- Affichage : `CandidatsList.tsx` badge pill top-right position absolute, lit `getRecentlyUpdatedEntry(c.id)` d'abord puis fallback sur `c.onedrive_change_type`. Tooltip "il y a Xmin" (manuel) vs "(OneDrive)" (persistant).
- **Indépendant du badge rouge per-user** : les 2 peuvent coexister. Badge rouge disparaît quand user ouvre la fiche (`markCandidatVu` upsert candidats_vus). Badge coloré manuel expire après 10 min (TTL), badge coloré OneDrive disparaît quand n'importe quel user ouvre la fiche (clear côté serveur).
- `api/candidats/route.ts` LIST_COLUMNS inclut `onedrive_change_type` + `onedrive_change_at`.

**24. Recherche booléenne candidats — parser recursive descent (v1.9.66 pack UX #2)**
- Fichier : `components/CandidatsList.tsx` → `parseBooleanSearch()` + `tokenizeBoolean()`. Grammaire : `or_expr = and_expr ('OU' and_expr)*` / `and_expr = factor ((ET|SAUF|ε) factor)*` / `factor = '(' expr ')' | word`.
- Supporte : `ET`/`AND`, `OU`/`OR`, `SAUF`/`NOT`, parenthèses `( )`, AND implicite entre mots adjacents. Insensible à la casse + unaccent via `normalize()`.
- **Trigger** : `hasBooleanSearch = /\b(ET|AND|OU|OR|SAUF|NOT)\b/i.test(q) || /[()]/.test(q)`. Les parenthèses seules déclenchent le mode booléen (même sans opérateur nommé).
- **OR/SAUF/parenthèses** → `booleanHasOr=true` → `per_page=0` (fetch tout, max 10k) + filtrage JS. **ET seul** → envoyé à la RPC serveur après strip des `ET`/`AND` (la RPC v3 fait AND entre mots → résultat identique).
- **Champs scannés en booléen client** : `prenom, nom, titre_poste, email, localisation, formation, notes, resume_ia, competences[], tags[]`. **PAS `cv_texte_brut`** (trop lourd pour 10k candidats en mémoire). La recherche classique (sans opérateur) passe par la RPC SQL qui scanne les 14 champs incluant `cv_texte_brut`.
- Popover "Recherche avancée" (icône Info ⓘ à côté de la barre) : 4 blocs pastel (`--success-soft` / `--info-soft` / `--destructive-soft` / `--primary-soft`), jamais `var(--muted)` comme fond (piège gris-sur-gris en light mode).

**25. Popover note portalisé — calcul espace dynamique (v1.9.66 pack UX #2)**
- `notePopoverRect` state stocke `getBoundingClientRect()` du bouton au clic. `createPortal(..., document.body)` + `position: fixed`.
- Calcul : `spaceAbove = rect.top - 12`, `spaceBelow = screenH - rect.bottom - 12`. `openUp` si `spaceAbove >= 220` OU `spaceAbove > spaceBelow`. `maxHeight` clampé à `Math.min(420, Math.max(180, space))`.
- **Raison** : popover auparavant `position: absolute; bottom: 100%` → clippé par le scroll container quand la card est proche du haut du viewport. Reproductible sur grands écrans avec peu de cards au-dessus.
- Reset `notePopoverRect` obligatoire aux 3 points de fermeture (toggle bouton, clic Fermer, save implicite non fait — saveNote garde le popover ouvert pour ajouts multiples).

**26. Persistance matching IA après retour fiche candidat (v1.9.66 pack UX #2)**
- `app/(dashboard)/matching/page.tsx` useEffect au mount : **ne PLUS appeler `matching.reset()` quand phase === 'done'**. Seuls les boutons "Nouvelle analyse" (L344) et "Vider les résultats" (L432) réinitialisent.
- Restauration : si `phase === 'done' && offreId && !isExterne` → `setSelectedOffre(matching.offreId)` pour afficher les infos de l'offre analysée.
- `MatchingContext` : déjà persistant via localStorage (`tf_matching_state`) + module-level state. Le problème était uniquement l'auto-reset au mount.
- Hover CV pattern (matching + historique) : réutilise `useCvHoverPreview` + `CvHoverPanel` + `CvHoverTrigger` de `components/CvHoverPreview.tsx`. FIELDS preselect + `MatchResult.candidat` + `MatchHistoryItem.results` enrichis avec `cv_url` + `cv_nom_fichier`. Les entrées d'historique créées avant v1.9.66 n'ont pas ces champs → pill "CV" masquée, normal.

**27. WhatsApp bulk depuis liste candidats — séquentiel user-driven (v1.9.67)**
- WhatsApp ne supporte **PAS** l'envoi à N contacts via une URL unique. Une boucle `window.open()` est bloquée par le popup-blocker du navigateur après le 1er. Pattern retenu : **1 clic = 1 chat ouvert**.
- Modal dans `components/CandidatsList.tsx` : bouton vert `#25D366` (brand WhatsApp) dans la barre d'actions bulk, à côté du bouton "Message" SMS/iMessage.
- État : `showWhatsApp`, `waOpenedIds: Set<string>` (candidats déjà ouverts), `waCampagneId` (UUID client pour grouper l'historique), `waLogged` (flag one-shot log).
- **Personnalisation per-candidat** : `personalize(tpl, c)` remplace `{prenom}` et `{nom}` (insensible à la casse) à l'envoi. Les variables `[MÉTIER]`/`[LIEU]` des templates SMS restent substituées une seule fois (globales, pas per-candidat). Templates SMS partagés avec la modal iMessage via `smsTemplates` / `smsTplId` / `smsMetier` / `smsLieu`.
- **Aperçu** : encart `--primary-soft` visible uniquement si `{prenom}` ou `{nom}` détectés dans `messageText`. Affiche le message substitué pour le **prochain candidat non-ouvert** (ou le 1er si aucun ouvert).
- **Ouverture** : `window.open(whatsapp://send?phone=${toWaPhone(tel)}&text=${encodeURIComponent(msg)}, '_blank')`. `toWaPhone()` importé depuis `lib/phone-format.ts` (factorisé v1.9.67 — DRY avec fiche candidat et /messages qui utilisaient la même logique dupliquée).
- **Log** : `logCampagneOnce()` appelé au 1er `openWhatsApp()`. POST `/api/messages/log` avec `candidat_ids` (tous avec tel), `destinataires` (numéros formatés), `canal:"whatsapp"`, `corps`, `campagne_id`. Fire-and-forget, ne bloque pas l'UI. Apparaît dans `/messages` Historique filtré WhatsApp.
- **UX** : barre progression verte + bouton "Suivant (Prénom Nom)" qui ouvre le prochain non-ouvert en 1 clic. Chaque ligne destinataire a son bouton "Ouvrir" (cliquable plusieurs fois pour rouvrir). Badge "✓ Ouvert" + fond vert après ouverture. Sans numéro → fond rouge `--destructive-soft`, ignoré.

**28. /messages nettoyé — onglets WhatsApp + SMS/iMessage retirés (v1.9.67)**
- TabId type : `'email' | 'templates' | 'historique'` (avant : aussi 'whatsapp' et 'sms'). Fonctions `WhatsAppTab()` + `SmsTab()` **supprimées** (254 lignes dead code). Imports `MessageCircle`, `Smartphone`, `toWaPhone` nettoyés.
- Raison : depuis v1.9.67, tout le bulk WhatsApp + SMS se fait depuis `/candidats` (barre d'actions bulk après sélection). L'onglet individuel `/messages → WhatsApp` faisait doublon et n'était plus utilisé en pratique. L'historique conserve tous les canaux (filtre par canal existant v1.9.66 inchangé).
- **Ne pas recréer** ces onglets. Si besoin de WhatsApp individuel : fiche candidat (bouton à côté du numéro de tel).

**29. Historique team partagé + warning 7 jours (v1.9.70)**
- **RLS SELECT emails_envoyes** : `USING true` depuis v1.9.70 → lecture globale team. INSERT/UPDATE/DELETE restent per-user (chacun ne supprime que ses propres envois).
- Colonne `emails_envoyes.user_name` remplie à l'insert par `/api/messages/log` (prénom depuis `user_metadata.prenom` ou fallback email local-part). Affichée dans l'historique via badge `👤 Vous` (primary-soft) ou `👤 Prénom` (secondary).
- `CampagneResume.is_own = (current_user_id === user_id)` → bouton supprimer conditionnel sur les cards historique.
- **`/api/messages/recent-contacts`** : endpoint GET `?candidat_ids=a,b,c` → pour chaque candidat, retourne le dernier contact (email/imessage/whatsapp/sms) par n'importe quel user dans les 7 derniers jours. Optimisé : 2 fetches parallèles (candidat_id direct + candidat_ids[] via `.overlaps`), merge côté serveur. Indexes partiels ajoutés (candidat_id + created_at, candidat_ids GIN).
- **Composant `RecentContactsWarning`** (`components/RecentContactsWarning.tsx`) : hook `useRecentContacts(ids, enabled)` + encart informatif `--warning-soft` avec liste "il y a X jours par Y via Z". Boutons "Fermer" + "Continuer malgré tout" — non bloquant. Intégré dans 3 modals : EmailTab, iMessage bulk, WhatsApp bulk.

**30. Mailing refondu — À/CC + perso per-destinataire + aperçu blanc + auto-complete (v1.9.70)**
- **Mode d'envoi** radio-cards `individual` / `grouped` :
  - `individual` (défaut) : boucle client `for (const email of destinataires)` → N emails séparés, personnalisés via `renderTemplate()` + contexte client résolu par email. Comportement historique préservé.
  - `grouped` : 1 seul POST `/api/microsoft/send` avec `send_mode:'grouped'`, `destinataires` → `toRecipients`, `cc` → `ccRecipients`. Variables `{client_*}` prennent le 1er destinataire. Champ CC n'apparaît que si `destinataires.length > 0`.
- **`/api/microsoft/send`** accepte désormais `cc: string[]` + `send_mode: 'grouped'`. Le `use_bcc` reste pour les cas "copie cachée massive" (rarement utilisé).
- **Overrides per-destinataire** (mode individual) : state `overrides: Record<email, { sujet?: string; corps?: string }>` + `previewIdx: number`. Flèches ←→ dans le header d'aperçu pour naviguer entre destinataires. Bouton "Personnaliser ce mail" crée l'override à partir du template effectif. Bouton "Réinitialiser" supprime l'override. `doSend()` lit `overrides[email]` avant fallback sur `sujet`/`corps` globaux. Cleanup auto des orphelins dans useEffect quand la liste change.
- **Aperçu fond blanc** : le container interne du preview (sujet + corps + signature) a `background: #ffffff; color: #000000` en dur (Outlook affiche toujours fond blanc, indépendant du thème destinataire). Le wrapper extérieur garde `var(--secondary)` + bordure dashed `var(--border)` pour l'intégration TalentFlow.
- **Recherche clients mailing (`ClientPickerModal`)** :
  - `useClients({ per_page: 2000 })` (avant: 500 → ratait les clients au-delà de la 500ème ligne)
  - `parseBooleanSearch()` extrait dans `lib/boolean-search.ts` (partagé avec CandidatsList). Si requête contient ET/OU/SAUF/parenthèses → utilise le matcher booléen. Sinon fallback sur `.includes()` unaccent.
  - Tooltip ⓘ à côté du search avec exemples.
- **Auto-complétion emails (`EmailChipInput`)** :
  - Nouveau endpoint `/api/emails/suggest` : agrège contacts clients (actifs, `clients.contacts[].email` + `client.email`) + team (`auth.users`) + destinataires récents (`emails_envoyes.destinataire` 30 jours, canal='email'). Dédup + priorité `client > team > recent`. Cap 5000.
  - Cache module-level `CACHED_SUGGESTIONS` (1 fetch au premier mount, partagé entre instances). Dropdown sous le champ dès 2 caractères. Match sur email + label (unaccent). Navigation clavier ↑↓ + Entrée + Esc. Pills colorées `Client`/`Team`/`Récent`.
  - Prop `disableAutocomplete` pour désactiver si besoin.

**31. Templates refonte 3 canaux + variables harmonisées + "copier vers" (v1.9.68-v1.9.70)**
- Table `email_templates.type` CHECK étend à `'email' | 'sms' | 'whatsapp'` (migration v1.9.68).
- `TemplatesTab` (`app/(dashboard)/messages/page.tsx`) groupe par canal (plus par catégorie). Header coloré (bg pastel + icône ✉️/💬/📱).
- `CreateTemplateForm` : radio-cards 3 canaux, sujet conditionnel (canal==='email' uniquement), variables cliquables en 2 groupes (communs 3 canaux vs email-only), insertion au curseur via `textareaRef.selectionStart/End`. Catégorie supprimée de l'UI (défaut 'general' en DB, non exposé).
- **Copier vers** : bouton sur chaque template Email/iMessage → POST nouveau template avec même corps + type changé + suffixe "→ WhatsApp" / "→ iMessage" dans le nom.
- **Variables harmonisées** (`lib/template-vars.ts`) : notation courte `{prenom}` / `{nom}` / `{metier}` / `{civilite}` ajoutée en plus de la legacy longue `{candidat_prenom}` / etc. Les 2 notations marchent sur les 3 canaux. `[MÉTIER]` / `[LIEU]` SMS legacy continuent à fonctionner (rétrocompat des 22 templates SMS existants).
- `CandidatsList.personalize()` (WhatsApp bulk) étendu : substitue `{prenom}`, `{nom}`, `{metier}` + aliases `{candidat_*}`.
- `waTemplates` state dans CandidatsList chargé à l'ouverture de `showWhatsApp` via `?type=whatsapp` — séparé de `smsTemplates` (iMessage).

**32. Activités compteurs + cron cleanup 30j (v1.9.70)**
- Endpoint `/api/activites/counts` : 4 count queries en parallèle (all + candidats + imports + clients), respecte filtres search + date_from/to (sinon compteurs trompeurs). Cast `supabase as any` car table `activites` absente des types Supabase auto-générés.
- Badges pill dans chaque onglet de `/activites`, cap à `9999+`, fond adapté actif/inactif.
- **Cron `/api/cron/cleanup-old-data`** : Vercel cron quotidien à `15 3 * * *` (03:15 UTC). Rétention glissante 30 jours — DELETE sur `emails_envoyes.created_at < now() - '30 days'` + même sur `activites`. Protection `CRON_SECRET`. Log consolidé.

**33. Signature email per-user (`user_metadata.signature_html`) (v1.9.70 setup Seb)**
- Signatures stockées dans `auth.users.raw_user_meta_data.signature_html` (cf. CLAUDE.md pattern historique mailing).
- Script `scripts/setup-seb-signature.mjs` idempotent : upload photo locale → Supabase Storage `public-assets/photos/sebastien.jpg`, génère HTML (clone de João avec photo/LinkedIn/natel adaptés), update user_metadata via `supabase.auth.admin.updateUserById`.
- Template HTML : table 2 colonnes (photo 117px | info + icônes sociaux), bannière L-AGENCE en bas. Bureau + Facebook + Instagram partagés avec João. LinkedIn + photo + mobile personnels.
- **Les users doivent se reconnecter** pour que le session cookie récupère la nouvelle meta.

---

## Points d'attention techniques

- **Tables sensibles RLS** : `app_settings`, `email_otps`, `onedrive_fichiers`, `secretariat_*`, `logs_secretariat` — toujours utiliser `createServiceRoleClient`, jamais le client public
- **Vercel bodySizeLimit** : configuré à `100mb` pour les imports ZIP volumineux (`serverActions.bodySizeLimit`)
- **Détection extension CV** : utiliser `cv_nom_fichier` en priorité (plus fiable), l'URL Supabase peut être un UUID sans extension visible
- **Login bypass dev** : `localhost:3001/admin` → magic link sans mot de passe via `supabase.auth.admin.generateLink` — bloqué en production
- **Zefix API** : l'API REST (ZefixREST + ZefixPublicREST) exige des credentials HTTP Basic — utiliser Claude `web_search_20250305` comme source principale pour la recherche d'entreprises suisses
- **ADMIN_EMAIL** : variable d'env obligatoire sur Vercel, pas de fallback hardcodé
- **Types Supabase** : colonnes ajoutées en migration ne sont pas dans `types/database.ts` auto-généré → utiliser `(data as any).colonne` ou régénérer les types

---

## Sécurité — dette technique (audit complet 13/04/2026)

✅ **Corrigé (v1.6.1→v1.8.30)** :
- SMTP password chiffré AES-256-GCM (`lib/smtp-crypto.ts`) — rétrocompatible
- `pipeline_rappels` UPDATE filtré par `user_id`
- RLS activé sur les 33 tables de la DB
- Sentry monitoring actif
- Timer inactivité 2h, persisté en localStorage + auto-logout sans OTP
- `pipeline_consultant` obligatoire à l'ajout pipeline (erreur 400 sinon)
- Fix CV rétrogradation : `importedIsOlder` check avant écrasement cv_url
- `candidats_vus` delete après update → badge rouge réapparaît
- Import CV : dédup complète (normFn), `has_update` remplace `import_status` mutation, badges fiables
- Nom CV principal : strip `[Ancien]`/`[Archive]` préfixes à la promotion
- Pipeline : DEFAULT 'nouveau' supprimé sur `statut_pipeline` + 21 fantômes nettoyés (v1.8.31)
- Audit DB v1.8.32 : index dupliqué `idx_candidats_created` supprimé, policy `recruteurs_candidats` supprimée, `auth.uid()` → `(select auth.uid())` sur 8 policies (plannings/candidats_vus/pipeline_rappels), `search_path = public` sur 7 fonctions, tables fantômes `candidates`/`jobs` supprimées, 3 index FK ajoutés, vues SECURITY INVOKER, `.limit(100)` sur demandes_acces

⚠️ **Restant — à traiter (par priorité)** :
- **DB** : 14 FK restantes sans index (3 ajoutées en v1.8.32)
- `sync-quadrigis` : appelé par Cowork (externe) → implémenter API key Bearer token
- Dashboard : 5 count queries séparées (optimiser avec RPC agrégée)
- 21 instances `<img>` au lieu de `<Image>` Next.js (performance)

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
