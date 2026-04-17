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
4. `git push origin main --tags`
5. Demander confirmation à João
6. `vercel --prod`

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
**1.9.19 production** — 17/04/2026

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
lib/                  — utils, supabase clients, cv-parser, onedrive, version, format-candidat
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
Toutes les routes critiques et importantes : `candidats/*`, `clients/*`, `admin/users`, `smtp/*`, `entretiens/*`, `integrations/*`, `cv/*`, `notes/*`, `matching/*`, `pipeline/*`, `logs`, `activites/*`, `whatsapp/send`, `microsoft/send`, `microsoft/email-*`, `email-templates`, `sharepoint/import`, `onedrive/folders`, `onedrive/reset-orphans`, `annonces/france-travail`, `candidats/audit/*`, `candidats/doublons/*`, `candidats/recheck-*`, `demande-acces/[id]`, `offres/externes`, `offres/externes/count`, `offres/externes/statut`, `offres/sync`

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

**7. Badges per-user (v1.9.16) — last_import_at timestamp**
- `candidats.last_import_at TIMESTAMPTZ` = timestamp du dernier import CV (remplace has_update bool). Mise à jour par tous les imports (cv/parse, cv/bulk, onedrive/sync, sharepoint/import).
- **Per-user strict** : chaque consultant a son propre état de lecture via `candidats_vus (user_id, candidat_id, viewed_at)` + `auth.users.raw_user_meta_data.candidats_viewed_all_at`
- **`hasBadge()`** : badge visible si `last_import_at > max(viewedAllAt du user courant, viewed_at dans candidats_vus)` OU (candidat récent ET pas vu)
- **Ouverture fiche** : `markCandidatVu(id)` → POST `/api/candidats/vus` (upsert candidats_vus du user courant). **Aucun UPDATE global sur la colonne candidats.**
- **"Tout marquer vu"** : DELETE candidats_vus du user + UPDATE user_metadata.candidats_viewed_all_at = now(). **JAMAIS de UPDATE global has_update=false** (c'était le bug multi-user réglé en v1.9.16).
- **Ré-import CV** : écrit `last_import_at=now()` + DELETE candidats_vus par candidat_id → badge réapparaît chez TOUS les users (même ceux qui avaient déjà vu la fiche).
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
