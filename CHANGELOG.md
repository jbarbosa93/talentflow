# Changelog TalentFlow

Format condensé par phases majeures. Les micro-patchs et fixes intermédiaires
sont regroupés dans la phase à laquelle ils appartiennent.

---

## [1.9.65] — 20 avril 2026

### Flow update CV — règle métier + UX
- **Changement règle métier** : `email`, `téléphone`, `localisation` désormais **écrasés** lors d'un UPDATE (import manuel + OneDrive). Avant : immuables, fiches outdated. `date_naissance` et `genre` restent **immuables**.
- **Badges colorés 3 types** sur liste candidats : 🟢 Nouveau, 🟡 Réactivé, 🔵 Actualisé
  - Source manuelle : localStorage `tf_recently_updated` (TTL 10 min)
  - Source OneDrive : DB `onedrive_change_type` + `onedrive_change_at` persistant jusqu'à ouverture de la fiche
  - Route `POST /api/candidats/[id]/clear-onedrive-badge`
- Fix : archivage `[Ancien]` uniforme, `textMatch` sans guard hash/size (dup Luce), `created_at` dans SELECT update, `await invalidateQueries` avant `dispatchBadgesChanged`, normalisation genre dans `lib/merge-candidat.ts`

### Pack UX mailing (`/messages`)
- **Liste candidats refondue** : 1 ligne compacte par candidat (nom · métier · 3 actions). Hover "CV original" → preview iframe 420×560 via portal. Bouton "CV original" dans `CVCustomizer` à côté de Réinitialiser avec même hover preview.
- **Distances clients quasi-instantanées** : localStorage cache persistant `tf_geocode_cache_v1`, géocoding batch parallèle (3×) sur clients **visibles seulement** (pas 500+), delays Nominatim divisés par 3.
- **Input "Distance depuis..."** : fond jaune hardcodé `#FFFBEB` → `var(--primary-soft)`, border → `var(--primary)`. Lisible dark mode.
- **Historique envois** : `campagne_id` partagé côté UI → 1 card par envoi multi-destinataires (au lieu de N). Couleurs badge "CV personnalisé" + chips candidats/destinataires rénovées. `DELETE /api/emails/history` : bouton "Vider" tout + croix suppression par ligne.

