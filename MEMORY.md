# TalentFlow — MEMORY.md

> Mémoire persistante du projet. Ce fichier est la référence entre les sessions.

---

# Session 17 avril 2026 — v1.9.12 → v1.9.13

## Signature email Outlook personnalisable
- Stockage HTML dans `auth.users.user_metadata.signature_html` (pas de table profiles, suit le pattern existant `prenom`/`avatar_url`)
- Bucket Supabase Storage `public-assets` : portrait, banner, icônes sociaux migrés depuis services externes (imgur, image2url, imgmsgen)
- Preset par défaut si pas de signature custom : `<p>Cordialement,<br><strong>{prénom}</strong><br>L-AGENCE SA<br>+41 24 552 18 70<br>info@l-agence.ch</p>` — prénom dynamique du consultant connecté
- Éditeur dans `/parametres/profil` : preview live + onglet HTML source + bouton enregistrer
- Toggle "Inclure ma signature" dans /messages (persistant `localStorage` `talentflow_include_signature`)
- `/api/microsoft/send` : ajoute la signature au body HTML uniquement si `include_signature: true`, priorité custom > preset
- Suppression de la signature texte dupliquée du template "Proposition de candidature"

## Templates SMS en masse
- Migration `20260417_sms_templates.sql` : colonne `type TEXT NOT NULL DEFAULT 'email' CHECK (type IN ('email','sms'))`, `sujet` nullable, index, seed "Recherche de candidat" avec `[MÉTIER]`/`[LIEU]`
- API `/api/email-templates` : GET accepte `?type=email|sms`
- Hook `useEmailTemplates(type?)` : paramètre optionnel
- /messages EmailTab forcé en `useEmailTemplates('email')` partout (isolation)
- CandidatsList modal "Envoyer un message" : bouton Templates + dropdown + champs rapides Métier/Lieu (substitution live) + bouton Sauvegarder (modal portalisé)

## WhatsApp fiche candidat
- Bouton WhatsApp envoie message complet (salutation + accroche + signature)
- Prénom dynamique via `user_metadata.prenom` du consultant connecté (João/Seb), fallback "João"

## Persistance session mailing
- `MAILING_KEY = 'talentflow_mailing_session'` dans sessionStorage : sauvegarde de candidatIds, destinataires, templateId, sujet, corps, includeSignature
- Restauration auto au retour sur /messages
- Bouton "+ Nouveau envoi" dans bandeau bleu en haut d'EmailTab (visible si données présentes) — `resetMailing()` clear tout

## Scroll restore /candidats et /clients
- CandidatsList : la clé `candidats_scroll` n'est plus supprimée après lecture + listener scroll continu (debounced 150ms)
- clients/page.tsx : ajout du même pattern (restore au mount + save continu débounce 150ms sur `.d-content`)

## 6 modals HAUTE priorité (scroll interne + footer sticky)
Pattern uniforme : `maxHeight: '90vh'` + `flex column` sur la card, header `flexShrink: 0`, contenu wrappé `flex: 1, minHeight: 0, overflowY: 'auto'`, footer wrappé `borderTop` + `background: var(--card)` + `flexShrink: 0`.
- pipeline/page.tsx : Notes (178), Rappel (241), Modifier (299)
- messages/page.tsx : Alerte doublon (1240)
- CandidatsList.tsx : Bulk pipeline (2523), Sauvegarder template SMS (2870)

## Fix dropdown templates SMS clippé
- Retrait de `overflow: 'hidden'` sur la `neo-card` du modal "Envoyer un message" (dropdown `position: absolute` était coupé)

---

# Session 30 mars 2026 — Rapport complet

## 1. Bugs corrigés

### 1.1 Recherche + Lieu combinés → 0 résultats
- **Problème** : chercher "Soudeur" + filtre lieu "Lausanne" retournait 0 résultats
- **Cause** : la RPC `search_candidats_filtered` renvoyait des IDs, mais les filtres colonne (lieu, genre, langue, etc.) étaient appliqués APRÈS la pagination (sur 20 IDs par page au lieu de tous les IDs)
- **Solution** : batch-filtrer TOUS les IDs RPC par groupes de 200 avec les filtres colonne AVANT la pagination
- **Fichier** : `app/(dashboard)/api/candidats/route.ts` (lignes 82-101)

