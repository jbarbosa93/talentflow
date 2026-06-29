# Merge Excel → Module Administration (secretariat_*) — 29/06/2026

Synchronisation **miroir strict** des 2 fichiers Excel des secrétaires vers les 5 tables
`secretariat_*`, pour faire de TalentFlow la source de vérité (fin du travail sur Excel).

## Contexte
La base était figée au merge du 26 mai (v2.9.74). L'Excel a évolué tout juin (surtout 2026).
Objectif : aligner exactement TalentFlow sur l'Excel à jour (2025 + 2026).

## Fichiers source
- `~/Desktop/Candidat actif_2026 copie.xlsx` → candidats, ALFA, ALFA à payer, loyers
- `~/Desktop/Cas Accident - Maladie _2026 copie.xlsx` → accidents

## Stratégie : remplacement complet par année
Pour chaque table et chaque année présente dans l'Excel : `DELETE WHERE annee=Y` puis ré-insertion
de toutes les lignes Excel transformées. **Idempotent** (ré-exécutable sans doublon), **sans
collision de matching**. Les champs propres à TalentFlow (`candidat_id`, `couleur`, `mode_paiement`,
`archived_at`, `created_at`…) sont **préservés** via un index par nom+prénom construit depuis le backup.

> ⚠️ Le **N°Quad n'est PAS unique** dans cet Excel (4 quads désignent 2 personnes différentes).
> Ne jamais matcher/dédupliquer sur le Quad seul. L'identité fiable = **nom + prénom**.

## Mapping clé
- « Mission terminée » : `x`→terminée · `ARCHIVE`→archivé · une date→`date_fin_mission` + terminée
- Docs `CV/CM/MAPPE/DOCS`→booléens ; `Carte ID/AVS/IBAN`→statut texte (`ok`/`échue`)
- Dates `JJ,MM,AAAA`→ISO (validation calendaire : dates impossibles rejetées)
- N° sinistre / AVS : virgules→points
- Accidents : `CAS`→type_cas, `Accident`→sous_type, `Terminé`→statut_cas

## Ordre d'exécution
```bash
python3 01-backup.py            # backup JSON des 7 tables -> ~/Desktop (rollback)
python3 02-merge.py             # DRY-RUN (affiche le plan, aucune écriture)
python3 02-merge.py EXEC        # exécution réelle
python3 04-verify.py            # contrôles : counts, doublons, couverture, résidus, candidat_id
python3 03-restore.py           # rollback depuis le backup si besoin
```
Les scripts lisent les identifiants Supabase depuis `.env.local` (service role, jamais committé).

## Anomalies Excel détectées (à corriger à la source)
- 4 N°Quad partagés par 2 personnes : 124204, 124414, 124596, 124869
- 2 dates impossibles : Corcione Emanuele (DDN 31.04.1984), Correia de Pinho Hugo Miguel (échéance 31.11.2025)
- 1 doublon ALFA : Dascalu Stelian-Mihai (2025)
- 13 cellules « Mission terminée » non standard (ACCIDENT/MALADIE/xx) → traitées comme actif
