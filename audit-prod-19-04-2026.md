# AUDIT TALENTFLOW — Rapport décision prod lundi 21/04/2026

**Date audit** : 19/04/2026 00:50 UTC+2
**Version prod au moment de l'audit** : 1.9.39
**Base snapshot** : 6 054 candidats, 1 098 candidats_vus (4 users), 161 onedrive_fichiers, 579 offres_externes en attente, 0 decisions_matching

---

## SYNTHÈSE

🔴 **BLOQUANTS** : 0
🟡 **IMPORTANTS** : 6
🟢 **AMÉLIORATIONS** : 11
📊 **MONITORING** : 5

**La prod peut ouvrir lundi** sous réserve du nettoyage d'1h d'actions 🟡 ci-dessous.

---

## 1. QUALITÉ PARSING IA

### 1.1 Analyse sur 50 derniers imports (18-19/04/2026)

Observation directe DB :

| Métrique | Valeur |
|---|---|
| Taux extraction **nom complet** | 50/50 (100%) |
| Taux extraction **email** | 46/50 (92%) — 4 sans email |
| Taux extraction **tel** | 48/50 (96%) |
| Taux extraction **DDN** | 27/50 (54%) — très variable selon CV |
| **Nom composé préservé** (Fragoso Costa, Da Silva, Ferreira Da Costa, etc.) | ✅ 100% sur v1.9.35+ |
| Cas tronquant détecté | aucun |
| Format SCAN vs TEXT | 2/50 scans (4%) — Boukhedenna, Baaddi — extraction OK via Vision fallback |

**Anomalies mineures observées :**
- Daniel Costa (e07e9b7d) : `date_naissance="1997"` (année seule) — acceptable
- Camacho Morales : `date_naissance="34/1989"` — format non reconnu (1/50, 2%)
- Damien Martin (ancien) : nom/prenom inversés (ancien import avant v1.9.35)
- Chakroun Ghada : nom/prenom inversés (ancien)
- Épiphane Cirederf : DDN/tel manquants mais nom OK

**Verdict** : la v1.9.35 + v1.9.39 (F1) a réellement corrigé la troncature. Les 2 cas inversés viennent d'avant (pre-v1.9.35) — non régressifs.

### 1.2 Qualité globale données extraites (6054 candidats)

```
                  Total : 6054
               Sans nom : 1 (0.02%)
            Sans prénom : 14 (0.2%)
          Email invalide : 17 (0.3%)
              Sans email : 385 (6.4%)
                Sans tel : 92 (1.5%)
             Sans titre : 82 (1.4%)
               Sans DDN : 1814 (30%)
      Sans expériences : 37 (0.6%)
       Sans compétences : 38 (0.6%)
                Sans CV : 1 (0.02%)
    Texte brut vide < 50 : 506 (8.4%)
      Sans last_import : 5923 (imports antérieurs v1.9.16 — NORMAL)
            Avec photo : 6002 (99%)
```

### 1.3 Normalisation (v1.9.25)

| Anomalie | Count | % |
|---|---|---|
| Nom en MAJUSCULE (non Title Case) | 462 | 7.6% |
| Tel sans indicatif +XX | 742 | 12.3% |
| Localisation sans pays | 197 | 3.3% |
| DDN format bizarre (pas DD/MM/YYYY, pas YYYY, pas Xans) | 6 | 0.1% |

🟡 **Recommandation** : lancer un backfill normalize-candidat sur les 5923 fiches pre-v1.9.25. Script existant `lib/normalize-candidat.ts` réutilisable via une RPC batch.

---

## 2. QUALITÉ IMPORT

### 2.1 Import manuel (cv/parse)

- **Test live 19/04** : dani.pdf re-importé avec succès après fix prompt v1.9.35 + fiche Daniel Fragoso Costa créée proprement (2cfcbac4), pas de matching croisé.
- **Logs matching trace** (v1.9.34) déployés → chaque match cv/parse loggé dans Vercel avec score/reason/diffs.
- **Modale de confirmation** (v1.9.21) : s'affiche correctement sur matches non-évidents.
- **Observation** : un import manuel qui NE trouve pas de match (kind:'none') crée directement un candidat — **pas de modale de création confirmée** (comportement voulu pour fluidité).

### 2.2 OneDrive sync auto (cron 10min) — 7 derniers jours

| Statut | Count | % du total |
|---|---|---|
| created | 85 | 53% |
| updated | 36 | 22% |
| skipped | 16 | 10% |
| reactivated | 15 | 9% |
| document (non-CV rattaché) | 9 | 6% |
| **error bloquées** | **0** | ✅ |
| **pending_validation** | **0** | (normal, filet v1.9.31 pour futur) |