### 1.2 Limite 1000 résultats PostgREST
- **Problème** : jamais plus de 1000 résultats même avec 6000+ candidats
- **Cause** : PostgREST `max_rows` par défaut à 1000, et le client Supabase limite aussi à 1000
- **Solution** : `.limit(10000)` sur l'appel RPC + changement `max_rows=10000` dans le dashboard Supabase
- **Fichier** : `app/(dashboard)/api/candidats/route.ts` (ligne 73)

### 1.3 Filtre CFC retourne 0 résultats (3 causes)
- **Cause 1** : filtre CFC était client-side avec `per_page=0` (fetch tous) → buggy
- **Cause 2** : `ALLOWED_COLS` dans le PATCH handler n'incluait pas `cfc` et `deja_engage` → les toggles ne sauvegardaient jamais
- **Cause 3** : le badge CFC dans la liste ne détectait que le texte formation, pas le boolean `cfc`
- **Solution** :
  - Filtre CFC côté serveur : `.or('cfc.eq.true,formation.ilike.%CFC%,...')`
  - Ajout `cfc` et `deja_engage` dans `ALLOWED_COLS`
  - Badge CFC : `c.cfc || (c.formation && /CFC|certificat.../i.test(c.formation))`
- **Fichiers** : `api/candidats/route.ts`, `api/candidats/[id]/route.ts`, `components/CandidatsList.tsx`

### 1.4 "Nouvelle recherche" vs "Tout effacer"
- **Problème** : "Nouvelle recherche" ne vidait pas la barre de recherche
- **Solution** : `resetAllFilters` (search + filtres) vs `resetFiltersOnly` (filtres seulement)
- **Fichier** : `components/CandidatsList.tsx`

### 1.5 Métiers sélectionnés pas en haut du popover
- **Problème** : les métiers cochés restaient dans leur catégorie
- **Solution** : section "Sélectionnés" séparée tout en haut, avant les catégories
- **Fichier** : `components/CandidatsList.tsx` (MetierPopover)

### 1.6 Zoom CV cassé
- **Problème** : cliquer + ne zoomait pas, ou le CV basculait à droite, ou perdait en qualité
- **Cause** : Turbopack était CORROMPU pendant la majorité de la session → servait du vieux code malgré les modifications. Aussi, plusieurs approches de zoom ont été testées sans succès.
- **Solution finale** : code exact du commit e238652 (voir section "Décisions techniques")
- **Fichier** : `app/(dashboard)/candidats/[id]/page.tsx`

---

## 2. Décisions techniques

### 2.1 Zoom CV — Pattern définitif (CRITIQUE — ne pas changer)
```
Scroll container (overflow: auto, cursor: grab, drag handlers)
  └─ Wrapper div (width: cvZoom*100%, height: cvZoom*5000px)
       └─ iframe (key inclut cvZoom, src: #zoom=page-width, pointerEvents: none si zoomé)
```
- `#zoom=page-width` dans l'URL PDF (jamais de valeur numérique)
- `key={cv-iframe-${cvRotation}-${cvZoom}}` force le re-mount → re-rendu HD
- `pointerEvents: none` quand zoomé → permet le drag sur le scroll container
- Drag handlers (cvDragStart/Move/End) + wheel handler pour navigation

### 2.2 Statut import → Onglets (pas un filtre)
- Actif / À traiter / Archivé sont des **statuts**, pas des filtres
- Rendus comme des boutons/onglets (vert/orange/gris), pas un `<select>`
- Actif (traite) est le principal, affiché en premier
- Ne déclenche pas "Tout effacer"

### 2.3 Dropdown métier → Custom (pas un select natif)
- Les `<select>` natifs ne supportent pas les couleurs sur `<optgroup>`/`<option>`
- Remplacé par un dropdown custom avec :
  - Bullet coloré par catégorie (Gros Oeuvre, Second Oeuvre, etc.)
  - Labels de catégorie avec la couleur de `useMetierCategories()`
  - Click-outside pour fermer (useEffect + ref)

