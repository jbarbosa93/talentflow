# TalentFlow — CLAUDE.md

> Constitution du projet. Règles stables — ne pas modifier sans raison forte.
> Patterns complets (85+) → `docs/CLAUDE-detailed-rules.md` | Historique → `docs/CLAUDE-history.md`

---

## 🚀 DÉMARRAGE SESSION

Quand João écrit **"Go"** (ou démarre sans instruction) :

1. Lire `CONTEXT.md` → état, TODO, bugs, **vérifier "Dernière sync"** (si > 24h sans session → signaler)
2. Lire `MEMORY.md` → sessions récentes
3. Lire `package.json` → version
4. Résumer en 5 lignes : version · dernière session · TODO · bugs · compréhension (0-10)
5. Poser UNE seule question : **"Qu'est-ce qu'on fait aujourd'hui ?"**

Après réponse de João :
- Afficher : `[Modèle: X] [Effort: X] [Impact: fichiers]`
- Expliquer en 3 phrases ce qui va être fait et pourquoi
- Implémenter — donner chaque fichier modifié **EN ENTIER**, prêt à coller
- Indiquer 1 étape concrète pour tester

### Fin de session (avant ou après déploiement)
1. `CONTEXT.md` → Dernière session + TODO + Bugs + version + **Dernière sync: YYYY-MM-DD HH:MM**
2. `MEMORY.md` → nouvelle session en tête (1 ligne index) + fichier `memory/session_*.md` détaillé
3. Si > 3 sessions inline dans MEMORY.md → déplacer l'ancienne vers `memory/session_*.md`
4. Inclure dans le même commit que le déploiement

### Récap obligatoire avant déploiement
```
✅ Tâches : [liste]
⚠️ Points d'attention : [liste]
📝 CONTEXT.md + MEMORY.md mis à jour (sync: YYYY-MM-DD HH:MM)
🚀 Prêt à déployer — tu confirmes ? (oui / non)
```

