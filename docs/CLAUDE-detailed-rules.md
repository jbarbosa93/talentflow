# TalentFlow — Détails patterns critiques + Routes API

Ce fichier contient les détails complets des règles techniques de TalentFlow. Les résumés courts (1-3 lignes par pattern) sont dans `CLAUDE.md`. Consulter ce fichier quand un pattern résumé n'est pas suffisamment précis pour la décision en cours.

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
- **v1.9.102 — IA-first (7 règles)** :
  1. **IA explicite non-CV** (`certificat` / `attestation` / `lettre_motivation` / `contrat` / `diplome` / `bulletin_salaire` / `permis` / `reference` / `formation`) → non-CV (`ia`). **Priorité maximale, sans condition** — corrige régression v1.9.101 qui override l'IA via markers.
  2. **Patterns HAUTE CONFIANCE en-tête 0-500 chars** : "certificat de travail" / "arbeitszeugnis" / "je soussigné" / "nous certifions que" / "Bewerbungsschreiben" / "Objet : candidature" → non-CV (`content_pattern`). Filet de sécurité si IA dit `cv` par erreur. "Madame, Monsieur" dans 0-200 chars + texte < 1500 → lettre_motivation.
  3. **CV-markers DURCIS** : variante A (exp ≥ 2 ET (comp ≥ 3 OU form)) OU variante B (exp ≥ 1 ET comp ≥ 5 ET titre ≥ 3). Variante B protège indépendants avec email info@ de leur société (cas Caryl Dubrit, Nicolas Kilchenmann).
  4. **Email générique** `info@`/`rh@`/`contact@` + aucun marker → non-CV (`email_generique`).
  5. **Texte < 1500 chars** + pas d'exp + pattern contenu (bulletin / permis / reference / contrat) → non-CV (`content_pattern`).
  6. **Nom extrait + aucune exp** → `diplome` (`no_experience`).
  7. **Fallback IA** : si `document_type` ≠ `'cv'` (ex: `'autre'`) → conserver verdict non-CV.
- **Warning `name_ambiguity`** (v1.9.102) — `lib/cv-extraction-validator.ts.detectNameAmbiguity()` : si 2+ tokens MAJUSCULES ≥3 chars dans les 200 premiers chars du texte (ex: "Mr ZAHMOUL Chaouwki"), ajoute warning `severity: 'warning'` dans `analyse._extraction_warnings`. Appelé depuis `validateAnalyse(result, sourceTexteCV)` dans `parseCV` de `lib/claude.ts`. **Limitation** : ne fonctionne que sur CVs avec texte natif (DOCX + PDF bien formés). PDFs scan traités par Vision n'ont pas de texteCV → warning inactif. UI badge à câbler en v1.9.103.
- **Simulation obligatoire** sur 100+ CVs réels avant toute modif des seuils ou de l'ordre — voir `scripts/sim-classifier-hardening.mjs` (5 datasets : 100 CVs DB + 20 non-CVs synthétiques + 5 Loïc Arluna + 3 cas réels Manor/Sandra/Marjorie + cas Zahmoul). Attendu : 100% sur tous datasets, 0 régression.

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

