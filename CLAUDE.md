# TalentFlow — CLAUDE.md

> **Détails techniques** : `docs/CLAUDE-detailed-rules.md` (patterns complets + routes API)
> **Historique audits** : `docs/CLAUDE-history.md` (sécurité, dette technique)
> **Sessions/versions** : `~/.claude/.../memory/MEMORY.md` (auto-memory)

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
**1.9.119 prod (carte clients — géocodage rue précise + fitBounds percentile + click card focus + fix split)** — 29/04/2026

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
- **v1.9.104 — Option B : score ≥ 11 + DDN null des 2 côtés → uncertain** (sauf si email+tel identiques = garde-fou vrai update). Protège les homonymes avec tel/email partagé (couples, familles, indépendants) contre fusion silencieuse en OneDrive sync auto.
- **Simulation obligatoire** avant tout changement de seuil (scripts `scripts/tests/sim-*.mjs`)

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

⚠️ **État au 13/04/2026 (v1.8.33)** : middleware exclut TOUTES les routes `/api/`. Protection via `requireAuth()` dans chaque route. **51 routes protégées sur 63**. 12 routes sans auth toutes justifiées (cron `CRON_SECRET`, webhook Meta, OAuth callback, formulaires publics, données référence). Route unifiée d'import : `/api/cv/parse` ; sync auto : `/api/onedrive/sync` (cron 10min).

→ **Liste exhaustive + détails par catégorie** : `docs/CLAUDE-detailed-rules.md` (section Routes API).

### Routes spéciales à connaître
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

## Patterns critiques — résumés (détails dans `docs/CLAUDE-detailed-rules.md`)

> Chaque pattern résumé ci-dessous a un texte complet (cas edge, raisons, dates, fixes) dans `docs/CLAUDE-detailed-rules.md`. **Consulter le fichier détaillé avant toute modification d'un pattern**.

**1. Zoom CV** (`candidats/[id]/page.tsx`) — Wrapper div + iframe `/api/cv/print#zoom=page-width`. Jamais `transform:scale` ni CSS `zoom`.

**2. Batch filtering** (`api/candidats/route.ts`) — Filtrer les IDs RPC par groupes de 200 AVANT pagination. `.limit(10000)` obligatoire sur RPC.

**3. CV inline** — Toujours `/api/cv/print` comme proxy iframe PDF (sinon Supabase peut forcer download).

**4. Pipeline pas d'auto-ajout** — `statut_pipeline` reste `null` à l'import. `pipeline_consultant` obligatoire si non-null (400). DEFAULT supprimé v1.8.31.

**5. Import status** — `'traite'`=Actif, `'a_traiter'`=À traiter, `'archive'`=Archivé. JAMAIS modifier `import_status` sur UPDATE existant (juste `has_update:true`).

**6. Import CV — logique** (v1.8.30) — Même CV+même date→SKIP. Même CV+date diff→réactivé. Nouveau contenu→update complet. Plus ancien→archivé `documents[]`. Dédup URL+nom de base, jamais filename.

**7. Badges per-user** (v1.9.16, durci v1.9.95) — 🔴 Badge rouge = changement de CV UNIQUEMENT. `last_import_at` jamais écrit hors import. Vu/non-vu strict per-user via `candidats_vus` + `viewedAllAt`. Realtime exige REPLICA IDENTITY FULL + filtre `oldTs!==newTs`.

**8. Normalisation noms fichiers CV** — Storage `_` au lieu d'espaces. Toute compare via `normFn()` (strip timestamp + lowercase). Jamais `file.name` brut vs `cv_nom_fichier`.

**9. "Définir comme CV principal" — nettoyage noms** — Strip `[Ancien]`/`[Archive]` à la promotion. 2 routes import préfixent `[Ancien]`. Dédup 3 variantes (URL, brut, préfixé).

**10. Modaux `position: fixed`** — Toujours `createPortal(jsx, document.body)`. Framer Motion `transform` casse `position: fixed` sur enfants.

**11. Turbopack** — Dev local : `--webpack` (crash sur `auth.css`). Prod Vercel : Turbopack via `turbopack.resolveAlias` dans `next.config.ts`. Coexistence des 2 configs.

**12. Scroll position** — Conteneur `.d-content` (PAS `window`). `document.querySelector('.d-content')?.scrollTop`.