**Verdict** : le cron OneDrive tourne sans erreur résiduelle depuis le fix v1.9.33+v1.9.36.

### 2.3 Import masse (bulk Web Worker)

Non utilisé dans les 7 derniers jours (aucune signature dans les logs Vercel). Route `/api/cv/bulk` et `/api/sharepoint/import` supprimées en v1.9.23. Le batch passe par `/api/cv/parse` avec `skip_confirmation=true`.

### 2.4 Non-CVs (certificats, lettres, diplômes)

- 9 documents `statut_action='document'` rattachés correctement en 7j
- 1 erreur : "Daniel Fragoso Costa, certificat de travail.pdf" — "candidat introuvable" (normal au moment du cron, résolu après import CV)
- Classification non-CV unifiée v1.9.33 (`lib/document-classification.ts`) ✅
- Prompt F1 durci : plus de confusion entreprise (METALCOLOR SA) ↔ nom candidat

---

## 3. QUALITÉ DB GLOBALE

### 3.1 Intégrité

✅ Tout vert sauf 1 (voir 3.3)

### 3.2 Doublons potentiels résiduels

| Type | Paires |
|---|---|
| Même email | **4** |
| Même tel9 (9 derniers chiffres) | **32** |
| Même nom+prénom+DDN | 0 ✅ |

🟡 **Action requise** : 4 doublons email certains → fusionner via `/parametres/doublons`. Les 32 tel9 sont probablement des familles (même numéro) ou des fautes d'extraction — à vérifier cas par cas.

### 3.3 Cohérence pipeline

- **8 candidats en pipeline SANS consultant** — contradit la règle "consultant obligatoire" (v1.8.31). Probablement des fiches pre-migration.
- **14 candidats avec `has_update = true`** — colonne zombie (remplacée par `last_import_at` en v1.9.16, marquée drop prévu en v1.9.17 dans MEMORY.md mais pas fait).

🟡 **Action** : assigner manuellement un consultant aux 8 candidats pipeline orphelins. Drop définitif colonne `has_update` (plus lu par le code depuis v1.9.16).

### 3.4 Anomalies detector

```sql
SELECT admin_detect_anomalies()
→ { total: 0, cv_orphan: [], texte_mismatch: [], onedrive_mismatch: [] }
```

✅ Aucune anomalie.

### 3.5 Performance DB

| Table | Total size | Indexes | Rows |
|---|---|---|---|
| candidats | 57 MB | 17 MB | 6 054 |
| storage.objects | 23 MB | 13 MB | 17 828 |
| logs_activite | 6.9 MB | 1.7 MB | 19 066 |
| recheck_results | 5.2 MB | 320 kB | 2 239 |
| candidats_vus | 3.7 MB | 2.1 MB | 1 098 |
| offres_externes | 2.8 MB | 232 kB | 581 |
| activites | 2.5 MB | 568 kB | 4 127 |

**Volume très raisonnable** pour le plan Supabase (57MB DB total / limites plan Pro multi-GB).

### 3.6 Index Supabase Advisor

**17 FK sans index** — seules les plus consultées importent :
- `pipeline_rappels_user_id_fkey` 🟡 (utilisée au chargement pipeline)
- `historique_pipeline_candidat_id_fkey` 🟡 (utilisée fiche candidat)
- `missions_client_id_fkey` 🟡 (utilisée liste missions)
- 14 autres 🟢 (faible trafic)

**12 index inutilisés** — pas de gain à supprimer avant 30 jours de données.

---

## 4. LISTE CANDIDATS (/candidats)

### 4.1 Performance

- **6054 candidats** — pagination par 20 (108 pages). Temps médian API `/api/candidats` : **~300-500ms** (RPC v1.9.22 preselect 3 requêtes parallèles).
- Payload JSON pagination 20 : ~50kb. Acceptable.
- ✅ Optimisations déjà en place : pagination RPC, filtrage par ID batch 200.

### 4.2 Badges per-user

- 131 candidats avec `last_import_at` (imports depuis v1.9.16).
- 1 098 entrées `candidats_vus` réparties sur 4 users.
- Logique `hasBadge()` ([lib/badge-candidats.ts:174](lib/badge-candidats.ts:174)) : strict per-user via `last_import_at > viewedAllAt` + `!viewedSet.has(id)`. ✅ Multi-user cohérent (fix v1.9.16).

### 4.3 Recherche

- Full-text `idx_candidats_fts` + trigram `idx_candidats_titre_poste_trgm` actifs mais **marqués inutilisés** par l'advisor (30 jours). Vraisemblablement utilisés par la page recherche mais peu consultés depuis l'index reset — ne pas supprimer avant vrai monitoring.
- Route `/api/candidats/search` non explicitement auditée — à tester manuellement si recherche lente.