**34. Extraction photos — F1bis Vision crop sur scans A4 rejetés (v1.9.105)**
- **Cause racine** (diagnostic via logs F5) : 60% des CVs avec photo en prod (badge initiales) étaient des scans A4 (1 image JPEG pleine page ~2400×3400) rejetés en silence par le veto `width > 2000 || height > 2500` dans `processXObjects` (`lib/cv-photo.ts`). Strategy 1 retournait 0 candidat → Strategy 2 (pdfjs-dist) crashait sur `GlobalWorkerOptions.workerSrc` → Strategy 3 ne se déclenchait pas (exige `candidates.length === 1` strict) → NULL.
- **Fix F1bis** : nouvelle interface `RejectedFullPageScan` + collecte dans `processXObjects` (DCTDecode + ratio 1.3-1.55 + ≥1500px) + branche dans `extractPhotoFromPDF` entre Strategy 2 et Strategy 3 : si `candidates.length === 0 && rejectedScans.length > 0`, envoie le 1er scan à Vision Haiku via le helper `tryVisionFaceCrop()` qui localise le visage et crop. Limité aux 3 premières pages (coût Vision contrôlé).
- **Helper `tryVisionFaceCrop(rawBytes, sourceLabel, logTag)`** : extrait pour mutualiser la logique Vision face crop avec Strategy 3 existante (DRY). Garde-fous existants : `cropW > 50 && cropH > 50` (anti-crop minuscule) + `cropW < origW * 0.4 && cropH < origH * 0.4` (anti faux-positif "visage géant"). `scoreHeadshot` final agit comme filet de sécurité (uniqueColors < 40 = veto motif décoratif, skinRatio < 0.03 sans N&B = veto pas-de-peau).
- **Logs F5 conservés en prod** : tags structurés `[F5-S1]` / `[F5-S2]` / `[F5-S3]` / `[F5-S1bis]` / `[F5-Score]` / `[F5-Final]` exposent XObjects rencontrés, filtres PDF, dimensions, raisons de rejet, candidats acceptés, branches activées. Permettent diagnostic rapide de tout futur cas d'échec dans Vercel logs.
- **Bancs de test permanents** : `scripts/tests/test-photo-extraction.ts` (banc 22 fixtures connues comme échouant) + `scripts/tests/sim-photo-extraction.ts` (témoin 100 candidats prod avec photo OK en DB). Datasets dans `~/Desktop/talentflow-test-fixtures/photos-fail/` et `photos-ok/` (gitignored). README détaillé : `scripts/tests/photo-extraction-tests-README.md`. Cible : banc ≥ 19/22 (86%), témoin ≥ 58/100 (58%) — protocole anti-régression Session 3+.
- **Cas résiduels v1.9.105** (3 sur banc 22, scope Session 3) : DOCX (`extractPhotoFromDOCX` non instrumenté F5), FlateDecode (F1bis = DCTDecode uniquement, pour FlateDecode il faudrait re-décompresser et passer par sharp raw), veto `uniqueColors < 40` qui rejette parfois un crop Vision valide sur photo très peu colorée (assouplir pour `source.startsWith('vision-face')` Session 3).
- **Marqueur magique `photo_url = 'checked'`** : extraction tentée mais échouée. UI lit `c.photo_url && c.photo_url !== 'checked'` pour afficher la photo (sinon badge initiales). Donc badge initiales s'affiche si `photo_url IS NULL` (jamais tenté) **OU** `photo_url = 'checked'` (tenté + échoué). NE PAS confondre les 2 états — pour cibler les candidats à re-traiter en batch, requête `WHERE photo_url IS NULL OR photo_url = 'checked'`.
- **Batch rétroactif (script one-shot)** : `scripts/batch/retro-photo-extraction.ts` (commit 332d365). Run 27/04/2026 → 2824 candidats traités, 662 photos extraites (23.4%). PDF 22%, JPG/JPEG/PNG ~46%, DOCX/DOC 0-1%. Garde-fous : re-vérif `photo_url` avant UPDATE (race), SIGINT handler, sauvegarde JSON après chaque batch. Réutilisable pour futurs candidats `'checked'`. **En script standalone Node**, configurer `pdfjs.GlobalWorkerOptions.workerSrc` au démarrage (sinon Strategy 2 crash) — voir `setupPdfjsWorker()` dans le script.

**35. Retry OneDrive non-CVs orphelins stoppé sur erreur définitive (v1.9.106)**
- **Bug** : non-CVs (diplômes/certificats) dont le candidat n'existe pas en DB étaient retentés à chaque création de candidat (logique `retryAlwaysIds` v1.9.27 + L213-233 onedrive/sync). Coût Vision IA + Graph API gaspillé en boucle alors que la résolution dépend d'une action humaine.
- **Fix** : `onedrive/sync/route.ts` L1579 (chemin retryQueue, après tentative attachmentMode) → `traite: true` au lieu de `false`. Stoppe le retry à chaque cycle. Erreur définitive : "candidat introuvable" est insoluble par le cron seul.
- **Erreurs transitoires conservent `traite: false`** (retry continue) : timeout réseau (L527 download échec), exception catch générique (L1435), fichier > 10 MB (L510 — `last_modified_at` peut changer si recompressé).
- **Trade-off** : pas de rattachement automatique futur si le CV du candidat est importé plus tard. Recovery manuel : (a) ré-importer le non-CV via UploadCV, (b) remettre `traite=false` en DB pour relancer un retry.
- **Cas Hakan Kisakaya** : SQL one-shot `UPDATE onedrive_fichiers SET traite=true WHERE id='0b6f23be-...'` pour la row historique pré-fix.

**36. Bandeau "Actualisé" depuis /integrations pending-validation (v1.9.106)**
- **Bug** : valider un candidat en attente (bouton "Mettre à jour" sur `pending_validation` depuis `/integrations`) écrivait `last_import_at` mais oubliait `onedrive_change_type` + `onedrive_change_at` dans le `updatePayload` → pas de bandeau bleu "Actualisé" sur la fiche, candidat ne remontait pas en tête de liste.
- **Fix** : `app/(dashboard)/api/onedrive/pending-validation/route.ts` L161-180 — ajouter `onedrive_change_type: 'mis_a_jour'` + `onedrive_change_at: new Date().toISOString()` au payload. Cohérent avec les autres chemins UPDATE (cv/parse cvUpdated, onedrive/sync update, candidats/[id] onCvChange).
- **Cas Jessica Micaela Ramos Nunes** : backfill manuel `UPDATE candidats SET onedrive_change_type='mis_a_jour', onedrive_change_at=last_import_at WHERE id='d6e98e29-...'` pour cas pré-fix.
