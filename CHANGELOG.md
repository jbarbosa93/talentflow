# Changelog TalentFlow

## v0.20.0 — 26 mars 2026

### Import OneDrive — Parsing ameliore
- Date de naissance, genre, permis de conduire maintenant extraits et sauvegardes
- Detection des documents non-CV (permis nacelle, certificats, attestations)
- Documents non-CV ajoutes comme piece jointe au candidat existant
- Documents non-CV sans candidat identifiable correctement rejetes avec log
- Detection full-page scan pour eviter de mettre le CV entier comme photo de profil
- Genre detecte automatiquement par l'IA (prenom, accords grammaticaux)

### Prompt IA ameliore
- Meilleure detection de la date de naissance (formats: 36/ 30-12-1988, DN:, Ne(e) le, etc.)
- Ajout du champ genre dans l'analyse IA
- Meilleure classification document_type (permis, certificat, attestation, etc.)

### Doublons — Affichage enrichi
- Carte candidat enrichie: photo, derniere experience, stats (nb exp, formations, annees)
- Badge source (OneDrive/Upload) affiche
- Overflow corrige sur les noms longs et competences

### Activites — Imports OneDrive
- Chaque import individuel (cree, mis a jour, reactive) est maintenant logge separement
- Suppression du log de synthese global (doublon visuel)
- Pastilles initiales supprimees dans la timeline pour un affichage plus propre

### CV personnalise
- Ligne jaune fine sous les titres de section (pas de bandeau)
- Titre de section au-dessus de la ligne

### Corrections
- Type error TypeScript corrige (candidatId/filename dans le type retour OneDrive sync)
- Types Candidat enrichis dans le contexte Doublons (photo, experiences, formations)

---

## v0.16.1 — 26 mars 2026
- Imports OneDrive logges individuellement
- CV titres corriges

## v0.16.0
- Doublons — actions individuelles, fusion, reanalyse par paire
- Mailing — bouton CV original + support CV personnalise en PJ
- Mailing — joindre les CVs en piece jointe via Microsoft Graph

## v0.15.0
- Filtres persistants + pipeline renommer/X en bas + OneDrive recursif
- Activites enrichies + badge nouveaux CVs dans sidebar
- OneDrive sync supporte images (JPG, PNG, JPEG, WebP)
- Metiers partages via Supabase
- OneDrive smart update — CV mis a jour ou reactive au lieu de doublon
- Badge source Email/OneDrive sur liste candidats

## v0.14.0
- Recherche full-text, audit IA, pagination serveur

## v0.12.0
- Import intelligent, documents, zoom HD, classification IA

## v0.11.0
- Retry intelligent documents

## v0.10.0
- Version stable initiale