### 2.4 Barre de recherche agrandie
- Séparée sur sa propre ligne (au-dessus des filtres)
- `height: 42px`, `fontSize: 14` (plus grande et lisible)
- Pleine largeur avec `flex: 1`

### 2.5 Filtres CFC/Engagé côté serveur
- Avant : client-side avec `per_page=0` (fetch tous les candidats) → lent
- Maintenant : paramètres `cfc=true` et `engage=true` envoyés à l'API
- API applique `.or('cfc.eq.true,formation.ilike.%CFC%,...')` côté Supabase

---

## 3. Ce qui NE FONCTIONNE PAS (approches abandonnées)

### Zoom CV — Approches échouées
| Approche | Résultat | Pourquoi |
|----------|----------|----------|
| `transform: scale(cvZoom)` | Zoom visuel OK, mais **flou** | Upscale les pixels, pas de re-rendu HD |
| CSS `zoom: cvZoom` sur iframe | **Rien ne se passe** | N'affecte pas les iframes cross-origin |
| `#zoom=${value}` numérique dans URL | Zoom HD OK, **pas de main/drag** | iframe cross-origin → impossible de contrôler le scroll interne |
| `transform: scale()` + iframe 2x | Complexe, non testé | Abandonné au profit du pattern wrapper |

### Turbopack — Cache corrompu
- Pendant toute la session, Turbopack servait du vieux code compilé
- Symptôme : les modifications du fichier n'apparaissaient pas dans le navigateur
- Erreurs "Failed to restore task data (corrupted database)" dans les logs
- **Fix** : `rm -rf .next` + redémarrer le serveur

---

## 4. Fichiers modifiés dans cette session

| Fichier | Changements |
|---------|-------------|
| `app/(dashboard)/candidats/[id]/page.tsx` | Zoom CV (pattern wrapper), toggles CFC/Engagé, auto-détection CFC, métier picker, header sticky |
| `components/CandidatsList.tsx` | Dropdown métier custom, onglets statut, barre de recherche agrandie, filtres CFC/Engagé serveur, MetierPopover sélectionnés en haut, bouton "Tout sélectionner" orange |
| `app/(dashboard)/api/candidats/route.ts` | Batch filtering IDs, `.limit(10000)`, filtres CFC/Engagé serveur-side |
| `app/(dashboard)/api/candidats/[id]/route.ts` | `cfc` et `deja_engage` dans `ALLOWED_COLS` |
| `hooks/useCandidats.ts` | Params `cfc` et `engage` dans le fetch |
| `types/database.ts` | `cfc: boolean | null`, `deja_engage: boolean | null` dans type Candidat |
| `lib/version.ts` | Bump v0.26.0 |
| `CHANGELOG.md` | Entrée v0.26.0 |

---

## 5. État actuel

### Stable et fonctionnel
- Zoom CV avec navigation main (pattern wrapper div)
- Recherche + filtres combinés (batch filtering serveur)
- Filtres CFC/Engagé serveur-side
- Toggles CFC/Engagé dans fiche candidat (sauvegarde OK)
- Badge CFC dans liste (toggle + texte formation)
- Onglets statut (Actif/À traiter/Archivé)
- Dropdown métier custom avec couleurs catégorie
- Barre de recherche agrandie
- Métiers sélectionnés en haut du popover

### Points d'attention
- Turbopack peut se corrompre → `rm -rf .next` en cas de comportement bizarre
- Le `max_rows` Supabase a été changé à 10000 dans le dashboard (pas dans le code)
- Les couleurs du dropdown métier dépendent de `useMetierCategories()` — si les catégories ne sont pas configurées, le dropdown fallback sur une liste plate
- **Ne JAMAIS déconnecter les intégrations (Microsoft, WhatsApp) depuis localhost** — même DB que prod, supprime les tokens

---

# Sessions 14-15 avril 2026 — v1.8.43 → v1.9.7

## Bugs corrigés

