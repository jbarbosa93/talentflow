# Photo extraction — banc de tests v1.9.105

Infrastructure de tests pour le moteur extraction photos (`lib/cv-photo.ts`).
Mise en place pour préparer les fix v1.9.105 (Session 2 → fix F1+F3+F5, Session 3 → fix F2+F4).

---

## Pourquoi cette infra

Diagnostic 25/04/2026 sur 22 cas d'échec d'extraction (screenshots João du 23/04/2026).
Le diagnostic visuel suggérait des bugs de **scoring** (photos rondes, N&B, fond complexe).

**La baseline contredit cette hypothèse** : sur 22 fixtures, 20 échouent avec
`aucun candidat extrait du fichier` — c'est-à-dire que **Strategy 1 (pdf-lib XObject) ne trouve
aucune image dans le PDF**. Le scoring n'est jamais atteint.

→ Les vraies causes (à investiguer Session 2) sont probablement :
- Filters PDF non gérés (CCITTFaxDecode, JBIG2Decode, RunLengthDecode...)
- Strategy 2 (pdfjs-dist) qui échoue silencieusement
- Strategy 3 (Vision page entière) trop restrictive (`candidates.length === 1` requis)
- Form XObject avec récursion `depth > 3` qui coupe trop tôt

---

## Datasets

### `~/Desktop/talentflow-test-fixtures/photos-fail/`
**22 fichiers** (20 PDF + 1 JPG + 1 DOCX) — candidats où l'extraction a échoué visuellement
(avatar TalentFlow montre les initiales au lieu de la photo dans les screenshots).

- `manifest.json` — index des 22 fichiers (idx, filename, candidat_id, name, size)
- `baseline-report.json` — résultat moteur ACTUEL : 2/22 OK, 20/22 KO

Ces 22 fichiers sont la **cible** : Session 2 cherche à monter ce score.

### `~/Desktop/talentflow-test-fixtures/photos-ok/`
**100 fichiers PDF** — candidats avec `photo_url IS NOT NULL` en DB (témoin anti-régression).

- `manifest.json` — index des 100 fichiers
- `baseline-witness-report.json` — résultat moteur ACTUEL : **40/100 (40%) OK**

Ces 100 fichiers sont le **garde-fou** : Session 2/3 ne doit pas faire baisser ce taux.

⚠️ Les 60% qui échouent malgré `photo_url` en DB indiquent que ces photos
ont été **extraites manuellement** via `/parametres/corriger-photos` ou par une
version antérieure du moteur. **C'est un constat important** : le moteur actuel
n'est PAS à 100% sur le stock prod, il est à 40%.

---

## Scripts

| Script | Rôle |
|---|---|
| `download-photos-fail-fixtures.mjs` | Télécharge les 22 fixtures depuis Supabase Storage (URLs hardcodées dans le manifest interne) |
| `download-photos-ok-fixtures.mjs` | Sélectionne 100 témoins via Supabase service role + télécharge |
| `test-photo-extraction.ts` | Lance le moteur sur les 22, capture score+raison via interception console.log, rapport JSON |
| `sim-photo-extraction.ts` | Lance le moteur sur les 100, mesure pourcentage de succès |

---

## Comment lancer

### Setup initial (déjà fait — Session 1)
```bash
# Télécharger les fixtures (22 fail + 100 ok)
node scripts/tests/download-photos-fail-fixtures.mjs
node --env-file=.env.local scripts/tests/download-photos-ok-fixtures.mjs
```

### Établir baseline avant fix (Session 2 — avant modif)
```bash
npx tsx --env-file=.env.local scripts/tests/test-photo-extraction.ts
npx tsx --env-file=.env.local scripts/tests/sim-photo-extraction.ts
# Vérifier : 2/22 + 40/100 (état du 25/04/2026)
```

### Tester un fix (Session 2 — après modif lib/cv-photo.ts)
```bash
npx tsx --env-file=.env.local scripts/tests/test-photo-extraction.ts
# Cible : ≥ 12/22 (≥ 50% des cas récupérés)

npx tsx --env-file=.env.local scripts/tests/sim-photo-extraction.ts
# Cible : ≥ 40/100 (pas de régression sur le témoin)
```

### Comparer avant/après
Les rapports JSON contiennent `summary.ok`, `summary.fail`, `summary.causes` (banc) ou `summary.pct` (témoin).
Diff manuel ou script de comparaison à créer Session 2 si besoin.

---

## Format des rapports

