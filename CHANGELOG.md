# Changelog TalentFlow

## v0.27.1 — 7 avril 2026

### OneDrive Sync — Refonte logique traitement fichiers

- **Tri DESC** : fichiers traités du plus récent au plus ancien (`lastModifiedDateTime DESC`)
- **`last_modified_at`** : nouvelle colonne dans `onedrive_fichiers` — stocke la date OneDrive connue au moment du traitement
- **`doneMap` corrigé** : compare `last_modified_at` (date du fichier) et non `traite_le` (date du traitement) — évite les faux "déjà traités"
- **Règle 2** : candidat existant + nouveau nom de fichier → CV principal remplacé systématiquement, ancien CV conservé dans `documents[]`
- **Suppression `hasNewContent`** : plus de test de contenu — si le fichier est modifié dans OneDrive, il est toujours retraité
- **Déduplication** : suppression méthode 5 (par nom de fichier) — générait des faux positifs
- **Nettoyage** : indentation `traite_le` uniformisée dans tous les `upsertFichier`

---

## v0.27.0 — 31 mars 2026

### Entretiens / Suivi Candidat — Rappels & Dark Mode

- **Page Entretiens redessinée** : vue liste de cartes (suppression du calendrier)
- **Candidat** : sélection depuis le système OU saisie manuelle du nom
- **Entreprise** : liée à la base clients avec recherche, ou saisie libre
- **Poste** : champ texte libre, non lié aux commandes
- **Supprimé** : durée, type (visio/tel/présentiel), lien visio, intervieweur, statut, lien offre
- **Rappels** : sélecteur de date de rappel sur chaque suivi
- **Rappels** : popup de notification en bas à droite à l'ouverture de l'app
- **Rappels** : badge rouge sur l'onglet "Entretiens / Suivi" dans la sidebar
- **Sidebar** : onglet renommé "Entretiens / Suivi" + onglet Planning supprimé
- **Notes candidat** : routes API dédiées (`/api/notes`), auteur = prénom de l'utilisateur connecté
- **SMS** : nettoyage du numéro avant génération du lien `sms:` (fix espaces +41 79 xxx)
- **Dark mode** : corrections dans Paramètres, Profil, Logs, Doublons, Intégrations, Documents, UploadCV

---

## v0.25.4 — 29 mars 2026

### France Travail — Formulaire Word + Envoi

- **Format Word fidèle à l'original** : titres soulignés, format `LABEL : valeur`, cases à cocher ☑/☐ pour CDI/CDD, débutant/expérience, temps plein/partiel
- **Envoi via Resend** : fonctionne sans configuration SMTP — utilise la clé Resend déjà en place
- **CC automatique** à `info@l-agence.ch` en plus de `andre.bonier@pole-emploi.fr`
- **2 postes toujours fixés**, salaire jamais rempli (conforme au workflow L-Agence)
- **Historique des envois** : liste dépliable avec date, heure, poste et lieu pour chaque envoi

---

## v0.25.3 — 29 mars 2026

### Fixes mobiles & Cross-device

- **Double hamburger supprimé** : le bouton flottant du shell ne s'affichait plus sur `/candidats/[id]` en doublon avec celui du TopBar
- **TopBar responsive** : nom et société masqués sur mobile, seul l'avatar reste visible — plus de débordement
- **Poignée resize masquée** : la barre jaune de redimensionnement n'est plus visible sur mobile
- **Panel Documents pleine largeur** : s'ouvre en `100vw` sur smartphone (plus de coupure à gauche)
- **Badge âge masqué** sur la liste candidats sur mobile
- **Non-vus cross-device** : "Tout marquer vu" sur desktop synchronise maintenant le badge sur smartphone (via Supabase user metadata)
- **OTP grace 4h** : si connexion dans les 4 dernières heures, pas de code email demandé (cookie httpOnly signé HMAC-SHA256)

---

## v0.25.1 — 29 mars 2026

### Mobile — Responsive & Photo photothèque

- **Fiche candidat responsive** : layout 3 colonnes → 1 colonne sur smartphone, pas de scroll horizontal
- **Viewer CV masqué sur mobile** : caché automatiquement sous 768px
- **Bouton photo toujours visible** : accès à la photothèque ou à l'appareil photo sans passer en mode édition
- **Support HEIC/HEIF** : format natif iPhone correctement reconnu dans le sélecteur de fichier
- **Meta viewport** : correction du rendu mobile (width=device-width manquant)
- **Boutons photo agrandis (36×36)** pour le touch sur mobile
- **Bouton Ré-analyser IA** : icône seule sur petit écran, pas de débordement
- **Header fiche candidat** : wrap automatique des boutons sur petit écran

---

## v0.25.0 — 28 mars 2026

### Planning — Refonte majeure

- **Modal candidat redesigne** : overlay avec avatar/initiales, recherche instantanee a l'ouverture
- **Candidats hors systeme** : ajout par nom libre ("Utiliser [nom] hors systeme") avec metier modifiable directement dans le tableau
- **Periode par ligne** : date de debut et fin (semaine/annee) + option "Sans fin", calcul automatique de duree (ex : ⏱ 1 an 2 mois — en cours)
- **Navigation semaine** : boutons ◀ ▶ + bouton "Aujourd'hui"
- **ETP par semaine** : ETP et compteur candidats actifs refletent toujours la semaine selectionnee
- **Liste toujours complete** : tous les candidats restent visibles peu importe la semaine — seules les stats changent
- **Marge horaire (CHF/h)** : nouveau champ par ligne, moyenne affichee dans la barre de stats
- **Tri des colonnes** : tri alphabetique par candidat, entreprise ou metier (indicateurs ▲▼)
- **Autocomplete entreprise corrige** : la recherche dans les clients fonctionnait pas (mauvais champ)
- **Suppression onglet "Sans travail"**
- **Correction perte de donnees** : le filtre serveur par semaine causait la disparition de certains candidats — remplace par filtrage client-side

### Import CV & SharePoint

- **Detection diplomes/certificats** : si le fichier contient un nom mais aucun signal CV (experiences, competences, coordonnees, titre), l'import est bloque avec message explicite

### Analyse IA — Age

- **Extraction d'age corrigee** : l'IA retourne desormais l'age au format "35ans" (avec le mot "ans") — un chiffre seul n'est plus interprete comme un age
- **calcAge() mis a jour** : accepte "35ans" et "35 ans", ignore les chiffres isoles

---

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