### SMS masse — URI sms: mal formée
- **Problème** : le message pré-rempli n'apparaissait pas dans l'app Messages pour multi-destinataires
- **Cause** : `?` manquant avant `body=` dans l'URI `sms:` quand `formatted.length > 1`
- **Fichier** : `components/CandidatsList.tsx` (ligne 721)

### Pipeline fantômes — trigger DB vestige
- **Problème** : candidats apparaissaient automatiquement dans le pipeline sans action manuelle
- **Cause** : trigger PostgreSQL `trg_sync_candidat_statut` sur table `pipeline` copiait `pipeline.etape` → `candidats.statut_pipeline` à chaque UPDATE (déclenché par le matching via upsert)
- **Fix** : DROP TRIGGER + migration `20260414_drop_trigger_sync_candidat_statut.sql`

### Dédup homonymes — faux positifs import
- **Problème** : "Cardoso Costa Paulo Augusto" fusionné avec "Paulo Augus Cardoso Da Costa" (personnes différentes)
- **Cause** : match nom+prénom seul suffisait pour fusionner, sans vérification email/tel
- **Fix** : match nom seul exige signal supplémentaire (tel, email, ou localisation+métier)
- **Fichiers** : `api/cv/parse/route.ts`, `api/onedrive/sync/route.ts`

### normFn timestamps empilés + accents Unicode
- **Problème** : doublons CV non détectés quand le nom contient 2+ timestamps ou des accents encodés différemment
- **Fix** : `/^(\d+_)+/` + `.normalize('NFD').replace(/[\u0300-\u036f]/g, '')` dans toutes les normFn

### Badge rouge nouveaux candidats
- **Problème** : nouveaux candidats importés n'avaient pas le badge rouge
- **Fix** : `has_update: true` ajouté à l'INSERT dans cv/parse, cv/bulk, onedrive/sync, sharepoint/import

### Matching non-CV — documents introuvables
- **Problème** : certificats/permis/LM ne trouvaient pas leur candidat (signal tel/email requis, noms inversés)
- **Fix** : pour les non-CVs, match nom seul suffit (pas de risque de doublon). Recherche croisée nom/prénom pour noms inversés (GUHAD/MAHMOUD). Catégorie "autre" affinée par filename.

### OneDrive — documents non-CV traités avant le candidat
- **Problème** : CV et certificats du même candidat traités en parallèle → certificat échoue "introuvable"
- **Fix** : tri CVs avant non-CVs + retry automatique des documents introuvables après le batch

## Features ajoutées

### Pipeline — couleurs métiers par catégorie
- Badges filtre (barre horizontale) colorés par catégorie via `getColorForMetier()`
- Badges métier dans les cartes candidats colorés par catégorie (prop passée à `CandidatCard`)

### OneDrive — folder picker SharePoint + profondeur 3
- Support drives SharePoint (pas seulement OneDrive personnel)
- Profondeur 3 niveaux de sous-dossiers
- Bouton "Choisir un dossier" / "Changer" sur la page Intégrations
- Fix metadata key mismatch (`onedrive_folder_id` → `sharepoint_folder_id`)
- `listerDossiers` utilise `drivePrefix` pour scanner le bon drive

### Localhost — /admin bypass + Admin override
- `/admin` connecte directement sans OTP (session côté serveur)
- TopBar affiche "Admin" / "Administrateur" sur localhost

