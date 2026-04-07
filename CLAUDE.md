# TalentFlow — CLAUDE.md

## Version actuelle
**v0.27.0 beta** — commit `f8f27ea` — 07/04/2026

## Stack technique
- **Frontend** : Next.js 16.1.7 (App Router), React 19, TypeScript 5, Tailwind CSS 4
- **Backend/DB** : Supabase (PostgreSQL + RLS), Supabase Auth + OTP email
- **State** : React Query v5 (serveur), Context API (client), localStorage (UI persistant)
- **IA** : Claude API (Anthropic `^0.79`), Google Generative AI (`^0.24`), Groq (`^1.1`) — parsing CV et matching
- **Docs** : pdf-lib, pdfjs-dist v5, mupdf v1.27, tesseract.js v7 (OCR), docx, mammoth, word-extractor
- **Emails** : Resend (prioritaire), Nodemailer/SMTP (fallback), WhatsApp Business API
- **Intégrations** : Microsoft Graph API (Outlook, OneDrive, SharePoint)
- **UI** : DnD Kit, Framer Motion, Recharts, Leaflet, Radix UI, shadcn, sonner
- **Déploiement** : Vercel Pro — région `dub1`
- **Dev local** : port 3001, commande `next dev --port 3001 --webpack` (Turbopack désactivé en dev)

## Features principales
- **Candidats** : import masse (ZIP/PDF/Word), parsing IA multi-modèle, fiche détaillée, CV viewer, photos, doublons
- **Clients** : base de 1200+ entreprises, campagnes e-mail, gestion des contacts, filtre géographique
- **Pipeline** : Kanban drag & drop, aperçu CV au survol, matching IA candidat↔offre
- **Entretiens / Suivi** : vue liste, rappels avec notification, badge sidebar
- **OneDrive** : sync automatique récursif (cron 10min), déduplication, historique fichiers
- **France Travail** : formulaire Word pré-rempli, envoi Resend, CC fixe, historique
- **Messages** : email/SMS/WhatsApp avec templates, activité loggée
- **Intégrations** : Microsoft 365 OAuth par utilisateur (Outlook multi-compte)
- **Activité** : timeline par onglets (Pipeline, Messages, Candidats, Imports OneDrive)

## Structure des dossiers
```
app/(dashboard)/          — pages + API routes (Next.js App Router)
  api/                    — routes API server-side (candidats, cv, pipeline, clients…)
  candidats/[id]/         — fiche candidat
  pipeline/               — kanban
  offres/ entretiens/ ... — autres pages
components/               — composants React (PascalCase)
  CvHoverPreview.tsx      — aperçu CV au survol (hook + trigger + panel)
  CvPreviewCanvas.tsx     — rendu PDF/image dans le panneau hover
  CandidatsList.tsx       — liste candidats avec filtres, dropdown métier
  ui/                     — shadcn/Radix primitives
contexts/                 — Context API (Upload, Import, Matching, Photos, Doublons, Theme)
hooks/                    — custom hooks (useCandidats, useClients, useMetiers…)
lib/                      — utils, supabase clients, cv-parser, onedrive, version
types/database.ts         — types Supabase auto-générés (snake_case)
supabase/migrations/      — SQL migrations versionnées
```

## Conventions de code
- Fichiers composants : `PascalCase.tsx` — fonctions/hooks : `camelCase`
- Champs DB : `snake_case` — classes CSS : `kebab-case`
- Styles : Tailwind CSS en priorité, inline styles pour valeurs dynamiques, `dashboard.css` pour classes partagées
- Toasts via **sonner** (`toast.success/error`), jamais d'alert() natif
- Appels API : `fetch` + `async/await` avec try/catch, erreurs remontées en JSON `{ error: string }`
- Versioning : bumper `lib/version.ts` + ajouter entrée dans `CHANGELOG.md` à chaque commit notable

## Patterns critiques — NE PAS MODIFIER sans raison explicite

**1. Zoom CV** (`candidats/[id]/page.tsx`)
- Pattern : Scroll container → Wrapper div (`width: cvZoom*100%`, `height: cvZoom*5000px`) → iframe (`key` inclut `cvZoom`, `src: #zoom=page-width`, `pointerEvents: none` si zoomé)
- Ne jamais utiliser `transform:scale` ou CSS `zoom` sur l'iframe — casse la qualité et le comportement natif

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

**5. Import status**
- `'traite'` = onglet **Actif**
- `'a_traiter'` = onglet **À traiter**
- Ne pas confondre les valeurs — les filtres serveur et les basculements d'onglet en dépendent

**6. Turbopack**
- Désactivé en dev local via flag `--webpack` (crash sur `app/(auth)/auth.css`)
- Actif uniquement sur le build Vercel (configuré via `turbopack.resolveAlias` dans `next.config.ts`)
- Les deux configs (`turbopack` + `webpack`) doivent coexister dans `next.config.ts`

## Points d'attention techniques

- **Tables sensibles RLS** : `app_settings`, `email_otps`, `onedrive_fichiers` — toujours utiliser `createServiceRoleClient`, jamais le client public
- **Vercel bodySizeLimit** : configuré à `100mb` pour les imports ZIP volumineux (`serverActions.bodySizeLimit`)
- **Détection extension CV** : utiliser `cv_nom_fichier` en priorité (plus fiable), l'URL Supabase peut être un UUID sans extension visible
- **Login bypass dev** : `localhost:3001/admin` → magic link sans mot de passe via `supabase.auth.admin.generateLink` — bloqué en production

## Règles de comportement

**Langue** : toujours répondre en **français**, même si le code est en anglais.

**Avant de toucher** :
- Auth / middleware / RLS → demander confirmation explicite, risque élevé de régresser l'accès
- Migrations Supabase → toujours montrer le SQL avant d'exécuter
- Suppression de données ou colonnes → demander confirmation, action irréversible
- `app_settings`, `email_otps`, `onedrive_fichiers` → tables sensibles, vérifier les RLS

**Signaler les risques** :
- Tout changement dans `lib/supabase/`, `middleware.ts` ou `app/(auth)/` → mentionner le risque
- Modifications des routes API existantes → vérifier les usages côté client avant
- Ajout de dépendances npm lourdes → signaler l'impact sur le bundle Vercel

**Style de réponses** : concis, direct, pas de résumé en fin de réponse.