**13. Navigation retour fiche** — `?from=pipeline|missions|secretariat`. Bouton retour route dynamique.

**14. Classification CV/non-CV** — Source unique `lib/document-classification.ts`. JAMAIS détection par filename (v1.9.33). 7 règles IA-first (v1.9.102) : IA explicite > patterns 0-500 chars > CV-markers (variantes A/B) > email générique > texte<1500 > nom sans exp > fallback IA. Warning `name_ambiguity` validator. Simulation 100+ CVs obligatoire.

**15. SHA256 buffer CV** (v1.9.42) — `cv_sha256` + `cv_size_bytes` + index partiel. `contenuIdentique = hashMatch || sizeMatch || textMatch || memeItemLiee`. Backfill opportuniste à chaque réactivation.

**16. Badge rouge per-user — DB strict** (v1.9.40) — `viewedSet = dbSet` (PAS d'UNION localStorage). localStorage aligné sur DB à chaque init.

**17. SHA256 orphelins — garde-fou** (v1.9.43) — Cron `/api/cron/check-sha256-integrity` (dimanche 03h UTC). Toujours écrire `cv_sha256+cv_size_bytes` dans tout INSERT/UPDATE qui touche `cv_url`.

**18. Invalidation RQ après sync OneDrive** (v1.9.43) — Invalider `['candidats']` + `['onedrive-fichiers']` + `['integrations']` après `setOnedriveSyncing(false)`.

**19. Invalidation RQ après import UploadCV** (v1.9.44) — Invalider `['candidats']` + `['candidat']` au `setDone(true)`. Sidebar debounce 500ms. **AWAIT avant `dispatchBadgesChanged()`** sinon stale cache → badge invisible.

**20. Dark mode tokens** (v1.9.50) — `:root`=LIGHT, `.dark`=DARK. Tokens : `--foreground/background/card/popover/muted/border/input/primary/secondary/accent/ring/destructive/success/warning/info` + variantes `-foreground`, `-soft`. **JAMAIS hardcoder hex** (sauf branding externe Microsoft/Google/WhatsApp). `--destructive-foreground` blanc constant.

**21. Dashboard consultant enrichi** (v1.9.50) — Header gradient `--warning-soft → --success-soft` + phrase motivationnelle. 3 badges À TRAITER/RAPPELS/ALERTES. KPIs 3-4 cards. Card Pipeline par métier (João+Seb). Chart Imports BarChart + LabelList + Cell. RecentActivityWidget + Tips IA déterministes.

**22. TopBar bouton Importer** (v1.9.50) — Jaune brand, gauche du toggle thème, dans `TopBar.tsx`. `useUpload().openUpload()` depuis `UploadContext`. Visible sur toutes pages dashboard. Mobile : `.d-topbar-import-label` cache texte.

**23. Badges colorés changement CV** (v1.9.65) — 🟢 Nouveau / 🟡 Réactivé / 🔵 Actualisé. 2 sources : manuel (`lib/recently-updated.ts` localStorage TTL 10min) > OneDrive (DB `onedrive_change_type`+`onedrive_change_at`). Indépendant du badge rouge per-user. Clear OneDrive quand n'importe quel user ouvre la fiche.

**24. Recherche booléenne candidats** (v1.9.66) — Parser recursive descent dans `CandidatsList.tsx` (`parseBooleanSearch`+`tokenizeBoolean`). Supporte `ET/AND, OU/OR, SAUF/NOT`, parenthèses, AND implicite. Trigger : opérateur ou `()`. OR/SAUF/() → fetch 10k + filtrage JS. ET seul → RPC SQL. Pas `cv_texte_brut` en booléen.

**25. Popover note portalisé** (v1.9.66) — `notePopoverRect` via `getBoundingClientRect()`. `createPortal` + `position: fixed`. Calcul `spaceAbove`/`spaceBelow` + `maxHeight` clampé 180-420.

**26. Persistance matching IA** (v1.9.66) — `matching/page.tsx` ne reset PLUS au mount si `phase==='done'`. Boutons "Nouvelle analyse" + "Vider résultats" seuls reset. Hover CV via `useCvHoverPreview`+`CvHoverPanel`.

**27. WhatsApp bulk séquentiel** (v1.9.67) — 1 clic = 1 chat (popup-blocker bloque la boucle). Modal dans `CandidatsList.tsx`. Bouton `#25D366`. `personalize(tpl,c)` par candidat. `toWaPhone()` factorisé `lib/phone-format.ts`. Log fire-and-forget.

**28. /messages nettoyé** (v1.9.67) — Onglets WhatsApp+SMS/iMessage **supprimés** (254 lignes dead code). TabId : `'email'|'templates'|'historique'`. Bulk passe par `/candidats`. **Ne pas recréer**.

**29. Historique team partagé + warning 7j** (v1.9.70) — RLS `emails_envoyes` SELECT `USING true`. Colonne `user_name`. Endpoint `/api/messages/recent-contacts?candidat_ids=` (2 fetches parallèles + merge). Composant `RecentContactsWarning` non-bloquant intégré 3 modals.

**30. Mailing refondu** (v1.9.70) — Mode `individual` (boucle) vs `grouped` (1 POST avec `cc:string[]`). Overrides per-destinataire (`overrides`+`previewIdx`+flèches). Aperçu fond blanc dur. `ClientPickerModal` : `per_page:2000` + `parseBooleanSearch()` (lib partagée). `EmailChipInput` autocomplete via `/api/emails/suggest` (clients+team+récents) + cache module-level.

**31. Templates 3 canaux + variables harmonisées** (v1.9.68-70) — `email_templates.type` CHECK `'email'|'sms'|'whatsapp'`. TemplatesTab grouped par canal. CreateTemplateForm radio-cards. Bouton "Copier vers" canal. Variables `{prenom}/{nom}/{metier}/{civilite}` courtes + legacy `{candidat_*}` + SMS `[MÉTIER]/[LIEU]` rétrocompat.

**32. Activités compteurs + cron cleanup 30j** (v1.9.70) — `/api/activites/counts` (4 count parallèles, respecte filtres). Badges pill cap `9999+`. **Cron `/api/cron/cleanup-old-data`** quotidien `15 3 * * *` UTC. Rétention 30j sur `emails_envoyes` + `activites`.

**33. Signature email per-user** (v1.9.70) — `auth.users.raw_user_meta_data.signature_html`. Script `setup-seb-signature.mjs` idempotent. Reconnexion users requise pour récup nouvelle meta.

**34. Extraction photos F1bis Vision crop** (v1.9.105, étendu v1.9.107) — Scans A4 (ratio 1.3-1.55, ≥1500×2000px) rejetés `processXObjects` → collectés `RejectedFullPageScan` → branche Vision Haiku entre Strategy 2 et 3 via helper `tryVisionFaceCrop()`. **v1.9.107** : (a) FlateDecode aussi capturé (décompressé+ré-encodé JPEG, pas seulement DCTDecode), (b) F1bis-DOCX : grandes photos word/media/* (>2000px, ratio 0.5-3.0) → Vision face crop (cas Soraia 4032×3024), (c) source candidats Vision préfixée `vision-face:` → scoreHeadshot assouplit veto `uniqueColors<40` à `uc≥35` pour ces sources (cas José Antonio uc=39), (d) garde-fou face cover ratio (`faceSize/max(origW,origH) > 0.5 → reject`) remplace l'ancien `crop<orig*0.4` faux-restrictif sur photos paysage. Logs F5 prod tags structurés (`[F5-S1]`, `[F5-S2]`, `[F5-S1bis]`, `[F5-DOCX]`, `[F5-DOCX-S1bis]`, `[F5-S3]`, `[F5-Score]`, `[F5-Final]`). Bancs test `scripts/tests/test-photo-extraction.ts` (cible 22/22, atteint v1.9.107) + `sim-photo-extraction.ts` (cible 58/100, atteint 60/100 v1.9.107). Marqueur magique `photo_url='checked'` (tenté+échoué) ≠ NULL (jamais tenté). Batch rétroactif `scripts/batch/retro-photo-extraction.ts` (commit 332d365, 662/2824 photos extraites).

**35. Retry OneDrive non-CVs orphelins stoppé** (v1.9.106) — `onedrive/sync/route.ts` L1579 → `traite:true` sur erreur définitive "candidat introuvable". Erreurs transitoires (timeout, exception, fichier>10MB) conservent `traite:false`. Recovery manuel : ré-import via UploadCV ou SQL `traite=false`.

**36. Bandeau "Actualisé" pending-validation** (v1.9.106) — `pending-validation/route.ts` L161-180 ajoute `onedrive_change_type:'mis_a_jour'` + `onedrive_change_at` au payload. Cohérent cv/parse cvUpdated, onedrive/sync update, candidats/[id] onCvChange.

**41. Vue carte interactive /clients** (v1.9.118, enrichi v1.9.119) — `components/ClientsMap.tsx` + intégration toggle dans `app/(dashboard)/clients/page.tsx` (4 modes : grille / liste / carte / split). 2 colonnes DB `clients.latitude/longitude FLOAT` + index partiel `idx_clients_geo`. Stack : `leaflet@1.9.4` + `react-leaflet@5` + `leaflet.markercluster@1.5.3`. Lazy load via `next/dynamic({ ssr:false })` car Leaflet incompatible SSR. ClusterLayer en sub-component qui utilise `useMap()` + `L.markerClusterGroup` directement (pas de wrapper react-leaflet pour markercluster en v5). Markers : 1 par client, popup HTML statique avec ClientLogo+nom+badge Zefix+secteurs. Mode split = grid 40/60, carte sticky `top:16` `height:calc(100vh - 240px)`. Hook `useClients` étendu avec `options.enabled` pour ne pas fetch 5000 lignes en mode liste. Mode persisté dans `sessionStorage('clients_view')`. Tuiles OSM gratuites sans clé. **v1.9.119 améliorations** : (a) géocodage rue précise via `geocodeAddress(adresse, npa, ville, pays)` dans `lib/geocode-localisation.ts` (séparé de `geocodeLocalisation` qui reste pour candidats) — Nominatim avec query complète "Rue X 26, 1870 Monthey, Suisse", fallback centroïde NPA si Nominatim KO ; (b) pipeline POST/PATCH `/api/clients` non-bloquant via `after()` de `next/server` — response immédiate avec centroïde NPA (lookup local sync ~1ms), Nominatim adresse précise en background → UPDATE coords quand prêt ; PATCH re-géocode si `adresse` OU `npa` OU `ville` change ; (c) fitBounds **percentile 5-95** sur lat/lng séparément — ignore outliers géographiques (1 client en Suisse alémanique ne tire plus le viewport jusqu'à Bern), tous markers restent rendus, viewport initial serré ; (d) **click card en mode split = focus marker carte** (au lieu d'ouvrir fiche) via prop `focusedClientId` + `useRef<Map<id,Marker>>` + `cluster.zoomToShowLayer(marker, () => marker.openPopup())` ; bouton "Voir la fiche →" dédié en bas de card avec `stopPropagation` ; border jaune sur card sélectionnée ; (e) fix split view — `flexDirection:'column'` étendu au mode split (cards empilées verticalement lisibles, plus écrasées en row). Batch `scripts/batch/geocode-clients.ts` (centroïde, 1219/1219 en <5s) + `geocode-clients-addresses.ts` (rue précise, 875/1025 = 85.4% via Nominatim ~19 min, 0 régression sur les 150 KO qui gardent centroïde). Test interactif Leaflet doit être validé en localhost — non testable en CI/build.

**40. Vérification Zefix (registre du commerce suisse)** (v1.9.117) — Source unique `lib/zefix.ts`. API publique sans auth via `POST https://www.zefix.admin.ch/ZefixREST/api/v1/firm/search.json` (endpoint interne du site web zefix.ch — le `ZefixPublicREST` documenté Swagger demande Basic Auth, lui). 4 colonnes en DB : `clients.zefix_uid` (CHE-XXX.XXX.XXX, index unique partiel) + `zefix_status` (EXISTIEREND/AUFGELOEST/GELOESCHT) + `zefix_name` (raison sociale RC) + `zefix_verified_at` (timestamptz). `searchZefix()` fait retry intelligent : si nom complet → 404, retente sans suffixes commerciaux (SA/Sàrl/AG/GmbH/SAS/EURL/SARL/SNC) car Zefix ne match pas "SA" ↔ "S.A." en string. `nameSimilarity()` Levenshtein normalisé + bonus containment. Fuzzy threshold 75 (verify) / 88 (already_in_talentflow). 2 routes : `POST /api/clients/zefix/search` (proxy + flag déjà-en-DB) + `POST /api/clients/zefix/verify` (cherche + persiste les 4 zefix_*, log activité, bonus +5 si ville Zefix matche ville DB). UI : modale "Ajouter un client" avec 3 onglets `Zefix RC` (default, gratuit, instantané) → `Recherche IA` (Claude+web_search, lent mais récupère adresse/tel/site) → `Saisie manuelle`. Section "Registre du commerce" sur fiche `/clients/[id]` avec badge statut coloré, bouton Vérifier/Re-vérifier, bandeau alerte rouge si GELOESCHT et orange si AUFGELOEST, lien `cantonalExcerptWeb`. Batch `scripts/batch/zefix-audit-clients.ts` : DRY-RUN par défaut, `--apply` pour persister, rate limit 300ms, skip si vérifié <30j, CSV `~/Desktop/zefix-audit-clients.csv` avec 6 actions (OK_ACTIF/EN_LIQUIDATION/RADIE/NOM_DIFFERENT/NOT_FOUND/ALREADY_VERIFIED). UPDATE DB **uniquement** les 4 zefix_*, **JAMAIS** le statut client — João décide manuellement après. Limitation API : pas d'adresse postale complète (juste `legalSeat` = ville RC), pas de tel/site web — pour ces données utiliser onglet Recherche IA.

**39. Logos entreprises automatiques** (v1.9.115) — `components/ClientLogo.tsx` rend le logo d'un client à partir de `site_web`. Cascade fallback : logo.dev (si `NEXT_PUBLIC_LOGO_DEV_TOKEN` présent, free tier 1000/mois, vrais logos haute qualité) → Google Favicons (gratuit sans clé, qualité variable) → initiales colorées sur palette 12 couleurs (hash stable du nom → index). `<img>` natif (pas Next/Image, évite whitelist next.config), lazy loading, skeleton pulse pendant load, `onError` cascade automatique entre les 3 stages. Tailles `sm` 32px (cards) / `md` 48px / `lg` 64px (header fiche). Helpers : `extractDomain` (strip protocol/www/path/query), `getInitials` (strip SA/Sàrl/AG/GmbH/Ltd, 2 lettres max). Intégré 4 endroits : `/clients` cards (sm), `/clients/[id]` header (lg), `ClientPickerModal` mailing (sm), `ProspectionModal` (sm). **Clearbit Logo API a été sunset par HubSpot 2024** (DNS `logo.clearbit.com` dead) — ne pas réintroduire. Setup token : signup logo.dev → `.env.local` + Vercel env vars `NEXT_PUBLIC_LOGO_DEV_TOKEN=tok_xxx`. Sans token, mode dégradé Google Favicons immédiat (pas de blocage déploiement).

**38. Secteurs d'activité clients** (v1.9.114, remplace v1.9.113 metiers_recherches) — Colonne `clients.secteurs_activite TEXT[]` + index GIN `idx_clients_secteurs`. Source unique `lib/secteurs-extractor.ts` : `SECTEURS_ACTIVITE` (25 valeurs fermées ordonnées par catégorie : Maçonnerie [Gros Œuvre] → Électricité, Peinture, Plâtrerie, Sanitaire, Chauffage, Ventilation, Menuiserie, Charpente, Ferblanterie, Couverture, Étanchéité, Carrelage, Paysagisme [Second Œuvre] → Serrurerie, Soudure, Tuyauterie, Industrie [Technique] → Architecture, Ingénierie → Logistique → Manutention → Nettoyage → Restauration, Autres), `extractSecteursFromClient(notes, secteur)` priorité notes → fallback NOGA Zefix → none, `sanitizeSecteurs()` valide inputs UI/API, `SECTEUR_REPRESENTATIVE_METIER` mapping pour résolution couleurs via `useMetierCategories` (Architecture en bleu clair, Logistique en vert). Pipeline auto : `POST /api/clients` extrait à la création si non fourni, `PATCH /api/clients/[id]` recalcule à chaque modif notes (sauf si `secteurs_activite` fourni explicitement = édition manuelle prioritaire). Filtre API `?secteurs=Sanitaire,Chauffage` (CSV) → `.overlaps()` OR logique + `?ville=`, `?npa=`, `?canton=`, `?contacts=avec|sans`, `?created_after=`, `?created_before=`. Endpoint stats `GET /api/clients/secteurs-stats` (agrégat + sort desc, cache 5min). UI /clients : dropdown multi-select (popover checkboxes pastille couleur trié par fréquence avec count) dans filtres avancés ; pills card max 2 + "+X" + header fiche max 3 + "+X" colorées par catégorie ; pagination header style /candidats (per_page 20/50/100/1000/Tous) ; recherche RPC `search_clients_filtered` avec tiebreaker succursales (`jsonb_array_length(contacts) DESC` puis présence notes DESC) — quand search actif, le tri front 'recent' par created_at est désactivé pour respecter relevance serveur. Modale création + ContactsEditor display+edit (mode card avec bouton Pencil → mode édition 5 inputs + Check/Cancel). Bug NPA : `lib/cp-to-ville.ts` (datasets geonames CH+FR) résout `1000` → `Lausanne%` prefix-match (couvre 1000-1018, exclut Romanel-sur-Lausanne). ClientPickerModal mailing + ProspectionModal partagent le même multi-select secteurs. Batch one-shot `scripts/batch/extract-secteurs-clients.ts` enrichit 1174/1221 (96.2%) ; `scripts/batch/clean-notes-metiers-only.ts` vide 980/1191 notes redondantes ; `scripts/batch/report-contacts-incomplets.ts` génère CSV 181 contacts à compléter. Source distincte du `secteur` NOGA Zefix qui reste intact (pas affiché en UI).

**37. Géolocalisation par rayon** (v1.9.110) — Colonnes `candidats.latitude/longitude` FLOAT + index partiel `idx_candidats_geo`. RPC PostgreSQL `haversine_km` IMMUTABLE + `candidats_dans_rayon(p_lat, p_lng, p_rayon_km, p_ids[])` STABLE retourne `(id, distance_km)` ASC NULLS LAST. Pipeline import géocode auto via `lib/geocode-localisation.ts` (lookup local CP `scripts/data/cp_geo.json` 23780 entrées CH+FR ~95% des cas, fallback Nominatim async timeout 3s). UPDATE coords dans `merge-candidat.ts` recalcule lat/lng dès que localisation change. API `/api/candidats?lat=...&lng=...&rayon_km=...` branche RPC après pré-filtre (search + colonnes). Endpoint `/api/villes/suggestions?q=...` autocomplete instantané (pas de DB, pas de réseau). UI : champ VILLE & RAYON dans filtres avancés + presets 10/25/50/100 km + valeur libre 1-500. Badge orange "12 km" sur card si filtre actif. Validation Europe (35-72°N, -10 à +40°E) rejette FP géographiques. Candidats sans coords toujours affichés en queue.

---

## Points d'attention techniques

- **Tables sensibles RLS** : `app_settings`, `email_otps`, `onedrive_fichiers`, `secretariat_*`, `logs_secretariat` — toujours utiliser `createServiceRoleClient`, jamais le client public
- **Vercel bodySizeLimit** : configuré à `100mb` pour les imports ZIP volumineux (`serverActions.bodySizeLimit`)
- **Détection extension CV** : utiliser `cv_nom_fichier` en priorité (plus fiable), l'URL Supabase peut être un UUID sans extension visible
- **Login bypass dev** : `localhost:3001/admin` → magic link sans mot de passe via `supabase.auth.admin.generateLink` — bloqué en production
- **Zefix API** : l'API REST (ZefixREST + ZefixPublicREST) exige des credentials HTTP Basic — utiliser Claude `web_search_20250305` comme source principale pour la recherche d'entreprises suisses
- **ADMIN_EMAIL** : variable d'env obligatoire sur Vercel, pas de fallback hardcodé
- **Types Supabase** : colonnes ajoutées en migration ne sont pas dans `types/database.ts` auto-généré → utiliser `(data as any).colonne` ou régénérer les types
- **Migration onedrive_fichiers v1.9.31** : colonnes `match_suspect_candidat_id`, `match_suspect_score`, `cv_url_temp`, `analyse_json` appliquées via Supabase Studio sans fichier .sql versionné. À formaliser si on retouche `pending_validation`.

---

## Sécurité — dette technique

État au 13/04/2026 : audit complet effectué. ✅ Corrigé v1.6.1→v1.8.32 (SMTP AES-256, RLS 33 tables, Sentry, timer inactivité, requireAuth() 51 routes, fixes import/badges/pipeline, audit DB). ⚠️ Restant : 14 FK sans index, sync-quadrigis Bearer token, dashboard count queries → RPC, 21 `<img>` → `<Image>` Next.js.

→ **Détails complets** : `docs/CLAUDE-history.md`

---

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
