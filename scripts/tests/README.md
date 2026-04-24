# Scripts de tests — TalentFlow

Scripts DRY-RUN / diagnostic / simulation pour valider le pipeline d'import candidats sans écrire en DB prod.

Usage typique : lancer avant un déploiement qui touche classifier / matching / cv-parser
pour vérifier qu'on n'introduit pas de régression.

**Prérequis** : `.env.local` chargé (`set -a; source .env.local; set +a`).

---

## Inventaire

### 🧪 Simulations classifier/matching

| Script | But | Quand l'utiliser |
|---|---|---|
| `sim-classifier-hardening.mjs` | Compare classifier OLD vs CURRENT vs NEW sur 5 datasets (100 CVs réels DB + 20 non-CVs synth + Loïc Arluna + Manor/Sandra/Marjorie + Zahmoul warning) | Avant toute modif de `lib/document-classification.ts` ou `lib/cv-extraction-validator.ts`. **Objectif : 100% pass sur tous datasets.** |

### 🎯 Tests E2E pipeline réel

| Script | But | Quand l'utiliser |
|---|---|---|
| `test-classifier-loic.ts` | Pipeline complet (mammoth + Claude + classifyDocument) sur un seul fichier réel Loïc Arluna | Après modif classifier pour valider sur le cas cible historique |
| `test-v19102-e2e.ts` | Pipeline complet sur 5 fichiers du batch test (Loïc + Manor + Sandra + Marjorie + Zahmoul) | Régression check après changements classifier |
| `test-parsing-batch.ts` | Parse batch d'un dossier entier (`~/Desktop/talentflow-test-fixtures/`) + auto-diagnostic cohérence (nom tronqué, email manquant, etc.) | Audit qualité sur gros lot de fichiers test |

### 🔍 Diagnostic fichiers test vs DB

| Script | But | Quand l'utiliser |
|---|---|---|
| `inspect-workflow-folder.ts` | Analyse rapide tous les fichiers d'un dossier via Vision IA (nom / type / exp / comp) | Premier check d'un nouveau lot de fichiers test |
| `check-test-files-vs-db.ts` | Compare ce que l'IA extrait de chaque fichier vs candidats existants en DB (match email/tel/nom) | Avant Test 2/3 pour confirmer que les identités test sont fictives |

### 🏗️ Génération fixtures

| Script | But | Quand l'utiliser |
|---|---|---|
| `gen-test-onedrive-pdfs.ts` | Génère 6 PDFs fictifs via pdf-lib (2 CVs Mathieu Berset identiques, 2 versions Sophie Wicky, 2 certificats) | Régénérer les fixtures OneDrive si supprimées |
| `verify-test-od-pdfs.ts` | Vérifie les 6 PDFs générés : SHA256, extraction Vision IA, classifier | Sanity check après génération |

---

## Dataset fixtures

Les PDFs de test sont stockés dans `~/Desktop/talentflow-test-fixtures/` (hors repo). Si supprimés, relancer `gen-test-onedrive-pdfs.ts`.

**Identités fictives utilisées** (jamais en DB prod) :
- Mathieu Berset (CV + certificat)
- Sophie Wicky (v1 + v2 update)
- Patricia Chevrier (certificat orphelin)
- Kevin Delval (CV avec photo, Test 2)
- Théo Batmale (CV avec photo, Test 2)
- José António Pinto Nogueira (nom composé portugais, Test 2)
- Abdellah Kharchach (v1 + v2 update, Test 2)
- Romain Goetz Genève + St-Julien (homonymes, Test 2)
- Loïc Arluna (cas classifier historique, dossier `~/Desktop/BUG TALENTFLOW/`)

---

## Résultats de référence (24/04/2026, v1.9.103)

| Dataset `sim-classifier-hardening.mjs` | OLD | CURRENT | NEW |
|---|---|---|---|
| A — 100 CVs réels | ~90/100 | 100/100 | **100/100** |
| B — 20 non-CVs synth | 20/20 | 20/20 | **20/20** |
| C — Loïc Arluna régression | 5/5 | 5/5 | **5/5** |
| D — Nouveaux cas (Manor/Sandra/Marjorie) | 3/3 | 0/3 ❌ | **3/3** |
| E — Zahmoul warning | — | — | **détecté** |

Tout changement futur au classifier doit **au minimum** préserver ces résultats.

---

## Convention de nommage

- `sim-*` → simulation dataset (read-only, compare N versions)
- `test-*` → test E2E pipeline réel (appelle Claude, lit un fichier disque)
- `verify-*` → validation rapide (sanity check post-génération)
- `inspect-*` → exploration/diagnostic (read-only)
- `check-*` → vérification DB vs source externe
- `gen-*` → génération de fixtures
- `debug-*` → scripts ponctuels de debug (à supprimer après usage)

---

## Lancement type

```bash
# Charger .env.local puis lancer un script
cd /Users/joaobarbosa/Dev/talentflow
set -a; source .env.local; set +a
npx tsx scripts/tests/sim-classifier-hardening.mjs
```

Pour les `.mjs` (ESM pur) : `node --env-file=.env.local scripts/tests/sim-classifier-hardening.mjs`