### `baseline-report.json` (banc 22)
```json
{
  "when": "2026-04-25T...",
  "summary": { "total": 22, "ok": 2, "fail": 20, "causes": { "aucun candidat extrait": 20 } },
  "results": [
    {
      "idx": 1,
      "filename": "001-orlando-pereira-sousa.jpg",
      "name": "Orlando José Perreira Sousa",
      "ext": ".jpg",
      "extracted": true,
      "photo_size_bytes": 19260,
      "candidates_count": 0,
      "candidates": [],
      "selected": null,
      "best_score": null,
      "vision_validations": [],
      "failed_strategies": [],
      "error": null,
      "duration_ms": 3302
    },
    ...
  ]
}
```

### `baseline-witness-report.json` (témoin 100)
```json
{
  "when": "2026-04-25T...",
  "summary": { "total": 100, "ok": 40, "fail": 60, "pct": 40.0 },
  "results": [...]
}
```

---

## Catégorisation des 22 fixtures

D'après diagnostic visuel initial (screenshots du 23/04/2026) :

| Catégorie | Cas | Hypothèse initiale | Confirmé baseline ? |
|---|---|---|---|
| **A** Photo absente CV | 1 (#4 Ricardo Vieira Europass) | Comportement normal | À vérifier |
| **B1** Photo circulaire ratio ~1.0 | 9 (#7,9,10,12,13,14,18,19 + #15 carré) | Veto scoring | ❌ Non — Strategy 1 ne trouve rien |
| **B2** Photo N&B | 3 (#6, #8, #17) | likelyBW trop étroit | ❌ Non — Strategy 1 ne trouve rien |
| **B3** Header / fond complexe | 5 (#2, #5, #11, #18, #22) | Form XObject depth | ❌ Non — Strategy 1 ne trouve rien (sauf #11) |
| **B4** Photo "normale" | 4-5 (#1, #3, #16, #20, #21) | Vision Haiku répond NO | ❌ Non — Strategy 1 ne trouve rien (sauf #1 .jpg) |

→ **Le diagnostic doit être refait Session 2** avec logs détaillés (F5) pour
comprendre pourquoi `pdf-lib` ne trouve aucun XObject Image dans 19 PDFs.

---

## Protocole validation Session 2 / Session 3

### Avant déploiement v1.9.105 (Session 2 — F1+F3+F5)

1. Lancer baseline :
   ```bash
   npx tsx --env-file=.env.local scripts/tests/test-photo-extraction.ts > /tmp/photo-baseline-22.txt
   npx tsx --env-file=.env.local scripts/tests/sim-photo-extraction.ts > /tmp/photo-baseline-100.txt
   ```
2. Implémenter fix dans `lib/cv-photo.ts`
3. Re-lancer les 2 scripts
4. **Critères de succès** :
   - Banc 22 : ≥ 12/22 (≥ 50%) OU au moins +5 cas vs baseline (de 2 à 7+)
   - Témoin 100 : ≥ 40/100 (pas de régression)
5. Si non atteint → diagnostiquer logs détaillés, ajuster, re-tester
6. Si atteint → présenter à João, attendre validation, déployer

### Avant déploiement v1.9.106 (Session 3 — F2+F4)

Idem, avec critères :
- Banc 22 : ≥ 17/22 (≥ 75%)
- Témoin 100 : ≥ 40/100

---

## Notes / coût Vision API

`extractPhotoFromPDF` appelle Claude Haiku Vision dans :
- **Strategy 1b** (validation top 3 candidats) : 1-3 appels par PDF si plusieurs candidats > 20 score
- **Strategy 3** (crop scan page entière) : 1 appel par PDF si 1 seul candidat full-page

Pour le banc 22 : ~5-15 appels Haiku par run (faible coût ~$0.01).
Pour le témoin 100 : ~50-150 appels Haiku par run (~$0.05).

---

## Cas spéciaux

### #13 Yannick — hypothèse Yannick Garzino (à valider)
Le screenshot montre un avatar "YG" et titre "TECHNICIEN MAINTENANCE". Aucun candidat
nommé "Yannick Cortez" n'existe en DB. Hypothèse retenue : c'est **Yannick Garzino**
(ELECTRICITE/electricien industriel — cohérent avec "TECHNICIEN MAINTENANCE").
Si à la fin de Session 2 ce cas reste suspect, valider avec João en ouvrant
le PDF téléchargé et le screenshot original côte à côte.

### #1 Orlando — extraction OK en baseline mais avatar OP dans screenshot
Le moteur extrait via `extractPhotoFromImage` (Vision Haiku non-déterministe).
Au moment du screenshot 23/04, l'extraction avait probablement échoué.
Maintenant elle réussit. Cela illustre la non-déterminisme de Vision IA sur
les CVs au format image (.jpg/.png).

### #11 Jorge Martins — extraction OK en baseline malgré screenshot fail
Score 112 (très haut). Probablement un cas où la photo a été corrigée manuellement
en DB depuis le screenshot, OU Strategy 1 trouve maintenant le XObject. À investiguer
si nécessaire.
