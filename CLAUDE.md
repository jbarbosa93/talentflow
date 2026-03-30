# TalentFlow — CLAUDE.md

## Stack technique
- **Frontend** : Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4
- **Backend/DB** : Supabase (PostgreSQL + RLS), Supabase Auth + OTP email
- **State** : React Query (serveur), Context API (client), localStorage (UI persistant)
- **IA** : Claude API (Anthropic), Google Generative AI, Groq — pour parsing CV et matching
- **Docs** : pdf-lib, pdfjs, mupdf, tesseract.js (OCR), docx, mammoth, word-extractor
- **Emails** : Resend (prioritaire), Nodemailer/SMTP (fallback), WhatsApp Business API
- **Intégrations** : Microsoft Graph API (Outlook, OneDrive, SharePoint)
- **Déploiement** : Vercel Pro

## Features principales
- **Candidats** : import masse (ZIP/PDF/Word), parsing IA, fiche détaillée, CV viewer, photos
- **Clients** : base de 1200+ entreprises, campagnes e-mail, gestion des contacts
- **Offres** : création, pipeline Kanban (drag & drop), matching IA candidat↔offre
- **Planning** : grille hebdomadaire, ETP, marges horaires, export rapport heures
- **Entretiens** : calendrier semaine, types (visio/présentiel/tél), statuts
- **OneDrive** : sync automatique récursif, déduplication, historique fichiers
- **France Travail** : formulaire Word pré-rempli, envoi Resend, CC fixe, historique
- **Messages** : email/SMS/WhatsApp avec templates, activité loggée
- **Intégrations** : Microsoft 365 OAuth par utilisateur (Outlook multi-compte)

## Structure des dossiers
```
app/(dashboard)/          — pages + API routes (Next.js App Router)
  api/                    — 27 routes API server-side
  candidats/[id]/         — fiche candidat
  offres/ pipeline/ ...   — autres pages
components/               — composants React (PascalCase)
  ui/                     — shadcn/Radix primitives
contexts/                 — Context API (Upload, Import, Matching, Photos, Doublons, Theme)
hooks/                    — custom hooks (useCandidats, useCandidat, useMetiers…)
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