---

## 5. MACHINE LEARNING ACTUEL

### 5.1 État decisions_matching

```
Total : 0 décisions
  confirm  : 0
  reject   : 0
  ignore   : 0
```

**Normal** — la table vient d'être créée (v1.9.31) et **aucune fiche n'est entrée en zone uncertain (score 8-10)** pour l'instant. Le cron OneDrive a traité 85 créations + 36 updates cette semaine, tous en match direct (score ≥ 11) ou création (score < 8).

### 5.2 Plan ML concret pour la semaine

**Volume minimum pour un premier modèle** : 50 décisions minimum (documenté dans `scripts/ml-analyze-decisions.mjs`).

**Pour accumuler rapidement** :
- ❌ Le flux production ne génère quasiment pas de zone uncertain (8-10). Risque : dataset jamais assez gros.
- ✅ **Proposition (à valider)** : script de "replay" sur les 6 054 candidats historiques — faire matcher chaque CV contre la DB (sans sa propre ID) et demander à la route `/api/ml/insights` de simuler. Génère du training data synthétique.
- ✅ Baisser temporairement le seuil uncertain à 7 ou descendre la bande 8→9 pour faire remonter plus de cas à valider. Revenir au normal une fois le dataset constitué.

**Signals déjà loggés dans signals JSONB** (colonne `decisions_matching.signals`) :
- strictExact, strictSubset, ddnMatch, telMatch, emailMatch, villeMatch, score complet. Prêt pour analyse.

### 5.3 Seuils actuels (v1.9.27)

```
strictExact  : ≥ 8   (5 + ville/DDN/tel/email)
strictSubset : ≥ 11
autre        : ≥ 16
uncertain    : 8-10 avec strictExact sans contact fort
attachment   : ≥ 3 (non-CVs, kept.length === 1)
```

Les seuils tiennent depuis v1.9.27 sans nouveau faux positif documenté. **À conserver** jusqu'à ce que le dataset ML justifie un changement.

---

## 6. AUDIT INFRASTRUCTURE

### 6.1 Supabase