## Fichiers modifiés
| Fichier | Changements |
|---------|-------------|
| `components/CandidatsList.tsx` | Fix URI sms: multi-destinataires |
| `app/admin/route.ts` | Bypass login dev — session côté serveur, redirect /parametres/admin |
| `components/layout/TopBar.tsx` | Admin override localhost (useState hydration-safe) |
| `app/(dashboard)/pipeline/page.tsx` | Couleurs métiers filtres + cartes (getColorForMetier prop → CandidatCard) |
| `app/(dashboard)/api/cv/parse/route.ts` | Dédup homonymes + normFn NFD + has_update + non-CV match nom seul + catégorie "autre" affinée |
| `app/(dashboard)/api/cv/bulk/route.ts` | has_update nouveaux candidats |
| `app/(dashboard)/api/onedrive/sync/route.ts` | Dédup + normFn NFD + has_update + non-CV intelligent + retry auto + tri CVs/non-CVs + noms inversés |
| `app/(dashboard)/api/sharepoint/import/route.ts` | has_update nouveaux candidats |
| `app/(dashboard)/api/onedrive/folders/route.ts` | Support sharepoint_drive_id + metadata key fix |
| `app/(dashboard)/integrations/page.tsx` | Bouton Choisir/Changer dossier OneDrive |
| `lib/onedrive.ts` | listerDossiers profondeur 3 + drivePrefix SharePoint + scan drives partagés |
| `supabase/migrations/20260414_drop_trigger_sync_candidat_statut.sql` | Drop trigger vestige |
| `lib/version.ts` | Bump v1.8.45 + changelog |
| `CLAUDE.md` | Version 1.8.45 |

## Décisions techniques importantes

### Dédup CVs vs non-CVs — règles différentes
- **CVs** : match nom seul exige signal fort (tel/email/loc+métier) → évite fusions homonymes
- **Non-CVs** (certificats, permis, diplômes, LM) : match nom seul suffit → pas de risque de doublon (on ne crée pas de candidat)
- Recherche croisée : tous les mots du nom ET prénom sont cherchés dans les deux champs DB (gère noms inversés)

### normFn — normalisation complète
```
.normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip accents
.replace(/^(\d+_)+/, '')                            // strip timestamps empilés
.replace(/[_\s]+/g, '_')                            // normalise espaces
.toLowerCase()
```

### OneDrive — ordre de traitement
1. CVs traités en premier (triés avant non-CVs dans le batch)
2. Non-CVs traités après → candidats déjà en DB
3. Si "introuvable" → retry automatique après le batch
4. Matching intelligent : nom seul pour non-CVs, catégorie "autre" affinée par filename

### Extraction photos — 3 stratégies
1. **Strategy 1** : pdf-lib XObjects (JPEG/FlateDecode/JPEG2000) — photos intégrées séparées dans les PDFs Word/Canva
2. **Strategy 2** : pdfjs-dist fallback si Strategy 1 = 0 candidats
3. **Strategy 3** : Claude Vision Haiku — pour PDF scannés (1 image pleine page). Envoie la page à 800px, Claude retourne cx/cy/size du visage en pixels, crop 1.8× centré sur le visage, ratio 4:5
- Fix PDFRef : Width/Height comme références résolues via `pdfDoc.context.lookup()`
- Seuil scoring : 25 points minimum
- Rejet : peau <3% sans N&B, icônes carrées <80px, scans >2000px, monochrome ≤5 couleurs
- `photo_url` 3 états : NULL (pas analysé), 'checked' (analysé, pas de photo), URL (photo extraite)
- Outil correction supprimé de l'UI — le cron + l'outil correction photos gèrent tout

---

## Extraction photos (15 avril)
- **Strategy 3 Vision** : Claude Haiku localise les portraits dans les PDF scannés — 320 nouvelles photos
- **extractPhotoFromImage** : Vision crop pour images JPG/PNG (WhatsApp, scans téléphone)
- **Fix PDFRef NaN** : Width/Height comme références PDF résolues via `pdfDoc.context.lookup()`
- **Fix doc→pdfDoc** : ReferenceError silencieuse dans processXObjects
- **Scoring** : seuil 25, rejet peau <3%, anti-icônes, passeport fond blanc OK, crop 40% max
- **Mode force supprimé** de l'outil correction — ne touche jamais aux photos existantes

## Rotation 4 angles (15 avril)
- PDF : `extractTextWithRotation` tente pdf-parse sur 0°/90°/180°/270°, arrête au premier ≥50 chars
- Images : Vision retry avec sharp.rotate(90/180/270) si analyse vide
- Appliqué dans cv/parse ET onedrive/sync

## Nettoyage UI (15 avril)
- `cv_texte_brut` masqué dans fiche candidat (reste en DB)
- Outil "Extraire texte CVs" supprimé de /outils et sidebar
- Cron extract-cv-text continue en arrière-plan (batch 50, 300s)
