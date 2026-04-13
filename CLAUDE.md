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

**Déploiement Vercel** : ne jamais lancer `vercel --prod` sans avoir suivi la séquence git ci-dessus et obtenu la confirmation explicite de João. Récap obligatoire avant chaque déploiement :

```
✅ Tâches terminées : [liste]
⚠️ Points d'attention : [liste si applicable]
🚀 Prêt à déployer sur Vercel — tu confirmes ? (oui / non)
```

---

## Version actuelle
**1.8.20 production** — 13/04/2026

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
| Offres | `/offres` | Admin, Consultant | CRUD offres emploi |
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

### Auth requise (`requireAuth()`)
| Route | Méthodes | Description |
|-------|----------|-------------|
| `/api/candidats` | GET, POST, DELETE | Liste, création, suppression batch |
| `/api/candidats/[id]` | GET, PATCH, DELETE | Lecture, édition, suppression |
| `/api/logs` | GET | Logs accès |
| `/api/matching` | GET | Scoring IA |
| `/api/pipeline/clear` | POST | Vider étape pipeline |
| `/api/pipeline/stages` | GET | Étapes pipeline custom |
| `/api/notes` | GET, POST, PATCH, DELETE | Notes candidats |
| `/api/clients` | GET, POST | Liste clients |
| `/api/clients/[id]` | PATCH, DELETE | Édition client |
| `/api/missions` | GET, POST | Liste missions |
| `/api/missions/[id]` | PATCH, DELETE | Édition mission |

### Routes sensibles sans requireAuth (⚠️ dette technique)
- `/api/cv/parse` — 1000+ lignes, parsing CV, pas de requireAuth complet
- `/api/cron/onedrive-sync` — protégé par header Bearer CRON_SECRET uniquement
- `/api/sync-quadrigis` — appelé par Cowork externe, pas de Bearer token

### Routes spéciales
- **`/api/cv/print`** — Proxy PDF (force `Content-Disposition: inline`)
- **`/api/cron/onedrive-sync`** — Cron Vercel 10min
- **`/api/auth/*`** — Auth flows (OTP, MDP, OAuth callback)

---

## Features principales

- **Candidats** : import masse (ZIP/PDF/Word, rotation 180°, fallback Vision, timeouts par étape), parsing IA multi-modèle, fiche détaillée, CV viewer zoomable, photos, normalisation affichage (Prénom Nom, email minuscule, ville capitalisée)
- **Doublons** : détection instantanée par critères exacts (email score 100, téléphone normalisé +41 score 95, nom+prénom score 85), historique en DB (`doublons_historique`), fusion guidée champ par champ — sans IA
- **Clients** : base de 1200+ entreprises, campagnes e-mail, gestion des contacts, filtre géographique, recherche IA (Claude web_search + zefix.ch/local.ch)
- **Pipeline** : grille 3 colonnes, onglets consultants (João/Seb) avec compteurs, sous-onglets métiers filtrés par consultant actif avec compteurs, cards enrichies, rappels (toast permanent), ModifierModal, aperçu CV au survol, catégorie "Non classés". Consultant **obligatoire** — erreur 400 si ajout sans consultant
- **Missions** : CRUD complet, stats marge brute/coefficient, bilan mensuel (jours fériés cantonaux), import Notion, sync Quadrigis (validation manuelle via missions_pending)
- **Secrétariat** : dashboard séparé (rôle Secrétaire), 6 tables DB (candidats, accidents, ALFA, paiements, loyers, notifications), import Excel (430 candidats + 113 accidents + 180 ALFA + 76 paiements + 2 loyers), historique modifications, notifications auto+manuelles avec badge sidebar, WhatsApp partout, lien fiche candidat
- **Entretiens / Suivi** : vue liste, rappels avec notification, badge sidebar (lien sidebar masqué)
- **OneDrive** : sync automatique récursif (cron 10min), déduplication, historique fichiers, `cvScore=0` classé diplôme/certificat
- **France Travail** : formulaire Word pré-rempli, envoi Resend, CC fixe, historique
- **Messages** : email/SMS/WhatsApp avec templates, activité loggée
- **Intégrations** : Microsoft 365 OAuth par utilisateur (Outlook multi-compte)
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

**5. Import status**
- `'traite'` = onglet **Actif**
- `'a_traiter'` = onglet **À traiter**
- `'archive'` = onglet **Archivé**
- Ne pas confondre les valeurs — les filtres serveur et les basculements d'onglet en dépendent

**6. Modaux / overlays avec `position: fixed`**
- Tout composant utilisant `position: fixed` (modaux, panels, tooltips, popovers) doit être rendu via `createPortal(jsx, document.body)`
- Framer Motion `transform` et d'autres propriétés CSS (filter, will-change) créent un nouveau "containing block" → cassent `position: fixed` sur les enfants
- Pattern validé : `if (typeof window === 'undefined') return null; return createPortal(modal, document.body)`

**7. Turbopack**
- Désactivé en dev local via flag `--webpack` (crash sur `app/(auth)/auth.css`)
- Actif uniquement sur le build Vercel (configuré via `turbopack.resolveAlias` dans `next.config.ts`)
- Les deux configs (`turbopack` + `webpack`) doivent coexister dans `next.config.ts`

**8. Scroll position — conteneur `.d-content`**
- Le scroll de l'app est sur `div.d-content` (CSS `overflow-y: auto`), PAS sur `window`
- Pour sauvegarder : `document.querySelector('.d-content')?.scrollTop`
- Pour restaurer : `container.scrollTop = y` (pas `window.scrollTo`)

**9. Navigation retour depuis fiche candidat**
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

## Sécurité — dette technique (audit 12/04/2026)

✅ **Corrigé (v1.6.1→v1.8.12)** :
- SMTP password chiffré AES-256-GCM (`lib/smtp-crypto.ts`) — rétrocompatible
- `pipeline_rappels` UPDATE filtré par `user_id`
- RLS `logs_acces` SELECT authenticated, `entretiens` policies simplifiées, `candidates` RLS activé
- 9 routes API protégées par `requireAuth()` (candidats, logs, matching, pipeline/clear, pipeline/stages, notes, clients + 2 routes supplémentaires)
- Sentry monitoring actif
- Timer inactivité persisté en localStorage
- `pipeline_consultant` obligatoire à l'ajout pipeline (erreur 400 sinon)

⚠️ **Restant — à traiter** :
- `sync-quadrigis` : appelé par Cowork (externe) → implémenter API key Bearer token
- `cv/parse` : route 1000+ lignes, audit auth dédié à planifier
- Dashboard : 5 count queries séparées (optimiser avec RPC agrégée)