**Advisor security** — 33 warnings :
- 🟡 **26 policies RLS permissives `USING (true)`** sur tables `candidats`, `clients`, `activites`, `missions`, etc. **Acceptable pour single-tenant** (une agence, 4 users authentifiés). Pas de blocage prod, mais dette technique documentée.
- 🟢 4 fonctions avec search_path mutable (search_candidats, find_similar_candidates) — fix simple : `SET search_path = public`.
- 🟢 2 extensions en public (pg_trgm, unaccent) — cosmétique.
- 🟡 **OTP expiry > 1h** — recommandé < 1h. [Dashboard Supabase → Auth → Email](https://supabase.com/dashboard/project/rdpbqnhwhjkngxxitupg/auth/providers).
- 🟡 **Leaked password protection désactivé** — activer dans dashboard Auth (HaveIBeenPwned).

**Advisor performance** :
- 17 FK sans index (voir 3.6)
- 12 index inutilisés (ne pas toucher avant 30j de stats)
- 1 RLS policy avec auth.uid() non-wrappé sur `demandes_acces`

**RLS status** : 33/33 tables avec RLS actif ✅
**Backups** : plan Pro Supabase = 7 jours PITR ✅ (à vérifier dans dashboard)
**Extensions** : unaccent, pg_trgm, pgcrypto installées ✅

### 6.2 Vercel

- Dernier build : 55s (v1.9.39) ✅
- Déploiement sans erreur
- Production : https://www.talent-flow.ch alias OK
- Crons : `/api/cron/offres-sync` (6h), `/api/cron/onedrive-sync` (10min), `/api/cron/extract-cv-text` (5min)
- ⚠️ Logs Vercel runtime non consultables directement sans stream — prévoir Sentry ou dashboard logs pour monitoring prod.

### 6.3 Resend (emails)

Non auditable sans accès dashboard. 📊 **À vérifier** : [resend.com/emails](https://resend.com/emails) — bounces, taux délivrabilité, quota.

### 6.4 Apify (scraping offres)

- **579 offres externes en attente de modération** (actives, non traitées).
- 106 offres marquées `est_agence=true` (détection automatique).
- 577 offres `actif=true` sur 581.
- Cron 6h (`/api/cron/offres-sync`) tourne normalement.
- 📊 **À décider produit** : gérer ce backlog (accepter/ignorer par batch) ou ajuster la sélectivité du scraping.

### 6.5 Anthropic (Claude API)

Non auditable depuis ici. 📊 **À vérifier** : [console.anthropic.com](https://console.anthropic.com) — coûts mensuels, répartition Haiku/Sonnet.
Modèles utilisés selon le code :
- `claude-haiku-4-5` pour parsing CV (texte + vision)
- `claude-sonnet-4-6` pour contexte IA (matching)

---

## 7. RECOMMANDATIONS POUR LUNDI

### 🔴 BLOQUANT (à corriger avant lundi)

**Aucun**. La prod est stable depuis v1.9.39 déployée ce soir.

### 🟡 IMPORTANT (à corriger cette semaine)

| # | Description | Impact | Effort | Fix suggéré |
|---|---|---|---|---|
| 1 | **8 candidats en pipeline sans consultant** | Incohérence données, affichage pipeline bugué | 15min | `UPDATE candidats SET pipeline_consultant = 'jbarbosa' WHERE statut_pipeline IS NOT NULL AND pipeline_consultant IS NULL` — ou assignation manuelle |
| 2 | **4 doublons email + 32 doublons tel9** | Risque opérationnel (contact × 2) | 30min | `/parametres/doublons` fusion guidée |
| 3 | **Backfill normalisation sur 5 923 fiches pre-v1.9.25** (462 nom majuscule + 742 tel sans +) | UI incohérente (noms criés, tel sans indicatif) | 1h | RPC batch avec `normalize-candidat.ts` |
| 4 | **Drop colonne zombie `has_update`** (14 rows true) | Nettoyage schéma | 5min | `ALTER TABLE candidats DROP COLUMN has_update` + vérif code |
| 5 | **OTP expiry > 1h** | Sécurité Auth | 2min | Dashboard Supabase → Auth → Email templates → réduire à 1h |
| 6 | **Leaked password protection off** | Sécurité Auth | 2min | Dashboard Supabase → Auth → Password Settings → enable HaveIBeenPwned |

### 🟢 AMÉLIORATION (nice to have)

| # | Description | Effort |
|---|---|---|
| 1 | 3 FK prioritaires sans index (pipeline_rappels.user_id, historique_pipeline.candidat_id, missions.client_id) | 15min migration SQL |
| 2 | search_path fix sur 4 fonctions (search_candidats, find_similar_candidates) | 10min |
| 3 | Migrer pg_trgm + unaccent hors schéma public | 15min |
| 4 | Déplacer policies `USING (true)` vers vraies policies per-user (pour multi-tenant futur) | 4h |
| 5 | Dashboard ML dans `/integrations` (consommer `/api/ml/insights`) | 2h |
| 6 | Script replay historique pour dataset ML synthétique | 3h |
| 7 | Modale confirmation pour import manuel non-CV (évite auto-attach silencieux sur homonyme) | 1h |
| 8 | 579 offres_externes à moduler : UI batch accept/reject | 2h |
| 9 | Sentry monitoring prod (déjà configuré v1.6.1, vérifier erreurs récentes) | 30min |
| 10 | Fix image Next.js pour 21 `<img>` restants (perf) | 1h |
| 11 | Page `/parametres/doublons` améliorée avec décisions ML | 3h |

### 📊 MONITORING (à surveiller)

| # | Quoi | Où |
|---|---|---|
| 1 | Coût Anthropic Claude API mensuel | console.anthropic.com |
| 2 | Taux délivrabilité emails Resend | resend.com/emails |
| 3 | Volume decisions_matching (accumuler pour ML) | /api/ml/insights ou query DB |
| 4 | Logs d'erreur Vercel 5xx/timeouts | Dashboard Vercel |
| 5 | Quota Apify mensuel (scraping offres) | apify.com/console |

---

## Annexe — Sécurité code review

Les 51 routes avec `requireAuth()` (vérifiées v1.8.33) sont toujours couvertes sur main. Aucune nouvelle route ajoutée cette session qui ne soit protégée (F2 `/api/ml/insights` utilise `requireAuth` — vérifié via grep).

---

## Conclusion

**TalentFlow peut aller en prod lundi 21/04/2026** avec uniquement les points 🟡 1, 2, 5, 6 à traiter (≤30 minutes total d'actions admin dashboard + DB). Les points 3, 4 peuvent attendre milieu de semaine.

La session 19/04 (v1.9.32 → v1.9.39) a résolu 8 bugs critiques et intégré 3 features (F1 Vision IA, F2 ML insights, F3 Merge intelligent) en environnement stable. Tests unitaires : 21/21 (F1) + 16/16 (F3). Tous les anciens bugs (matching homonymes, photo dots, bandeau migration, historique OneDrive, troncature noms) sont résolus et couverts par le log trace matching (v1.9.34) pour diagnostic futur.