### Dark / light polish
- **Bouton "Rechercher les meilleurs candidats"** (matching IA) : `var(--foreground)` + `white` → `var(--primary)` + `var(--primary-foreground)`. Contraste propre dark.
- **Card CV dans Documents** : bg `var(--muted)` (même couleur que muted-foreground en light = invisible) → `var(--primary-soft)` brand. Catégorie "Autre" → `var(--secondary)`. Dropdown "Déplacer vers..." : flip vers le haut si dépasse viewport + `maxHeight` + scroll interne.
- **Placeholder photo fiche candidat light mode** : `var(--muted)` = `var(--muted-foreground)` (#64748B, initiales invisibles) → `var(--secondary)` + `var(--foreground)` + border.
- **Boutons jaune brand** : `.neo-btn-yellow` `color: var(--ink)` (= `var(--foreground)`, devenait clair en dark) → `var(--primary-foreground)` (toujours sombre). 6 fichiers nettoyés (`color:'white'` sur `bg: var(--primary)` → `color: 'var(--primary-foreground)'`).

### Modals élargis
- Nouvelle commande / Modifier commande → `sm:max-w-3xl` + `max-h-[90vh]` + textareas 160/120px.
- Modal clients 640→820px. Modal missions 520→900px.

### Pipeline
- Aperçu CV au hover : positionnement vertical aligné sur la card (`clampedTop`) au lieu de `top:20/bottom:20` qui le collait en haut du viewport (bug "sticky en haut" remonté par João).

### Performance liste candidats
- Debounce recherche **300ms → 150ms**.
- **Prefetch automatique de la page suivante** (`queryClient.prefetchQuery`) → clic "suivante" instantané.
- Couplé avec `placeholderData: (prev) => prev` existant : zéro flicker entre pages / filtres.

### Dev localhost — vraie session admin, zéro password
- `/admin` refondu : purge cookies `sb-*` + magiclink → fin définitive du HTTP 431
- `NODE_OPTIONS='--max-http-header-size=65536'` dans `npm run dev`
- Suppression d'`ALLOW_DEV_BYPASS` (cause racine du "UI sans candidats" en dev)

### Visuel
- Logo L-AGENCE officiel (PNG `public/logo-lagence.png`) dans le PDF "Rapport de travail"

### Cleanup
- `CHANGELOG.md` 575→285 lignes + `lib/version.ts` 1715→130 lignes. Historique regroupé par phases thématiques au lieu de 90 entrées patch.

---

## [1.9.40 → 1.9.64] — 19 avril 2026

**Refonte dashboard + dark mode complet + polish badges**

### Dashboard consultant refondu
- Header riche (gradient + phrase motivationnelle) + 3 badges cliquables (À traiter / Rappels / Alertes)
- 4 KPIs pour João (avec ETP Missions), 3 pour les autres
- Card Pipeline par consultant segmentée par métier (couleurs via `getColorForMetier()`)
- Chart imports BarChart + LabelList + Cell colorées + toggle Jour/Semaine/Mois
- Widgets Activité récente + Top 10 villes (remplacent la carte interactive)
- Panel "Mes rappels" avec 2 onglets + action depuis badge dashboard
- Questionnaire phrases motivationnelles au 1er login (4 styles persistés user_metadata)
- Avatar animé WavingAvatar (photos João + Seb)
- Numéro semaine ISO 8601 dans le header

### Dark mode fonctionnel
- `:root` = LIGHT / `.dark` = DARK (2 jeux OKLCH distincts)
- Nouveaux tokens sémantiques : `--success`, `--warning`, `--info`, `--destructive`, `--*-foreground`, `--*-soft`
- ThemeContext pose `classList.add('dark')` (active Tailwind `dark:*`) + `data-theme` rétrocompat
- ~350 hex hardcodés remplacés par `var(--token)` sur 27+ fichiers
- Fix blanc sur blanc modal Documents, hover dropdown, tooltip Recharts

### TopBar + navigation
- Bouton "Importer candidat" global (jaune brand) sur toutes les pages dashboard
- Suppression du split `isOnCandidats` + bouton sync Microsoft retiré
- `/parametres` redirect direct vers `/parametres/profil`
- Sous-page dédiée `/parametres/metiers`
- Fusion "Mon profil" sidebar avec la page complète

### Badges candidats — stricts per-user
- `last_import_at TIMESTAMPTZ` (remplace `has_update` bool global) + migration
- `hasBadge()` : DB source de vérité stricte (fin de l'UNION localStorage qui réinjectait les IDs purgés)
- Barre sélection : boutons "Marquer vu / Non vu" conditionnels selon `hasBadge()`
- Debounce sidebar 500ms → 50ms (badge quasi-instantané)
- Bulk "Non vu" : DELETE `candidats_vus {all_users:true}` → badge réapparaît pour tous

### SHA256 CV + backfill
- Colonnes `cv_sha256 TEXT` + `cv_size_bytes INTEGER` + index partiel
- À chaque import : `createHash('sha256').update(buffer)` → détection "même fichier" déterministe
- `contenuIdentique = hashMatch || sizeMatch || textMatch || memeItemLiee` (filename matching banni)
- Backfill one-shot ~10 min pour 6053 candidats historiques
- Cron hebdo `check-sha256-integrity` (dimanche 03h UTC) — garde-fou permanent

### Matching + doublons + validation
- **Pending Validation OneDrive** : matches score 8-10 (strictExact + ville sans contact fort) → validation manuelle via `/integrations`
- Table `decisions_matching` (dataset ML futur) + UI PendingValidationPanel diff side-by-side
- **Détection doublons déterministe** : RPC `find_deterministic_duplicates()` — 4 catégories SQL (SHA256 / email / DDN+nom / métier+contact)
- **Merge intelligent CV** (`lib/merge-candidat.ts`) : champs IMMUABLES vs MERGE vs ÉCRASÉS, intégré cv/parse + onedrive/sync
- Fix écrasement homonymes : seuil strictExact 5 → 8 (exige nom + signal fort)
- Fix coords mode merge cv/parse (remplir si vide seulement)
- Extension protection bio onedrive/sync puis revert (enrichissement auto voulu)
- Nettoyage DB : 329 emails vides → NULL, 282 DDN bizarres → NULL, `lib/normalize-candidat.ts` intégré

### Classification documents + photo
- `lib/document-classification.ts` — source unique CV/non-CV (cv/parse + onedrive/sync + sync-test)
- Filename matching **banni définitivement** (plus jamais `file.name` dans une décision)
- Fix extraction photo : seuil `uniqueColors < 40` rejette motifs décoratifs (dots / trames)
- Fix extraction IA noms composés portugais/espagnols ("Daniel Fragoso Costa" préservé)

### Observabilité
- `admin_detect_anomalies()` v2 + résolution collaborative (table `anomalies_resolved`)
- AlertsBanner 3 boutons (Ouvrir / Faux positif / Corrigé) + historique 50
- Banc de test DRY-RUN OneDrive (mode live Graph `/drives/{id}/items/{folder}/children`)

### Fixes divers
- Historique envois email par campagne per-user (`emails_envoyes` + RLS)
- Alerte doublon renforcée (per-user + 30j + multi-candidats)
- Veille offres suspendue (cron + onglet + badge retirés)
- Speed Insights + filtre Sentry vitals non-actionnables
- ETP Missions unifié via `lib/missions-etp.ts` (fin de la divergence dashboard ≠ missions)
- Fix 3 bugs critiques pré-existants : non-CVs fantômes, memeTexte 500 → 2000 chars, attachmentMode cv/parse
- Fix "Ré-analyser IA" ne déclenche plus le badge rouge
- 6 modals via `createPortal` (sticky en haut de page fixé)

---

## [1.9.10 → 1.9.39] — 15-18 avril 2026

**Matching hardening + veille offres + observabilité**

### Veille offres externes
- Scraping Apify : jobs.ch, jobup.ch, Indeed CH (27 requêtes × 3 sources)
- Ciblage Suisse romande uniquement (cantons FR/VD/GE/VS/NE/JU/BE)
- Table `offres_externes` + upsert par `url_source`
- Détection agences (60+ mots-clés) + modération 3 onglets + badge sidebar
- Cron Vercel 6h + sync manuelle

### CDC viewer
- Upload CDC dans bucket `cvs/cdc/` (signed URL 10 ans)
- Colonne `offres.cdc_url`, bouton 📄 sur cards commandes
- Modal portalisé + iframe `/api/cv/print` (PDF/image) ou Office Web Viewer (DOCX/DOC)

### Matching IA + messages
- Déterminisme (tiebreaker `candidat.id` + re-sort final)
- Combobox offres avec recherche texte (titre/client/localisation)
- `cv_texte_brut` 1500 → 2500 chars dans le prompt
- Bonus localisation +6 ville / +4 canton (map 26 cantons + villes romandes)
- Pénalité ancienneté candidat (< 6m=0, 6-12m=-3, 12-24m=-6, >24m=-10)
- Normalisation compétences (`compScore / N`)
- Logo L-AGENCE PNG officiel dans `cv-generator.ts` (header + footer)

### Signature email + templates SMS
- Signature Outlook personnalisable stockée dans `user_metadata.signature_html` + preset dynamique par prénom
- Bucket `public-assets` (portrait, banner, icônes — indépendance services externes)
- Éditeur dans `/parametres/profil` + toggle persistant dans `/messages`
- Templates SMS en masse avec variables `[MÉTIER]`/`[LIEU]`
- WhatsApp fiche candidat avec signature consultant

### Matching — refonte identité-first
- Refonte complète `lib/candidat-matching.ts` : 5 étapes (présélection → reject DDN → scoring → filtre → tiebreak)
- Scoring pondéré : DDN=+10, tel9=+8, email=+8, strict_nom_exact=+5, strict_nom_subset=+3, ville=+3
- Seuils 3 niveaux : strict_exact=5 (puis 8), strict_subset=11, aucune similarité=16
- **Fail-safe DDN immutable** : différence DDN → `kind:'none'` (cas André Rodrigues / Rodriguez Verdugo)
- `wordsOverlapExact` remplace `.includes` bidirectionnel (fin de "Andre ⊂ Andres")
- Collision tel9 seule ne suffit plus (protège couples/familles/colocs)
- Présélection refaite en 3 requêtes parallèles AND + OR + signal fort (fix José Gomes LIMIT 50 saturé)
- Modale de confirmation sur match détecté (Update / Créer / Voir) + cache analyse 5 min

### Anomalies + observabilité
- Fonction Postgres `admin_detect_anomalies()` (3 familles : texte mismatch, OneDrive mismatch, CV orphelins)
- AlertsBanner sur `/integrations` (admin only)
- Route DRY-RUN `/api/onedrive/sync-test` (dry-run strict, aucune écriture DB/Storage)
- Composant TestFolderRunner

### Cleanup + fixes
- Fix RLS `pipeline_rappels` (policy SELECT filtrée par `user_id`)
- `refetchOnWindowFocus:true` sur candidats (cron silencieux → badge au retour navigateur)
- Suppression routes orphelines `cv/bulk` + `sharepoint/import` (854 lignes, 0 trafic prod 30j)
- `/api/cv/parse` = route unifiée d'import (UI + Web Worker batch)
- `lib/document-classification.ts` source unique CV/non-CV
- `lib/normalize-candidat.ts` : 4 fonctions pures (email, nom, tel, localisation)
- Simulation 6086 candidats : seuil strictExact 8 (0 régression + élimine faux positifs)
- Fix timer inactivité (reset sur 4 chemins login)
- 3 bugs critiques imports (non-CVs fantômes, memeTexte 500 → 2000, attachmentMode symétrique)
- Extraction photo : `uniqueColors < 40` rejette motifs décoratifs
- IA prompt enrichi : noms composés portugais/espagnols préservés

---

## [1.8.13 → 1.9.9] — 13-15 avril 2026

**Audit sécurité + logique import CV finalisée + cv_texte_brut**

### Audit DB + sécurité
- 8 fixes DB : index dupliqué supprimé, `auth.uid()` → `(select auth.uid())` sur 8 policies, `search_path = public` sur 7 fonctions, tables fantômes supprimées, 3 index FK ajoutés, vues SECURITY INVOKER
- `requireAuth()` sur 51 routes API (middleware exclut `/api/*`)
- SMTP password chiffré AES-256-GCM (`lib/smtp-crypto.ts`)
- RLS activé sur les 33 tables
- Sentry monitoring + timer inactivité 2h
- 14 `<img>` → `<Image>` Next.js (performance)

### Logique import CV finale
- Skip / Réactivé / Update / Archive (4 cas déterministes)
- `has_update` → `last_import_at` per-user strict
- `normFn` normalisation noms fichiers (Storage encode espaces en underscores)
- Fix nom CV principal (`[Ancien]` / `[Archive]` strippés à la promotion)
- Fix pipeline auto-ajout : DEFAULT 'nouveau' supprimé + 21 fantômes nettoyés
- Dédup complète + `dispatchBadgesChanged`

### cv_texte_brut + Vision IA
- Colonne `cv_texte_brut` (max 10 000 chars) alimentée par les 3 pipelines (manuel, masse, OneDrive)
- Vision Claude Haiku en fallback pour PDFs scannés et JPG/PNG (via URL source, pas de limite taille)
- Marqueurs `[scan-non-lisible]` / `[pdf-chiffre]`
- Cron Vercel `*/5min` `/api/cron/extract-cv-text` (batch 20, filtre NULL/vide)
- Card Outils + indicateur sidebar

### Missions + matching + emails
- Missions : colonnes `vacances` et `arrets` JSONB + badges colorés par priorité + ETP prorata
- Matching déterministe + Combobox offres
- Emails : `emailWrapper()` unifié + signature dynamique consultant + escape XSS

---

## [1.5.0 → 1.8.12] — 8-12 avril 2026

**Module Secrétariat + détection doublons + missions**

### Module Secrétariat
- Dashboard séparé (rôle Secrétaire dédié)
- 6 tables DB : candidats, accidents, ALFA, paiements, loyers, notifications
- Import Excel batch : 430 candidats + 113 accidents + 180 ALFA + 76 paiements + 2 loyers
- Historique modifications + notifications auto/manuelles avec badge sidebar
- WhatsApp + lien fiche candidat partout

### Détection doublons
- Détection instantanée sans IA : email score 100, tél normalisé +41 score 95, nom+prénom score 85
- Historique en DB (`doublons_historique`)
- Fusion guidée champ par champ

### Missions (page complète)
- CRUD + stats marge brute/coefficient + bilan mensuel
- Jours fériés cantonaux (Easter algo, `lib/jours-feries.ts`)
- Import Notion flexible + sync Quadrigis avec validation manuelle (`missions_pending`)
- Sidebar adminOnly

### Navigation + sécurité
- Pipeline : consultant obligatoire (erreur 400 sinon)
- `?from=pipeline|missions|secretariat` sur fiche candidat
- Scroll sur `.d-content` (PAS sur `window`)
- Recherche client Zefix → Claude `web_search`

---

## [1.0.0 → 1.4.0] — mars → 7 avril 2026

**Fondations**

- Next.js 16 (App Router) + React 19 + TypeScript 5 + Tailwind 4
- Supabase (PostgreSQL + RLS) + Auth OTP 2FA
- Core : candidats (6000+), clients (1200+), pipeline 3 colonnes, entretiens, missions
- Import masse ZIP/PDF/Word avec OCR fallback Vision IA
- Parsing CV multi-modèle (Claude, Gemini, Groq)
- Microsoft 365 OAuth (Outlook multi-compte)
- Emails/SMS/WhatsApp (Resend + SMTP fallback + WhatsApp Business API)
- France Travail (formulaire Word pré-rempli)
- Matching IA candidats ↔ offres + historique
- Timeline activité + doublons guidés + normalisation affichage
- Déploiement Vercel Pro région `dub1`
