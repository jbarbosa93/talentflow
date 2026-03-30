# TalentFlow — MEMORY.md

> Mémoire persistante du projet. Ce fichier est la référence entre les sessions.

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

### Non déployé sur Vercel
- L'utilisateur a demandé de NE PAS déployer tant que le zoom n'est pas réglé
- Le zoom est maintenant réglé → prêt pour déploiement quand l'utilisateur le demande

### Points d'attention
- Turbopack peut se corrompre → `rm -rf .next` en cas de comportement bizarre
- Le `max_rows` Supabase a été changé à 10000 dans le dashboard (pas dans le code)
- Les couleurs du dropdown métier dépendent de `useMetierCategories()` — si les catégories ne sont pas configurées, le dropdown fallback sur une liste plate