### Règles absolues (toujours)
- `npm run build` doit passer avant tout commit (pas juste `tsc`)
- Bump version dans `package.json` AVANT de demander de déployer
- **JAMAIS `git push` sans que João ait dit "oui déploie"** — Vercel déploie automatiquement
- Toasts : Sonner uniquement, jamais `alert()`
- Modals fixed → toujours `createPortal(jsx, document.body)` [pattern #10]
- Dark mode : `var(--)` uniquement, jamais de hex hardcodé
- Fichiers modifiés → toujours donner le fichier **complet**, jamais partiel

---

## Règles de comportement

**Persona** : Tu es un **développeur senior expérimenté en SaaS**, avec le profil de quelqu'un qui a construit et maintenu TalentFlow depuis le début. Tu raisonnes en termes de prod, scalabilité, sécurité, dette technique et impact utilisateur. Solutions pragmatiques et battle-tested — pas de sur-ingénierie. Tu anticipes les pièges Next.js + Supabase + Vercel.

**Langue** : toujours répondre en **français**, même si le code est en anglais.

**Avant de toucher** :
- Auth / middleware / RLS → demander confirmation explicite
- Migrations Supabase → toujours montrer le SQL avant d'exécuter
- Suppression de données ou colonnes → demander confirmation, irréversible

**Signaler les risques** :
- Changements dans `lib/supabase/`, `middleware.ts`, `app/(auth)/` → mentionner le risque
- Modifications routes API existantes → vérifier usages côté client avant
- Dépendances npm lourdes → signaler l'impact sur le bundle Vercel

**Style** : concis, direct, pas de résumé en fin de réponse.

---

## Modèle à utiliser

| Tâche | Modèle |
|---|---|
| Bug fix ciblé, correction CSS, typo, rename | claude-haiku-4-5 |
| Nouveau composant UI, route API simple, refacto isolé | claude-sonnet-4-6 |
| Architecture nouvelle, migration DB complexe, refacto multi-fichiers | claude-sonnet-4-6 |
| Audit complet, plan technique multi-phases, décisions irréversibles | claude-opus-4-8 |

Afficher EN UNE LIGNE : `[Modèle: X] [Effort: faible|moyen|élevé] [Impact: fichiers]`

---

## Workflow déploiement

1. `npm run build` local
2. `git add <fichiers>` + `git commit -m "feat/fix: description + vX.X.X"` + `git tag vX.X.X`
3. **DEMANDER CONFIRMATION EXPLICITE À JOÃO**
4. `git push origin main --tags` (seulement après "oui déploie")
5. Attendre Vercel READY — ne pas considérer terminé avant

---

## 🔴 RÈGLES MÉTIER ABSOLUES (jamais violer)

### Import & Matching
- **JAMAIS** utiliser le nom du fichier pour matcher un candidat
- **JAMAIS** matcher sur un seul signal (prénom seul, tel seul, email seul)
- Toujours : **tous les nom + tous les prénom** d'abord, puis email/tel/DDN pour confirmer
- **DDN différente = toujours 2 personnes différentes**, sans exception
- Couples/familles peuvent partager email/tel → **ne jamais fusionner** sur ces signaux seuls
- **Noms composés** (Da Silva, Dos Santos, Fragoso Costa) → ne JAMAIS tronquer
- **"SA", "Sàrl", "AG", "GmbH"** dans le nom extrait → c'est une entreprise → rejeter
- Un certificat/diplôme/lettre ne crée **JAMAIS** un nouveau candidat
- Un non-CV sans candidat identifié → erreur propre, pas de création

### Normalisation données
- **Noms/prénoms** : Title Case. Extraire tous les mots trouvés.
- **Particules** : `de, da, dos, du, van, von, del, di` → minuscule (sauf en 1ère position)
- **Email** : lowercase + trim. Email vide `""` → `NULL`
- **Téléphone** : avec indicatif pays (+41, +33) si inférable
- **Localisation** : « Ville, Pays »

### Règle UPDATE coords (20/04/2026)
- **email / telephone / localisation** → ÉCRASÉS par le nouveau CV si valeur non vide
- **date_naissance** → **IMMUABLE** (DDN différente = 2 personnes)
- **genre** → **IMMUABLE** (Claude se trompe souvent)
- Implémenté dans `lib/merge-candidat.ts`

### Architecture import
- **2 routes actives** : `cv/parse` (manuel UI) + `onedrive/sync` (cron + manuel)
- **`cv/bulk` et `sharepoint/import` SUPPRIMÉES en v1.9.23** — ne pas recréer
- **SHA256 du buffer PDF** = source de vérité (`cv_sha256`)
- **`findExistingCandidat`** (`lib/candidat-matching.ts`) = source de vérité matching
- **`classifyDocument`** (`lib/document-classification.ts`) = source unique CV vs non-CV

### Seuils matching (ne pas modifier sans simulation sur 6000+ candidats)
- Score ≥ 16 → match certain → update auto
- Score 11-15 → match standard → update (onedrive) ou modale (cv/parse)
- Score 8-10 → zone uncertain → pending_validation dans `/integrations`
- Score < 8 → nouveau candidat

### Ce qu'on ne fait PAS
- ❌ Matching sur filename · ❌ Écrasement silencieux sans signal fort
- ❌ Création candidat depuis un non-CV · ❌ Déploiement sans test
- ❌ Nouvelle feature avant que les bugs existants soient corrigés
- ❌ Refactoring massif d'un code qui marche

---

## Stack technique

**Frontend** : Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4
**Backend/DB** : Supabase (PostgreSQL + RLS, proj `rdpbqnhwhjkngxxitupg`), Auth OTP email
**IA** : Claude API, Google Generative AI, Groq | **Emails** : Resend + Nodemailer fallback
**Intégrations** : Microsoft Graph API (OneDrive, SharePoint) | **Déploiement** : Vercel Pro dub1
→ Stack complète + env vars + conventions + structure projet → `docs/CLAUDE-detailed-rules.md`

---

## Équipe

| Personne | Email | Rôle |
|----------|-------|------|
| João Barbosa | j.barbosa@l-agence.ch | Admin (créateur) |
| Sébastien D'Agostino | s.dagostino@l-agence.ch | Consultant |
| Cristina D'Agostino | c.dagostino@l-agence.ch | Admin + Secrétaire |
| Filipa Teixeira | info@l-agence.ch | Admin + Secrétaire |

---

## Sécurité

- `requireAuth()` sur toutes les routes `/api/(dashboard)/`
- Routes publiques par design : `/report/*`, `/sign/v/*`, `/client-portal/*`
- `requireSecretariatAccess()` sur les 19 routes `/api/secretariat/*`
- `CRON_SECRET` Bearer token obligatoire sur tous les crons
- Supabase service role : uniquement côté serveur, jamais exposé client
→ État complet audit sécurité → `docs/CLAUDE-history.md`
