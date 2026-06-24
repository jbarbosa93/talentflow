# TalentFlow — CONTEXT.md
> **Lire en PREMIER à chaque session. 1 page max. Ne pas allonger.**

---

## État prod

| Clé | Valeur |
|-----|--------|
| Version | **v2.13.24** |
| URL | talent-flow.ch |
| Supabase | rdpbqnhwhjkngxxitupg (eu-west-1 Frankfurt) |
| Vercel | Pro — région dub1 |
| Dev local | port 3001 — `next dev --port 3001 --webpack` (Turbopack désactivé) |
| **Dernière sync** | **2026-06-24 14:45** |

---

## Dernière session (24/06/2026 — v2.13.20)

- **v2.13.20 — Rapports par candidat (lien découplé de la mission)** : (1) titre du lien sans entreprise (« Rapport {Candidat} ») ; (2) liste rapports → colonne Client pilotée par le statut de la mission liée (entreprise active / « Fin de mission » orange / « Sans mission ») ; (3) **auto-liaison** : créer une mission rattache auto la nouvelle mission au lien rapport libre du candidat (POST `/api/missions`, n'écrase pas une mission active) + toast. Lot « Lier une mission » existait déjà (`LinkMissionButton`). Pas de migration (modèle `report_links` avait déjà `mission_id` nullable).
- **v2.13.19 — Fix import OneDrive « anti-race »** : filet anti-doublon-simultané matchait nom+prénom sur toute la table sans fenêtre → CV collé à un vieux homonyme. Fix : fenêtre 10 min + `nomsSimilaires`. Beau Gosse re-traité → candidat créé (⚠️ vérifier doublon avec Mora 2023 dans l'outil Doublons). Les 5 autres suspects PAS re-scannés (déplacés hors dossier OneDrive → re-déposer si besoin).
- Debounce liste candidats 150→300 ms (la RPC recherche fait un seq scan ~640 ms — vrai fix RPC reporté)
- Restructuration fichiers contexte + persona dev senior. Audit français (82/100) + perf liste candidats (5,5/10) — non appliqués.

---

## App iOS (repo séparé `~/Dev/talentflow-sign-app`)

- Build 1.0(4) soumis App Store — **« En attente de vérification »**
- Auth par **token Bearer JWT** (pas cookie — WKWebView ne stocke pas les cookies httpOnly)
- `server.url` retiré de `capacitor.config.ts` pour le build prod
- 100% collaborateur (portail candidat `/report`) — côté client = web uniquement

---

## TODO actif

- [ ] **Après déploiement v2.13.19** : remettre en file les 7 fichiers suspects + sync manuel + vérifier qu'ils repartent bien (⚠️ Beau Gosse en 404 → peut nécessiter re-dépôt)
- [ ] **Perf recherche candidats** : RPC `search_candidats_filtered` fait un seq scan ~640 ms (OR avec ILIKE unaccent non-indexables). Fix = RPC v4 indexée (fts élargi + index trgm f_unaccent) avec compromis substring→lexème sur CV/compétences. À construire + benchmarker en parallèle avant bascule.
- [ ] **Corrections français** (audit 82/100) : accents `integrations/page.tsx` + `activites/page.tsx` + `doublons` ; tutoiement portail candidat ; `MB`→`Mo` (6 fichiers sign). NE PAS toucher `template`/`wizard` internes.

---

## Bugs connus non bloquants

- Rebond résiduel portail candidat (coque vs body-scroll) — non bloquant, reporté
- 14 FK sans index DB (performance, pas critique)
- 21 `<img>` → `<Image>` Next.js (bundle, pas critique)
- Firefox télécharge le CV au lieu d'afficher (probable réglage navigateur, pas un bug code)

---

## Règles de démarrage session

1. Lire ce fichier (CONTEXT.md)
2. Lire CLAUDE.md (règles, stack, patterns)
3. Lire MEMORY.md (3 dernières sessions)
4. Demander à João ce qu'il veut faire si pas précisé
5. Afficher : `[Modèle: X] [Effort: X] [Impact: fichiers concernés]`

## Règle fin de session

Mettre à jour **ce fichier** :
- Section "Dernière session" → résumé de ce qui a été fait
- Section "TODO actif" → ce qui reste à faire
- Section "Bugs connus" → ajout/suppression si nécessaire
- Incrémenter la version si déploiement

---

## Liens docs

| Doc | Contenu |
|-----|---------|
| `CLAUDE.md` | Règles, stack, patterns, architecture |
| `MEMORY.md` | 3 dernières sessions détaillées |
| `docs/CLAUDE-history.md` | Historique complet v2.6→v2.13 |
| `docs/CLAUDE-detailed-rules.md` | 85+ patterns complets + routes API |
| `memory/app-ios-wkwebview-portail.md` | Pièges WKWebView app native |
