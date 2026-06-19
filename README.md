# TalentFlow

Plateforme ATS (Applicant Tracking System) de **L-Agence SA** (Monthey, Suisse) — gestion candidats, clients, missions, rapports hebdomadaires, signature électronique, conformité documents et portails publics.

🌐 Production : [talent-flow.ch](https://talent-flow.ch) · Déploiement auto sur push `main` (Vercel, région `dub1`).

> ⚠️ **Toute la documentation de travail est dans [`CLAUDE.md`](CLAUDE.md)** (règles métier, patterns, historique). Ce README est le démarrage rapide.

---

## Démarrage local

```bash
npm install
npm run dev      # http://localhost:3001 (Webpack, Turbopack désactivé en dev)
```

Bypass login en dev : `localhost:3001/admin` (magic link sans mot de passe — **bloqué en prod**).

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de dev (port **3001**) |
| `npm run build` | Build de production (à lancer avant tout push touchant hooks nav / layouts / middleware / nouvelles routes / SSR) |
| `npm start` | Serveur de production local |
| `npm run lint` | ESLint |
| `npm test` | Tests unitaires (Vitest) — cœur métier (matching, classification, merge, pointage) |
| `npm run test:watch` | Tests en mode surveillance |
| `npm run typecheck` | `tsc --noEmit` |

## Stack

- **Front** : Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4
- **Back/DB** : Supabase (PostgreSQL + RLS), Supabase Auth + OTP email
- **State** : React Query v5, Context API
- **IA** : Claude (Anthropic), Google Generative AI, Groq — parsing CV & matching
- **Docs/PDF** : pdf-lib, pdfjs-dist, mupdf, tesseract.js (OCR), Konva (éditeur Sign)
- **Emails** : Resend (prioritaire) + SMTP fallback (chiffré AES-256-GCM) · WhatsApp via `wa.me`
- **Intégrations** : Microsoft Graph (Outlook/OneDrive/SharePoint), Job-Room (SECO), Apify (veille offres)
- **Déploiement** : Vercel Pro

## Architecture

```
app/(auth)/          login, register, reset-password
app/(dashboard)/     pages protégées + routes API (/api/*)
report/              portail rapport candidat (PUBLIC, slug permanent)
client-portal/       portail client (PUBLIC, slug 16c)
sign/v/[token]/      signature publique (PUBLIC, token TTL)
components/          composants React
lib/                 utils, clients Supabase, cv-parser, sign/, report/
  __tests__/         tests Vitest cœur métier
supabase/migrations/ migrations SQL versionnées
docs/                docs étendues + API-ROUTES-MATRIX.md
```

- **242 routes API** → cartographie complète : [`docs/API-ROUTES-MATRIX.md`](docs/API-ROUTES-MATRIX.md).
  Le middleware exclut tout `/api/` : **chaque route porte son propre garde-fou** (`requireAuth()` ou inline `auth.getUser()`).
- Règles métier critiques (matching, normalisation, seuils) : section « RÈGLES MÉTIER ABSOLUES » de [`CLAUDE.md`](CLAUDE.md).

## Crons Vercel (`vercel.json`)

| Cron | Fréquence | Rôle |
|---|---|---|
| `onedrive-sync` | `*/10 min` | Import CV OneDrive (dédup SHA256) |
| `extract-cv-text` | `*/5 min` | Alimente `cv_texte_brut` |
| `check-sha256-integrity` | dim. 03h | Vérif intégrité fichiers |
| `cleanup-old-data` | quotidien 03h15 | Rétention emails/activités/logs |
| `sign-reminders` | quotidien 09h | Relances enveloppes Sign |
| `document-alerts` | quotidien 08h | Alertes conformité J-30/J-14 |
| `auto-arret-reports` | dim. 20h | Rapports auto si arrêt ≥14j |
| `paiement-rappel-heures` | quotidien 07h | Rappels paiement |

## Variables d'environnement

Voir la liste complète dans [`CLAUDE.md`](CLAUDE.md#variables-denvironnement). Essentielles :

```
NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_APP_URL                 # localhost:3001 dev, talent-flow.ch prod
SUPABASE_SERVICE_ROLE_KEY           # admin, bypasse RLS (serveur uniquement)
ANTHROPIC_API_KEY                   # parsing CV / matching
RESEND_API_KEY / SMTP_*             # emails
MICROSOFT_CLIENT_ID / SECRET / TENANT_ID
PORTAL_AUTH_SECRET                  # JWT HS256 portails (32+ chars)
ADMIN_EMAIL                         # OBLIGATOIRE sur Vercel, pas de fallback
CRON_SECRET                         # 401 si absent
```

## ⚠️ Zones sensibles — toucher avec prudence

- **Auth / middleware / RLS** (`lib/supabase/`, `middleware.ts`, `app/(auth)/`) — risque de régresser l'accès.
- **Matching candidat / CV** (`lib/candidat-matching.ts`, `lib/document-classification.ts`, `lib/merge-candidat.ts`) — règles métier fines, risque de contamination de fiches. **Couvert par `npm test`.**
- **Génération PDF / signature** (`lib/sign/`, `lib/report/`) — beaucoup de cas réels accumulés.
- **Tables sensibles RLS** : `app_settings`, `secretariat_*`, `candidat_documents`, `client_portals`, `report_*`, `sign_*`, `portal_*` → toujours `createServiceRoleClient`.
- **Migrations Supabase** : toujours montrer le SQL avant exécution.

## Déploiement

Vercel déploie automatiquement à chaque push sur `main` → **un push = un deploy en prod**. Workflow obligatoire dans [`CLAUDE.md`](CLAUDE.md#règles-workflow--modifications--déploiement) (build local + vérif état READY après push).
