// TalentFlow Version Configuration
// Convention: MAJOR.MINOR.PATCH (semver)
//
// Le CHANGELOG in-app est volontairement condensé par PHASES (1 entrée par thème majeur),
// pas par patch. Les détails ligne-à-ligne vivent dans CHANGELOG.md (racine du repo).

export const APP_VERSION = '2.13.35'
export const APP_ENV: 'beta' | 'production' = 'production'
export const APP_NAME = 'TalentFlow'

export interface ChangelogEntry {
  version: string
  date: string
  label?: string
  features: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.13.31',
    date: '2026-06-25',
    label: 'Date de naissance + suivi de l’app + notification d’anniversaire',
    features: [
      'Profil candidat : saisie de la date de naissance si manquante (une seule fois) + rappel sur l’accueil',
      'Outils → Suivi de l’app : qui a créé son compte, qui se connecte, dernière connexion, notifications activées, actifs/inactifs',
      'Notification automatique « Joyeux anniversaire » le jour J (cron quotidien 7 h) aux candidats ayant activé les notifications',
    ],
  },
  {
    version: '2.13.29',
    date: '2026-06-25',
    label: 'Page de téléchargement : design soigné avec les badges officiels App Store / Google Play',
    features: [
      'Page /telecharger refaite : logo en pastille, badges officiels Apple et Google, mise en page propre',
    ],
  },
  {
    version: '2.13.28',
    date: '2026-06-25',
    label: 'Téléchargement de l’app : lien intelligent iOS/Android + bouton sur set-password, bandeau et WhatsApp',
    features: [
      'Nouvelle page talent-flow.ch/telecharger : détecte le téléphone et propose le bon store (App Store / Google Play)',
      'Après création du mot de passe : bouton « 📲 Télécharger l’application » (candidats)',
      'Portail : le bandeau « app bientôt » devient « application disponible — Télécharger »',
      'Onglet Rapports : bouton « WhatsApp app » (message tutoyé signé João avec le lien de téléchargement) — le « WhatsApp lien » heures reste',
    ],
  },
  {
    version: '2.13.27',
    date: '2026-06-25',
    label: 'App candidat : fix modale « Ajouter un document » (bouton Envoyer caché derrière la barre)',
    features: [
      'La fenêtre « Ajouter un document » passe désormais au-dessus de la barre de navigation → le bouton « Envoyer le document » est visible et cliquable',
    ],
  },
  {
    version: '2.13.26',
    date: '2026-06-25',
    label: 'App candidat : ouverture sur l’Accueil · accueil/profil sans mission propres · session ~3 mois',
    features: [
      'L’app s’ouvre désormais sur l’Accueil (tableau de bord) et non plus directement sur la saisie d’un rapport',
      'Accueil et Profil sans mission : message de bienvenue clair au lieu de « Indisponible »',
      'Session candidat prolongée de 30 à 90 jours → beaucoup moins de reconnexions dans l’app',
    ],
  },
  {
    version: '2.13.25',
    date: '2026-06-24',
    label: 'Rapports : suivi de livraison des emails client (livré / rejeté / spam) via webhook Resend',
    features: [
      'Chaque email envoyé est tracé en base (table email_delivery_log) avec son identifiant Resend',
      'Webhook Resend (/api/webhooks/resend) : statut de livraison réel (livré, rejeté, marqué spam)',
      'Fiche d’un lien rapport : carte « Suivi des emails client » avec alerte si un email n’est pas arrivé',
    ],
  },
  {
    version: '2.13.24',
    date: '2026-06-24',
    label: 'Rapports : fix semaines décalées dans le portail candidat après changement de mission',
    features: [
      'Quand une mission est liée à un candidat (auto ou manuel), les dates de l’entreprise se synchronisent → le portail propose les bonnes semaines (fini le « il ne voit que les anciennes semaines »)',
    ],
  },
  {
    version: '2.13.23',
    date: '2026-06-24',
    label: 'Qualité du français : accents corrigés sur plusieurs pages (Intégrations, Activité, Doublons, Offres, Analyse)',
    features: [
      '~120 corrections d’orthographe : accents manquants sur les pages Intégrations, Activité, Doublons, Offres et Analyse des candidats',
      'Cloche : « À REPLACER » corrigé en « À REMPLACER »',
      'Anglicismes : « sync » → « synchro » · unités « MB/KB » → « Mo/Ko » dans les écrans Signatures',
      'Accès : les secrétaires (Filipa, Cristina) voient désormais l’onglet Rapports pour consulter et télécharger les rapports',
    ],
  },
  {
    version: '2.13.22',
    date: '2026-06-24',
    label: 'Rapports : menu ⋮ plus coupé en bas + tri par colonnes · CV : Expériences avant Formations',
    features: [
      'Liste des rapports : le menu ⋮ (actions) s’ouvre vers le haut quand la ligne est en bas d’écran → il n’est plus coupé',
      'Liste des rapports : colonnes Candidat / Client / Dernière cliquables pour trier (A→Z, Z→A)',
      'Personnaliser le CV : les Expériences s’affichent maintenant avant les Formations',
    ],
  },
  {
    version: '2.13.21',
    date: '2026-06-24',
    label: 'Rapports : déliement auto à la fin de mission + statut basé sur les missions du candidat',
    features: [
      'Liste des rapports : le statut (entreprise / « Fin de mission » / « Sans mission ») se base sur les missions réelles du candidat → reste juste même après déliement',
      'Page d’un lien : quand la mission liée est terminée, elle se délie automatiquement → le bouton « Lier une mission » réapparaît pour la mission suivante',
      'Titres des 25 rapports existants nettoyés (« Rapport {Candidat} » sans entreprise)',
    ],
  },
  {
    version: '2.13.20',
    date: '2026-06-24',
    label: 'Rapports : lien par candidat indépendant de la mission (titre sans entreprise · statut mission dans la liste)',
    features: [
      'Nouveau lien rapport : le titre ne contient plus le nom de l’entreprise (« Rapport Martial David ») → le lien reste valable quand le candidat change de mission',
      'Liste des rapports : la colonne Client affiche l’état réel de la mission liée — entreprise si active, « Fin de mission » (orange) si terminée, « Sans mission » si aucune',
      'Rappel : un lien sans mission affiche déjà le bouton « 🔗 Lier une mission » → on relie à la nouvelle mission sans recréer de lien',
    ],
  },
  {
    version: '2.13.19',
    date: '2026-06-24',
    label: 'Import OneDrive : fix CV silencieusement collé à un mauvais candidat (anti-race trop large)',
    features: [
      'Import CV : le filet « anti-doublon simultané » ne rattache plus un nouveau CV à un ancien candidat homonyme (fenêtre limitée à 10 min = vraie création simultanée) — fini les CV perdus collés au mauvais profil',
      'Import CV : le rattachement par nom exige désormais un nom réellement similaire (garde-fou aligné sur les chemins email et téléphone)',
      'Liste candidats : recherche un peu moins gourmande (anti-rebond 300 ms)',
    ],
  },
  {
    version: '2.13.18',
    date: '2026-06-22',
    label: 'Envois : modale destinataires portalisée (plus coupée) · libellé lieu · contact rapport avec nom',
    features: [
      'Modale « Choisir les destinataires » : en-tête et bas toujours visibles, plus de coupure sur petit écran (createPortal + 90dvh)',
      'Recherche du lieu : on n’affiche plus le district (« Monthey ») à côté de la localité',
      'Lien rapport (mode portail) : le champ « Nom du contact » s’affiche → le contact n’est plus enregistré « sans nom »',
    ],
  },
  {
    version: '2.13.17',
    date: '2026-06-22',
    label: 'Fix import CV (faux match nom de fichier) · recherche clients par distance · portail rapports',
    features: [
      'Import CV : un nom de fichier générique (« CV 2025.pdf », « scan.pdf »…) ne réactive plus par erreur un autre candidat — matching par contenu uniquement',
      'Envois : recherche clients par distance basée sur les coordonnées GPS en base (des centaines d’entreprises retrouvées au lieu de quelques-unes) + distance routière',
      'Rapports : email client pré-rempli avec le dernier email utilisé pour l’entreprise + texte du portail clarifié',
    ],
  },
  {
    version: '2.12.0',
    date: '2026-06-18',
    label: 'Missions : durée rapide + projection ETP + alertes cloche · pack bugs (matching, aperçu docs, portail, mailing)',
    features: [
      'Missions : boutons +14 jours / +3 mois (date de fin auto depuis la date de début)',
      'Missions : projection « ETP semaine prochaine » sur la carte ETP actif',
      'Cloche (João) : alertes Fins de mission (à venir + déjà passées) + badge « À replacer » + Rapports manquants',
      'Matching IA : pastille de score ne chevauche plus les barres Comp./Exp.',
      'Signatures : aperçu (œil) affiche les documents au lieu de les télécharger',
      'Portail client : affiche « Mission du … au … » pour un candidat dont la mission est terminée',
      'Mailing : autocomplete client fonctionne aussi pour le 2e destinataire',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.10.30 — Sign : rôle « Consultant » (João/Seb) + nom candidat dans l'email
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.10.30',
    date: '2026-06-06',
    label: 'Contrats : choix du consultant (João/Seb) + nom du candidat dans l’email signé',
    features: [
      'Quand un rôle du template s’appelle « Consultant », on choisit João ou Seb à l’envoi → coordonnées remplies + sa signature apposée automatiquement (pas d’email au consultant). Idéal pour les secrétaires.',
      'Garde-fou : si le consultant n’a pas encore enregistré sa signature (Paramètres → Mon profil), l’envoi est bloqué avec un message clair.',
      'Email du contrat signé : le titre et le corps affichent le NOM DU CANDIDAT (identifié par son rôle), même si le consultant signe en premier. Fini le mauvais nom dans le sujet.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.10.29 — Modal in-app : ne se ferme plus tout seul au tap de la notif
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.10.29',
    date: '2026-06-03',
    label: 'Modal in-app : reste affiché au tap de la notification (fermeture via croix/bouton)',
    features: [
      'Le modal ne se ferme plus quand on tape à côté (le tap d’ouverture depuis la notif le fermait par erreur → on ne voyait que les confettis).',
      'Croix de fermeture ajoutée ; l’animation se lance après l’affichage du modal.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.10.28 — Modal in-app : s'affiche même app déjà ouverte / au tap de la notif
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.10.28',
    date: '2026-06-03',
    label: 'Modal in-app : apparaît même si le candidat est déjà dans l’app ou tape la notification',
    features: [
      'Le modal se vérifie en continu (toutes les 25 s) tant que l’app est ouverte → le candidat ne le rate plus.',
      'Taper la notification (l’app reprend) affiche désormais le modal (re-vérification au retour au premier plan).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.10.27 — Modal in-app : animation synchronisée avec l'affichage
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.10.27',
    date: '2026-06-03',
    label: 'Modal in-app : confettis synchronisés avec l’apparition du modal',
    features: [
      'L’animation (confetti, cœurs…) se lance désormais en même temps que le modal (préchargement de canvas-confetti).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.10.26 — Notifications : modal animé in-app + bibliothèque d'images
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.10.26',
    date: '2026-06-03',
    label: 'Notifications TalentFlow Sign : modal animé in-app + bibliothèque d’images',
    features: [
      'Option « Afficher aussi dans l’app » : le candidat voit un modal centré (titre + texte + image) à l’ouverture.',
      'Animations festives au choix : confetti 🎉, cœurs ❤️, feux d’artifice 🎆, neige ❄️, étoiles ⭐.',
      'Bibliothèque d’images réutilisables : on charge une image une fois, on la réutilise ensuite.',
      'Images auto-redimensionnées + compressées pour garantir l’affichage sur iOS et Android.',
      'Le modal in-app fonctionne même si le candidat n’a pas d’appareil push enregistré.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.10.25 — Notifications push : image jointe (iOS + Android)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.10.25',
    date: '2026-06-03',
    label: 'Notifications TalentFlow Sign : image dans la notification',
    features: [
      'Page Notifications : ajout d’une image optionnelle à la notification (upload + aperçu).',
      'L’image s’affiche dans la notification sur iOS et Android (bannière + centre de notifications).',
      'Idéal pour les messages festifs (anniversaire, Noël, Pâques, Nouvel An).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.10.24 — Notifications déplacé dans Outils (« Notifications TalentFlow Sign »)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.10.24',
    date: '2026-06-03',
    label: 'Notifications : déplacé dans Outils, renommé « Notifications TalentFlow Sign »',
    features: [
      'UI — L\'onglet « Notifications » est retiré de la sidebar et déplacé dans Outils → carte « Notifications TalentFlow Sign » (jaune, icône cloche). Titre de la page renommé en conséquence.',
      'FICHE CANDIDAT — 2e numéro de téléphone (colonne telephone_2) : certains candidats ont un numéro suisse + un FR/PT/autre. Éditable et affiché sur la fiche (sous le numéro principal). N\'apparaît PAS sur la liste candidats (seul le principal y reste).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.10.23 — Push : bannière heads-up Android + page Notifications au design v2
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.10.23',
    date: '2026-06-03',
    label: 'Push : notification en bannière pop-up (Android) + page Notifications alignée au design',
    features: [
      'PUSH — Canal Android « importance haute » (tf_default) + message FCM avec channel_id → la notif s\'affiche en BANNIÈRE pop-up (heads-up), plus seulement dans le centre. iOS : son par défaut.',
      'UI — Page Notifications remise au design v2 (classe d-page + titre serif d-page-title, cohérent avec Rapports/Signatures).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.10.22 — Push : enregistrement auto du token lié au candidat (C2)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.10.22',
    date: '2026-06-03',
    label: 'Push : enregistrement auto de l\'appareil + page « Notifications » (envoi aux candidats)',
    features: [
      'NOTIFICATIONS PUSH (C2) — L\'app native ajoute son token FCM à l\'URL du portail au clic (?pt=&plat=). Composant PushRegister (layouts /report et /client-portal) lit le token, l\'enregistre via /api/push/register, et le lie au compte connecté (candidat → candidate_id via le lien rapport). Nettoyage de l\'URL.',
      'NOTIFICATIONS PUSH (C1) — Nouvelle page « Notifications » (sidebar) : liste les candidats ayant un appareil enregistré, sélection multiple + recherche, saisie titre/message, bouton Envoyer → POST /api/push/send (cible les tokens des candidats choisis, purge les tokens morts). Endpoint /api/push/recipients pour la liste.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.10.21 — Backend notifications push (Firebase Cloud Messaging)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.10.21',
    date: '2026-06-03',
    label: 'Backend push : envoi de notifications depuis le serveur (FCM) + table push_tokens + endpoints',
    features: [
      'NOTIFICATIONS PUSH (backend) — Helper d\'envoi FCM HTTP v1 (lib/push/fcm.ts) signé via jose (clé FIREBASE_SERVICE_ACCOUNT, pas de dépendance firebase-admin). Table push_tokens (Supabase, RLS service-role) : token + plateforme + lien compte portail. Endpoint POST /api/push/register (lie le token au compte candidat/client connecté). Endpoint POST /api/push/test (consultant, envoie une notif de test à un token ou à tous). Purge auto des tokens morts. Fondation pour les notifs automatiques (candidat signe, rapport à valider…). App native : enregistrement push + token (repo talentflow-sign-app).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.10.20 — FIX wizard : tél conjoint ne se pré-remplit plus avec le tél candidat
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.10.20',
    date: '2026-06-03',
    label: 'Fix Sign : le wizard respecte le décochage « pré-remplir tél candidat » (Mode Document)',
    features: [
      'FIX SIGN — Dans le wizard, tout champ « téléphone » (autoFillSource=phone) se pré-remplissait avec le numéro du candidat, même si « Pré-remplir avec le téléphone du candidat » était DÉCOCHÉ en Mode Document (ex. « Tél. portable du conjoint »). Désormais le pré-remplissage de la VALEUR utilise isCandidatePhoneField (respecte le flag autoFillCandidatePhone) ; le FORMAT clavier tel reste sur looksLikePhoneField. La détection « champ rempli » suit la même règle. SignWizard.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.10.19 — Politique de confidentialité publique (/confidentialite)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.10.19',
    date: '2026-06-03',
    label: 'Page publique « Politique de confidentialité » (obligatoire App Store / Google Play, conforme nLPD/RGPD)',
    features: [
      'Nouvelle page publique /confidentialite : politique de confidentialité L-Agence (web + app TalentFlow Sign). Couvre données collectées (identité, documents, mission, signature, caméra/GPS/Face ID/push), finalités, bases légales, partage, hébergement UE (Irlande), durée, sécurité, droits nLPD/RGPD, contact. Requise pour la publication sur les stores. À faire relire par un conseiller en protection des données.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.10.18 — Rapports : blocage saisie d'heures hors période de mission
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.10.18',
    date: '2026-06-02',
    label: 'Rapports : impossible de saisir des heures hors de la période de mission (avant le début / après la fin)',
    features: [
      'FIX RAPPORTS — Un candidat pouvait saisir/soumettre des heures pour des semaines après la fin (ou avant le début) de sa mission. Correctif à 3 niveaux : (1) Serveur — refuse une semaine entièrement hors de [mission_start_date, mission_end_date]. (2) Pointeuse — jours hors mission grisés « 🔒 Hors période de mission » + non exigés à la validation (bornes propagées contextData → StepContent → GroupedFields → FieldRow, helper sectionLockReason). (3) Semaine par défaut — l\'auto-correction repositionne sur la dernière semaine valide DANS la mission au lieu de la semaine courante. La semaine qui CONTIENT la date de fin reste autorisée (jours après la fin grisés). Actif uniquement si l\'entreprise a des dates de mission. [reprise branche claude/talentflow-portal-link-duration]',
      'SIGN — « Email de réception du récap final » par défaut = info@l-agence.ch (avant : vide → repli sur le créateur). DEFAULT_OPTIONS.recapEmail.',
      'FIX SIGN APERÇU — Sur la page enveloppe, cliquer « aperçu » (œil) sur une pièce jointe PDF la téléchargeait + aperçu blanc : la route /uploads?path= servait toujours en Content-Disposition: attachment. Ajout de ?preview=1 → inline → le PDF s\'affiche dans le modal. Bouton œil mis à jour.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.10.17 — FIX : nouveau rapport repart à l'étape 1 (plus à la dernière)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.10.17',
    date: '2026-06-02',
    label: 'Fix : un nouveau rapport repart à l\'étape 1 (avant : reprenait la dernière étape de la semaine précédente)',
    features: [
      'FIX RAPPORTS — Après avoir signé/validé un rapport, en cliquant « Nouveau rapport » sur une autre semaine, le wizard s\'ouvrait à la DERNIÈRE étape au lieu de l\'étape 1. Cause : la mémorisation de l\'étape (sessionStorage) utilisait seulement le token (identique d\'une semaine à l\'autre). Désormais la clé est scopée par semaine (weekStartDate) + remontage propre du wizard par semaine/entreprise (key). Le toggle Wizard↔Document dans la même semaine continue de restaurer l\'étape.',
      'FIX SIGNATURE MODE SOMBRE — Sur Android (Chrome Auto Dark Theme) et iOS, le mode sombre assombrissait le fond blanc de la zone de signature alors que le trait (dessiné sur canvas) restait foncé → signature au doigt invisible. Ajout de color-scheme: light sur la zone de signature + le portail rapport (conçu en clair uniquement) → fond reste blanc, trait bien visible.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.10.16 — Portail candidat : annonce « application à venir » + remerciement
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.10.16',
    date: '2026-06-02',
    label: 'Portail candidat : bandeau « application TalentFlow à venir » + remerciement',
    features: [
      'Bandeau d\'annonce en haut du portail candidat (/report) : « 📱 Bientôt : l\'application TalentFlow ! Une application à télécharger est en cours de développement… Merci de votre confiance 🙏 ». Refermable et mémorisé (localStorage) — ne réapparaît plus une fois fermé par le collaborateur. Composant AppComingSoonBanner.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.10.15 — Champs de connexion 16px (plus de zoom auto iOS au focus)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.10.15',
    date: '2026-06-02',
    label: 'Connexion portail : champs en 16px → plus de zoom automatique iOS au focus',
    features: [
      'FIX UX — Les champs de connexion (portails candidat/client) faisaient 15px, ce qui déclenchait le zoom automatique d\'iOS au focus (gênant dans l\'app native et sur mobile). Passés à 16px (seuil iOS) : plus de zoom intempestif. inputStyle (AuthLayout).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.10.14 — FIX email de validation client (mode portail) → bon destinataire
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.10.14',
    date: '2026-06-02',
    label: 'Fix : l\'email de validation va au client défini sur le lien (RH), plus à l\'adresse interne L-Agence',
    features: [
      'FIX RAPPORTS (mode portail) — Quand le candidat signait, l\'email de validation partait vers clients.email (adresse principale de l\'entreprise en DB, souvent un placeholder type info@l-agence.ch) au lieu de l\'email du client saisi sur le lien (« Entreprises autorisées », ex: rh@groupe-bader.ch). Désormais on priorise l\'email du client défini sur le lien (report_link_clients.client_email), avec fallback sur clients.email si absent. L\'URL reste le portail permanent. Texte explicatif mis à jour.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.10.13 — Retrait du bandeau « Installer l'application » (app native dispo)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.10.13',
    date: '2026-06-02',
    label: 'Portail rapport : bandeau « Installer l\'application » retiré (app native TalentFlow Sign)',
    features: [
      'Le bandeau PWA « Installe l\'application » du portail rapport candidat est retiré (débranché du layout /report). L\'app native TalentFlow Sign prend le relais ; le web reste pour les missions ponctuelles. Composant PwaInstallPrompt conservé mais non monté.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.10.12 — Pièces jointes HEIC iPhone → JPEG (lisibles Windows + assemblées)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.10.12',
    date: '2026-06-02',
    label: 'Pièces jointes HEIC (iPhone) converties en JPEG : lisibles sur Windows + assemblées recto/verso',
    features: [
      'FIX PIÈCES JOINTES — Les photos iPhone en HEIC (carte bancaire, etc.) arrivaient par email en fichiers bruts illisibles sur Windows et non assemblées recto/verso. Désormais converties en JPEG côté serveur (heic-convert) avant l\'assemblage → 1 PDF propre par champ, lisible partout. Helpers isHeic + convertHeicToJpeg (lib/sign/compose-attachment-pdf.ts), branchés dans processCandidateUploads (finalize). Secours : si la conversion échoue, le fichier d\'origine reste joint. heic-convert + libheif-js externalisés (serverExternalPackages).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.10.11 — Signature rognée à l'encre (ne paraît plus minuscule)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.10.11',
    date: '2026-06-02',
    label: 'Signature : rognée au tracé réel avant export (remplit la case au lieu de paraître minuscule)',
    features: [
      'FIX SIGNATURE — SignaturePad exportait tout le canvas (souvent large) avec beaucoup de transparent autour du tracé → une fois « contenue » dans la case du PDF, la signature paraissait minuscule. Nouveau helper trimToInk : rogne la bounding box des pixels réellement tracés (+ petite marge) avant toDataURL. La signature remplit désormais correctement la case sur tous les documents. Travaille en pixels physiques (échelle DPR). Fallback canvas entier si rien à rogner.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.10.10 — Pauses pointeuse expliquées + garde-fous + page de connexion portail
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.10.10',
    date: '2026-06-01',
    label: 'Pauses pointeuse plus claires (heure début/fin) + garde-fous + « enregistrez votre page de connexion »',
    features: [
      'POINTEUSE — Pauses : libellé « De … à … », durée affichée sous chaque pause, et récap du calcul en clair (Fin − Début − pause = total) pour que le candidat voie ce qu\'il signe. Consigne explicite : on veut l\'HEURE de la pause (ex. de 12:00 à 13:00), pas la durée — le client l\'exige.',
      'POINTEUSE — Garde-fous (pointageWarnings) : avertissement si une pause est incomplète (heure de début OU de fin manquante → non déduite), si les pauses dépassent le temps travaillé, ou si le total tombe à 0 h. Helpers purs pauseMinutes / pointageWarnings dans lib/sign/pointage.ts.',
      'GUIDE — Encadré « ☕ Comment noter une pause ? » dans le guide Timbreuse (heure début/fin obligatoire).',
      'PORTAIL — Après la création du mot de passe (client ou candidat), encadré « Enregistrez votre page de connexion » : le lien d\'invitation ne marche qu\'une fois → affiche l\'URL de login permanente + bouton Copier, à mettre en favori / écran d\'accueil.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.10.9 — Guide candidat adaptatif (timbreuse vs total d'heures)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.10.9',
    date: '2026-06-01',
    label: 'Guide « Comment remplir ? » adapté au template du candidat',
    features: [
      'GUIDE ADAPTATIF — Le bouton « Comment remplir ? » du portail rapport affichait toujours le guide Timbreuse LIVE, même pour les candidats sur un template simple (total d\'heures par jour, sans Début/Fin/pauses). Désormais la page détecte si le template contient un champ « pointage » (hasTimbreuse) : version Timbreuse LIVE (Démarrer ma journée → Pause/Reprendre → Terminer + encadré GPS) si oui, sinon version « total d\'heures » (inscris ton total du jour + déplacement + n° chantier + repas, jour non travaillé = vide). HelpGuideModal prend un prop hasTimbreuse.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.10.8 — Bouton « Retour au portail » après validation client
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.10.8',
    date: '2026-06-01',
    label: 'Bouton « Retour au portail » sur l\'écran de confirmation après validation',
    features: [
      'FIX — Après validation d\'un rapport depuis le portail client, l\'écran « Rapport signé » n\'avait pas de bouton retour. Ajout de « ← Retour au portail » (si on arrive du portail via ?back= ou en mode portail) → le client revient à son onglet Rapports sans rester bloqué.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.10.7 — Portail client : absence en cours (vacances/arrêt) du collaborateur
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.10.7',
    date: '2026-06-01',
    label: 'Portail client : affiche l\'absence en cours (vacances / arrêt) du collaborateur',
    features: [
      'PORTAIL — Quand un collaborateur est en vacances / arrêt / absence (noté sur sa mission), le client le voit désormais sur sa carte : badge « 🏖️ En vacances jusqu\'au JJ.MM.AAAA » (bleu), « 🤕 En arrêt… » (rouge) ou « 🚫 Absent… » (orange). Calculé si aujourd\'hui tombe dans une période d\'absence (priorité arrêt > vacances > absence). API portail enrichie (vacances/arrets/absences au select).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.10.6 — Timbreuse LIVE : « Démarrer ma journée » uniquement aujourd'hui
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.10.6',
    date: '2026-06-01',
    label: 'Timbreuse LIVE : « Démarrer ma journée » seulement pour le jour présent',
    features: [
      'CHRONO LIVE — Le bouton « Démarrer ma journée » (et le chrono) ne s\'affiche QUE pour aujourd\'hui (on ne démarre pas en direct un jour déjà passé). Les jours passés gardent tous les champs de saisie manuelle (Début/Fin/pauses/zone) → le candidat complète à la main, sans risque d\'erreur. Les jours futurs restent verrouillés (v2.10.4).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.10.5 — Guide d'aide candidat corrigé (contenu + bouton)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.10.5',
    date: '2026-06-01',
    label: 'Guide d\'aide candidat : contenu corrigé + bouton WhatsApp',
    features: [
      'GUIDE CORRIGÉ — Étape « Crée ton compte » retirée (déjà fait à l\'entrée du portail). « Ouvre ton rapport » → lien PERMANENT / installer l\'app (plus de « lien par semaine »). « Saisis tes heures » → décrit la Timbreuse LIVE (plus de bouton « Maintenant »). Encadré GPS reformulé (démarrage/fin).',
      'BOUTON & PIED — Le bouton d\'aide passe de « Aide » (doublon) à « 📖 Guide » / « Comment remplir ? » (responsive, ne casse pas l\'affichage). Pied du guide : bouton vert « 📱 Besoin d\'aide ? WhatsApp » → ouvre la conversation WhatsApp L-Agence.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.10.4 — Pointeuse : blocage de la saisie d'un jour futur
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.10.4',
    date: '2026-06-01',
    label: 'Pointeuse : impossible de saisir un jour à venir (futur bloqué)',
    features: [
      'JOUR FUTUR BLOQUÉ — Le candidat peut saisir aujourd\'hui et les jours passés de la semaine, mais PAS les jours à venir. Un jour futur affiche « 🔒 Jour à venir — disponible le JJ.MM.AAAA » (bouton « Démarrer ma journée » + saisie désactivés). Les autres champs du jour (Zone, Repas) sont masqués et non exigés à la validation. La date du jour est calculée depuis la section (Lundi/Mardi…) + la semaine sélectionnée.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.10.3 — Timbreuse LIVE : masque les boutons « Maintenant » (doublon)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.10.3',
    date: '2026-06-01',
    label: 'Timbreuse LIVE : cache les boutons « Maintenant » (doublon avec le chrono)',
    features: [
      'TIMBREUSE LIVE — Quand l\'option « Timbreuse LIVE » est activée, les boutons « Maintenant » à côté de Début/Fin sont masqués (le chrono Démarrer/Terminer fait déjà la même chose). Le champ heure reste pour corriger à la main. Si l\'option n\'est PAS activée, les boutons « Maintenant » restent affichés comme avant. Texte GPS adapté (« au démarrage / à la fin »).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.10.2 — Jour absent masque Zone/Repas + (v2.10.1) aperçu éditeur
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.10.2',
    date: '2026-06-01',
    label: 'Jour « Absent / Congé » masque les autres champs (Zone, Repas) + fix aperçu',
    features: [
      'JOUR ABSENT — Quand le candidat met un jour en « Absent / Congé », les autres champs de ce jour (Zone de travail, Repas…) sont désormais MASQUÉS dans le wizard (ils n\'ont plus de sens). La validation n\'exige plus ces champs masqués. Seule la pointeuse (avec la bascule + le motif) reste affichée.',
      'FIX APERÇU (v2.10.1 inclus) — L\'aperçu live de l\'éditeur reflète maintenant immédiatement les flags Timbreuse LIVE / GPS / annexe seulement (ajout au hash de rafraîchissement).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.10.1 — Fix : l'aperçu éditeur reflète les flags pointeuse (LIVE/GPS/annexe)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.10.1',
    date: '2026-06-01',
    label: 'Fix : l\'aperçu live de l\'éditeur reflète Timbreuse LIVE / GPS / annexe seulement',
    features: [
      'FIX — Cocher « Timbreuse LIVE (chrono) » (ou « GPS » / « annexe seulement ») ne mettait pas à jour l\'aperçu live de l\'éditeur : le hash de rafraîchissement de WizardPreview ne tenait pas compte de ces flags. Ajout de liveTimer/captureGps/excludeFromPdf/timbrageButton/wizardHidden au hash → l\'aperçu se met à jour immédiatement.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.10.0 — Aide in-app + Timbreuse LIVE + Validations groupées
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.10.0',
    date: '2026-06-01',
    label: 'Guide d\'aide in-app + Timbreuse LIVE (chrono) + validations groupées portail',
    features: [
      'AIDE IN-APP — Bouton « Comment ça marche ? » (« Aide » sur mobile) dans l\'en-tête du portail rapport → modal guide branded (compte → rapport → heures → signer), version HTML du PDF candidat. + Guide PDF « whaou » avec captures annotées (Bureau).',
      'TIMBREUSE LIVE — Option « Timbreuse LIVE (chrono) » sur les champs pointeuse (éditeur). Le candidat clique « Démarrer ma journée » → le chrono tourne en direct → Pause / Reprendre → Terminer (GPS au démarrage/fin). Écrit dans la même valeur pointage ; saisie manuelle conservée.',
      'VALIDATIONS GROUPÉES — Sur le portail client : bouton « Valider plusieurs rapports » → coche les rapports à valider → barre « Valider la sélection (N) » → une seule signature appliquée à tous (réutilise la signature électronique existante). Token rafraîchi automatiquement si besoin.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.99 — Jour pointeuse renseigné à 0h → « 0 » stampé (cohérence)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.99',
    date: '2026-06-01',
    label: 'Pointeuse : un jour renseigné qui donne 0h affiche « 0 » sur le rapport',
    features: [
      'COHÉRENCE — Un jour de pointeuse RENSEIGNÉ (Début + Fin) dont le calcul donne 0h affiche désormais « 0 » dans la case du rapport PDF (avant : case vide). Aligné avec la page client + l\'annexe qui montraient déjà « 0 h ». Un jour NON rempli reste vide ; le TOTAL et les absences affichent toujours « 0 ».',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.98 — Fix : le client peut corriger les pointeuses (panneau éditable)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.98',
    date: '2026-06-01',
    label: 'Fix : le client peut corriger les heures pointeuse (panneau éditable)',
    features: [
      'FIX — Quand le client cliquait « Modifier les heures », il ne pouvait PAS corriger les pointeuses (type `pointage` absent de CLIENT_EDITABLE_TYPES → rendues read-only). Le panneau « Détail des pointages » devient désormais ÉDITABLE en mode correction : widget pointeuse par jour (Début/pauses/Fin/Absent) + zone de travail, écrits dans les corrections client. Panneau défilable (maxHeight) pour ne pas pousser la grille.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.97 — Champ « annexe seulement » + couleurs rôles Document↔Wizard
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.97',
    date: '2026-05-30',
    label: 'Champ « afficher seulement dans l\'annexe » + couleurs rôles cohérentes Document/Wizard',
    features: [
      'ANNEXE SEULEMENT — Nouvelle case « Afficher seulement dans l\'annexe (ne pas imprimer sur le rapport) » sur les champs Zone de travail / pointeuse / heure (éditeur Document + Wizard). Coché (flag excludeFromPdf) : le champ est rempli dans le wizard et apparaît dans l\'annexe « Détail des pointages » page 2, mais n\'est PAS tamponné sur la grille du rapport brut. Idéal pour la Zone de travail.',
      'COULEURS RÔLES — Incohérence corrigée : le Mode Wizard colorait les rôles avec (order−1) alors que le Mode Document utilisait order (+ colorIdx). Un même rôle (candidat/client) apparaissait dans 2 couleurs différentes selon le mode. Les deux modes utilisent désormais getRecipientPalette (colorIdx ?? order) → couleurs identiques partout.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.96 — « Envoyer au responsable » → WhatsApp direct + GPS sans (±m)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.96',
    date: '2026-05-30',
    label: '« Envoyer au responsable » ouvre WhatsApp direct + adresse GPS sans précision (±m)',
    features: [
      'ENVOYER AU RESPONSABLE → WHATSAPP — Le bouton ouvrait le menu de partage natif (AirDrop/Messages…). Il ouvre désormais WhatsApp directement (wa.me, choix du contact) avec un message tutoyé, simple et direct + le lien de validation : « Salut, peux-tu valider les heures de … (semaine N) ? Ouvre le lien, vérifie et signe en bas : … ».',
      'GPS SANS (±m) — La précision « (±12 m) » est retirée de l\'adresse partout (widget pointeuse + annexe PDF + détail). On affiche juste l\'adresse (ex. « Route de Brin 4A, 1870 Monthey »).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.95 — Portail client : total heures pointeuse + infos mission en-tête
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.95',
    date: '2026-05-30',
    label: 'Portail client : total heures (pointeuse) + métier/début de mission dans l\'en-tête',
    features: [
      'TOTAL HEURES — Les rapports à base de pointeuse affichaient « — » sous la semaine (le total ne lisait que les champs « number »). sumSubmissionMetrics additionne désormais les heures pointeuse (Fin−Début−pauses) dans les heures normales → ex. « 18.08h normales ».',
      'EN-TÊTE CANDIDAT — Sous le nom du collaborateur : métier + « En mission depuis le JJ.MM.AAAA » (date de début de la mission liée). Pour un candidat sans mission liée (cas de test), ces infos restent vides — normal.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.94 — Portail client : ton formel + bouton retour + « responsable »
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.94',
    date: '2026-05-30',
    label: 'Portail client : ton formel, bouton Retour, « Envoyer au responsable »',
    features: [
      'TON FORMEL — Le banner « À valider » du portail client passe au « vous » (« Ouvrez, vérifiez les heures, puis validez… »). Le gros chiffre rouge devient une pastille horloge ambre, plus discrète.',
      'ENVOYER AU RESPONSABLE — Le bouton « Envoyer au chef » devient « Envoyer au responsable ». Annotation page de validation : « transmettre au responsable concerné (responsable de secteur ou responsable du collaborateur) ».',
      'BOUTON RETOUR — Quand le client ouvre un rapport depuis le portail, un bouton « ← Portail » apparaît dans l\'en-tête pour revenir au portail sans valider (via ?back=, même pour les liens non-portail).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.93 — Portail client : onglet Rapports ACTIVÉ (était « Bientôt »)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.93',
    date: '2026-05-30',
    label: 'Portail client : onglet Rapports activé (validation des heures)',
    features: [
      'PORTAIL RAPPORTS ACTIVÉ — L\'onglet « Rapports » du portail client affichait « Bientôt disponible » (placeholder posé en v2.8.8). Il est désormais ACTIF : le client voit ses rapports à valider (banner + cartes), peut ouvrir/valider/transférer au chef, et consulter/télécharger les rapports validés. Badge rouge = nombre de rapports en attente sur l\'onglet.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.92 — Aperçu de lien WhatsApp (image OG L-Agence) + WhatsApp invitation portail
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.92',
    date: '2026-05-30',
    label: 'Aperçu de lien WhatsApp branded L-Agence + envoi WhatsApp invitation portail',
    features: [
      'APERÇU DE LIEN (WhatsApp/iMessage) — Nouvelle image Open Graph 1200×630 brandée L-Agence (au lieu de l\'image 76×76 cassée qui affichait un aperçu moche/Vercel). Appliquée à TOUS les liens publics : rapport, signature, portail client (les 2 derniers n\'avaient aucune image OG).',
      'WHATSAPP INVITATION PORTAIL — Bouton « WhatsApp » sur les invitations portail client (à côté de « Copier lien ») → ouvre wa.me avec le lien d\'accès pré-rempli. Complète les boutons WhatsApp déjà présents (lien rapport, lien client, lien signataire enveloppe, « Envoyer au chef »).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.91 — Portail client Rapports Phase 1 : Zone de travail + écran « À valider »
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.91',
    date: '2026-05-30',
    label: 'Portail client Rapports — Zone de travail + écran « À valider » plus clair',
    features: [
      'ZONE DE TRAVAIL — Nouveau type de champ « Zone de travail » (texte) posable sur le template rapport, rempli par le candidat. Par jour (1 par section) ou pour la semaine (sans section jour). Affichée dans le rapport PDF, l\'annexe « Détail des pointages » et le détail timbrages côté client/portail.',
      'PORTAIL « À VALIDER » — Banner d\'appel à l\'action en haut du portail client : « X rapports à valider » (clic → filtre). Le client voit immédiatement combien de rapports l\'attendent.',
      'ENVOYER AU CHEF — Bouton « Envoyer au chef » sur chaque rapport à valider : partage le lien de validation (WhatsApp / presse-papier) pour qu\'un collègue (chef de secteur) ouvre, vérifie et signe.',
      'APERÇU PDF iOS (portail) — Le modal d\'aperçu du portail client utilise désormais pdf.js (canvas) au lieu d\'un iframe → aperçu fiable sur iPhone.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.90 — Rapports : email réception interne à la création + aperçu PDF iOS
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.90',
    date: '2026-05-30',
    label: 'Rapports : email de réception interne à la création + aperçu PDF fiable iOS',
    features: [
      'EMAIL INTERNE — Nouveau champ « Email réception interne (L-Agence) » sur le formulaire Nouveau lien rapport (défaut info@l-agence.ch). Détermine qui reçoit la copie signée côté agence (au lieu du créateur du lien). Modifiable ensuite via la carte dédiée.',
      'APERÇU PDF iOS — Le modal d\'aperçu rapport (portail candidat) utilisait un iframe → iOS Safari déclenchait un téléchargement au lieu d\'afficher. Remplacé par un rendu pdf.js (canvas) : aperçu fiable sur iPhone, Android et desktop. Bouton « Télécharger » conservé pour récupérer le fichier.',
      'ANNEXE — Le détail des pointages libelle désormais chaque jour par son nom (Lundi, Mardi…) au lieu du libellé du champ.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.89 — Pointeuse : adresse GPS + détail côté client + cert non emailé
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.89',
    date: '2026-05-30',
    label: 'Pointeuse : adresse GPS lisible + détail côté client + certificat non envoyé par mail',
    features: [
      'GPS → ADRESSE — Au timbrage, la position est résolue en adresse lisible (rue + localité, ex. « Avenue de l\'Europe, 1870 Monthey ») au lieu de coordonnées brutes. Affichée dans le widget, l\'annexe « Détail des pointages » et le récap client. Proxy serveur /api/geocode/reverse (Nominatim).',
      'DÉTAIL CÔTÉ CLIENT — Nouveau panneau « 🕓 Détail des pointages » (repliable) sur la page de signature client : par jour, Début/pauses/Fin + total + adresse GPS. Le client valide les heures en connaissance de cause (avant l\'annexe page 2 du PDF).',
      'CERTIFICAT — N\'est plus envoyé en pièce jointe par email au consultant. Il reste stocké et téléchargeable sur la page Envois (bouton « Certificat ») — décision João.',
      'Rappel : le client reçoit le rapport signé par email (si email + canal configurés) et accède à tous ses rapports validés via le portail client (Aperçu + Télécharger, annexe incluse).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.88 — Pointeuse : copier un jour + bouton Absent/Congé
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.88',
    date: '2026-05-29',
    label: 'Pointeuse : copier les heures d\'un jour + bouton Absent / Congé',
    features: [
      'NOUVEAU — « Copier ces heures vers… » sous chaque pointeuse remplie : copie Début/pauses/Fin (sans le GPS) vers un autre jour de la semaine en 1 clic. Saisie beaucoup plus rapide.',
      'NOUVEAU — Bascule « Présent / Absent » par jour. En absence : motif Vacances / Jour férié / Autre (texte libre). Le rapport affiche 0h ; le motif n\'apparaît QUE dans le certificat de pointage annexe. Motif laissé vide → rapport affiche simplement 0.',
      'Le total semaine exclut automatiquement les jours d\'absence (0h).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.87 — Fix pointeuse : « Object » côté client + aperçu PDF candidat
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.87',
    date: '2026-05-29',
    label: 'Fix pointeuse : heures visibles côté client + aperçu rapport candidat',
    features: [
      'FIX critique — Côté client à signer, la ligne « Heures normales » affichait « Object Object… » au lieu des heures. Le total pointeuse (Début/pauses/Fin) s\'affiche désormais correctement dans chaque case (ex. 9, 7.08).',
      'FIX — Bouton « Aperçu » du portail candidat ouvrait un téléchargement au lieu d\'afficher le PDF. Ajout de ?inline=1 → le rapport s\'affiche désormais dans le navigateur (iPhone inclus), téléchargement possible ensuite.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.86 — Fix : « Utiliser » sur un template Rapport ouvre le bon écran
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.86',
    date: '2026-05-29',
    label: 'Fix : « Utiliser » sur un template Rapport → page Nouveau lien rapport',
    features: [
      'FIX — « Utiliser » sur un template de type Rapport ouvre désormais « Nouveau lien rapport » (/sign/rapports/new) avec le template pré-sélectionné, au lieu de la page d\'envoi signature (/sign/new). Les templates d\'enveloppe gardent leur comportement.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.85 — Templates rapport : dupliquer une section entière (jour) en 1 clic
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.85',
    date: '2026-05-29',
    label: 'Templates : dupliquer une section entière (ex. Lundi → Mardi) en 1 clic',
    features: [
      'DUPLIQUER UNE SECTION — Dans « Gérer les sections » (Mode Wizard), un bouton ⧉ duplique TOUTE une section et ses champs vers une nouvelle section nommée. Idéal pour les rapports jour par jour : « Lundi » (date + pointeuse) → « Mardi » en 1 clic (le nom de section pilote aussi la date auto du jour). Beaucoup plus rapide que dupliquer champ par champ.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.84 — Fix : pointeuses sélectionnables comme sources de formule (Total semaine)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.84',
    date: '2026-05-29',
    label: 'Fix : pointeuses sélectionnables dans une formule (Total semaine)',
    features: [
      'FIX — Les champs « Pointeuse » apparaissent désormais dans la liste des sources d\'une formule. Le « Total semaine » se fait via Formule → Somme → sources = les pointeuses des jours (la Somme additionne le total d\'heures de chaque pointeuse).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.83 — Pointeuse : la case posée sur le tableau affiche le total calculé
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.83',
    date: '2026-05-29',
    label: 'Pointeuse : la case posée sur le rapport affiche directement le total d\'heures',
    features: [
      'POINTEUSE → TOTAL DANS LA CELLULE — Quand on pose une pointeuse sur une cellule du rapport (ex. « Heures normales / Lundi »), le PDF y affiche directement le TOTAL calculé (Fin − Début − pauses). Plus besoin d\'un champ formule séparé par jour : 1 pointeuse par jour, posée sur la bonne case, et le total apparaît. Le détail (début/pauses/fin/GPS) reste sur la page annexe.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.82 — Rapports : Pointeuse (timbrage GPS) + email destinataire + annotation WhatsApp
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.82',
    date: '2026-05-29',
    label: 'Rapports : Pointeuse (timbrage GPS), email destinataire modifiable, annotation client WhatsApp',
    features: [
      'POINTEUSE (TIMBRAGE) — Nouveau type de champ « Pointeuse » pour les templates rapport : le candidat saisit Début / Fin (modifiable à la main OU bouton « Maintenant »), ajoute autant de pauses qu\'il veut (début/fin), et le TOTAL d\'heures se calcule automatiquement. GPS capturé au Début et à la Fin (preuve de présence). Remplissable à tout moment (le candidat peut tout saisir en fin de semaine). Opt-in : n\'apparaît que sur les templates où on l\'ajoute, zéro impact sur l\'existant.',
      'CRÉATION DE CHAMP EN MODE WIZARD — On peut désormais créer un nouveau champ directement dans l\'éditeur Wizard (avant : seulement assigner des champs déjà placés en Mode Document). Indispensable pour bâtir un formulaire 100% wizard.',
      'PAGE ANNEXE « DÉTAIL DES POINTAGES » — Le PDF du rapport garde le tableau propre (total par jour) + une page annexe liste chaque jour : Début, pauses, Fin, GPS, total, + total semaine. Auditable.',
      'EMAIL DESTINATAIRE INTERNE MODIFIABLE — Sur chaque fiche de lien rapport, on peut désormais changer l\'email L-Agence qui reçoit le rapport finalisé (avant : toujours le créateur du lien). Modifiable même sur les liens déjà existants. NULL = créateur (comportement historique).',
      'ANNOTATION WHATSAPP CÔTÉ CLIENT — Sur la page de validation client, un encadré explique que le bouton WhatsApp sert à transférer le rapport à un collègue de l\'entreprise (ex. chef de secteur) pour validation — pour signer, c\'est en bas de page. Évite la confusion.',
      'Champ « Heure (HH:MM) » + opérateur de formule « Heures travaillées » également disponibles (briques réutilisables).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.81 — Notes Clients (fiche, lecture seule) + fix chargement notes portail
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.81',
    date: '2026-05-29',
    label: 'Fiche candidat : section « Notes Clients » + fix notes portail bloquées',
    features: [
      'NOTES CLIENTS (FICHE, LECTURE SEULE) — Nouveau bouton « Notes Clients » sur la fiche candidat : affiche en lecture seule les notes échangées avec le client via le portail, chacune avec le NOM DE L\'ENTREPRISE et la DATE. Complète la séparation v2.9.78 (le bouton « Notes » reste 100% interne ; les notes client, postées sur le portail, sont désormais consultables ici).',
      'FIX NOTES PORTAIL BLOQUÉES SUR « CHARGEMENT… » — Le modal de notes partagées (portail client + fiche) bouclait à l\'infini car la prop onCountChange (fonction inline) recréait le fetch à chaque render. Stabilisé via une ref → le chargement se termine correctement.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.80 — Portails : copier le lien d'invitation (pour WhatsApp)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.80',
    date: '2026-05-29',
    label: 'Portails clients : copier le lien d\'invitation (envoi WhatsApp)',
    features: [
      'COPIER LE LIEN D\'INVITATION — Dans la gestion des accès portail (Missions → Portails clients, et lien rapport), un bouton « Copier lien » à côté de « Renvoyer » copie le lien d\'invitation (création de mot de passe) que le client reçoit par email → pratique pour l\'envoyer par WhatsApp.',
      'Réutilise le token d\'invitation valide existant (ne casse pas le lien déjà envoyé par email) ; en génère un nouveau seulement si aucun n\'est encore valable. N\'envoie PAS d\'email. Nouvelle route POST /api/admin/portal-accounts/[id]/invitation-link.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.79 — Rapports : changer le template d'un lien existant
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.79',
    date: '2026-05-29',
    label: 'Rapports : changer le template d\'un lien rapport existant',
    features: [
      'CHANGER LE TEMPLATE D\'UN LIEN RAPPORT — Sur la fiche d\'un lien rapport (/sign/rapports/[id]), nouvelle card « Template du rapport » avec bouton Modifier → sélection d\'un autre template de rapport. Permet d\'avoir des rapports différents par entreprise (ex. un modèle dédié) sans recréer le lien.',
      'NON-DESTRUCTIF — Les soumissions déjà signées/validées conservent leur template d\'origine ; seuls les PROCHAINS rapports utilisent le nouveau modèle (le flux public charge dynamiquement link.template_id à l\'ouverture).',
      'Route PATCH /api/admin/reports/[id] accepte désormais template_id (validation : le template doit exister et être de type « report »).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.78 — Pack correctifs UX : notes candidat, badges, photo, envois, mail, divers
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.78',
    date: '2026-05-29',
    label: 'Pack de 13 correctifs UX (notes, badges, photo, historique envois, mail, modaux)',
    features: [
      'NOTES CANDIDAT UNIFIÉES — La fiche candidat n\'a plus qu\'UN seul bouton Notes (badge gris cohérent avec Documents, au lieu du badge bleu) lié aux notes internes équipe (notes_candidat) : modifiables, supprimables, et affichées au survol comme dans la liste candidats. Le 2e bouton bulle redondant a été retiré. Les notes partagées avec le client ont été retirées de la fiche (elles vivent dans le portail client).',
      'PANNEAU INFORMATIONS — Le panneau latéral « Informations » de la fiche candidat ne reste plus collé en haut : il s\'ouvre désormais en plein écran à droite (portalisé sur document.body, comme les autres modaux).',
      'BOUTONS PHOTO REPENSÉS — Les boutons d\'action de la photo (changer / crop / rotation / supprimer) sont maintenant à L\'INTÉRIEUR de la photo en bas et n\'apparaissent qu\'au survol. La photo est agrandie (140px) et alignée à gauche (toolbar latérale supprimée → fiche plus aérée).',
      '« TOUT MARQUER VU » SILENCIEUX — Plus de clignotement : le bouton ne recharge plus toute la liste (suppression du refetch React Query). Mise à jour instantanée et silencieuse.',
      'BADGES ROUGE ⟺ COLORÉ COHÉRENTS — La pastille colorée (Nouveau/Actualisé/Réactivé) apparaît désormais EXACTEMENT quand le point rouge apparaît, et disparaît avec lui (ouverture de fiche + « Tout marquer vu »). Le badge vert « Nouveau » s\'affiche enfin pour les candidats récemment créés.',
      'MODALE WHATSAPP EN MASSE — La fenêtre d\'envoi WhatsApp groupé depuis la liste candidats n\'est plus coupée/collée en haut : portalisée et correctement centrée.',
      'HISTORIQUE DES ENVOIS — Affiche le NOM du destinataire (candidat résolu par téléphone/email, ou entreprise + personne de contact pour les emails) au lieu du numéro/email brut. Le MÉTIER ciblé par la campagne est extrait du message et affiché (chip liste + badge panneau). Pills candidat cliquables (fiche) avec aperçu CV au survol, et bouton « Voir tous » → liste complète des destinataires + métier.',
      'NOTE RAPPORT AU SURVOL — L\'icône 📝 dans l\'historique des soumissions de rapports affiche maintenant un vrai tooltip lisible au survol (note candidat + note client), au lieu de l\'info-bulle native illisible.',
      'BOUTON MAIL PLUS ROBUSTE — Si aucune application mail par défaut n\'est configurée (cas rencontré), l\'adresse est copiée automatiquement et un message explique comment définir une app mail par défaut sur Windows et Mac.',
      'CONTACT CLIENT VIA LIEN RAPPORT — Correction : ajouter un contact à un client existant depuis « créer un lien rapport » enregistre désormais correctement la personne (nom/prénom/téléphone/fonction) dans la fiche client. Avant, les champs étaient mal nommés → le contact apparaissait sans nom.',
      'CV ORIGINAL WORD — Dans « Personnaliser le CV », l\'aperçu du CV original d\'un fichier Word (.doc/.docx) s\'affiche correctement via le viewer Office, au lieu de l\'erreur « Échec de chargement du document PDF ».',
      'CROIX MODALE DOUBLON — La croix de fermeture de la modale « candidat potentiellement en doublon » (import manuel) est de nouveau visible en mode clair (était grise sur fond clair).',
      'PUBLICATION JOB-ROOM — Identifiants Job-Room (SECO) configurés → la publication d\'une commande sur job-room.ch fonctionne (l\'erreur HTTP 400 venait des identifiants de test).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.77 — TalentFlow Mobile : modules Sign détail/new + Missions + Rapports
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.77',
    date: '2026-05-27',
    label: 'TalentFlow Mobile : Sign détail/new + Missions + Rapports',
    features: [
      'SIGN DÉTAIL MOBILE — /m/sign/[id] affiche qui a signé / qui manque (avatars CheckCircle/Clock + signed_at), avec boutons Relance (renvoie email aux non-signés), Envoyer (si brouillon), Annuler, lien vers fiche candidat. Chronologie complète (créée/envoyée/signée/expire).',
      'ENVOI RAPIDE MOBILE — /m/sign/new permet d\'envoyer un document à signer depuis le smartphone en 2 étapes : choix template existant → saisie destinataires (nom/email/tel, pré-remplis si on vient de la fiche candidat) → Créer + Envoyer en 1 tap. L\'éditeur de champs reste sur desktop.',
      'MISSIONS MOBILE — /m/missions affiche les missions par statut (en cours / terminées / toutes) sous forme de cards avec photo candidat, client + canton, métier, dates, marge brute, accès rapide candidat + rapport.',
      'RAPPORTS HEBDO MOBILE — /m/rapports liste les liens rapport (active / paused / revoked) avec recherche, lien candidat ouvert dans nouvel onglet (`/report/[slug]`) + accès soumissions.',
      'ZÉRO RÉGRESSION DESKTOP — Toutes les routes desktop existantes inchangées. Section mobile dédiée n\'impacte que le rendering quand pathname commence par /m/.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.76 — Administration : Carte ID checkbox + propagation dates fin mission + fondation mobile /m
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.76',
    date: '2026-05-27',
    label: 'Administration : checkbox Carte ID + propagation dates fin mission Excel',
    features: [
      'CARTE ID DANS DOCUMENTS REÇUS — Ajout de la checkbox « Carte ID » dans la zone documents reçus de la fiche candidat (même pattern que AVS/IBAN : true → "oui", false → "" sur le champ TEXT carte_id). Ajoutée aussi dans les filtres avancés (has_carte_id : tous/oui/non).',
      'PROPAGATION DATES FIN MISSION — Lors du merge Excel v2.9.74, la colonne « Mission terminée » de l\'Excel a été stockée dans mission_terminee (date) mais l\'UI utilise is_mission_terminee (bool) + date_fin_mission. Hotfix DB : UPDATE 173 candidats pour propager les dates → ils apparaissent maintenant comme « 🏁 Mission terminée » avec leur date de fin dans l\'UI.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.75 — Hotfix logs_secretariat (user null silent depuis v2.7.5)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.75',
    date: '2026-05-27',
    label: 'Administration : fix logs_secretariat — toutes les modifications sont à nouveau tracées',
    features: [
      'BUG IDENTIFIÉ — Depuis v2.7.5 (12/05), aucune modification n\'était enregistrée dans logs_secretariat (16 jours d\'historique perdu) à cause d\'un supabase.auth.getUser() qui retournait null après l\'UPDATE → if(!user) return silencieux.',
      'FIX — User récupéré explicitement en début de handler (après requireSecretariatAccess et createClient) puis transmis à logSecretariat. Fallback à getUser conservé pour rétrocompatibilité. Warning console si toujours null pour faciliter futur debug.',
      'PORTÉE — 5 routes API patchées (candidats, accidents, alfa, alfa-paiements, loyers), PATCH + DELETE.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.74 — Administration : mode de paiement + notification J-2 versement + merge Excel
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.74',
    date: '2026-05-27',
    label: 'Administration : 3 modes de paiement + rappel email J-2 du versement + merge Excel 2026',
    features: [
      'MODE DE PAIEMENT CANDIDAT — Nouveau champ mode_paiement (3 choix : Calendrier mensuel décalé rouge / Mensuel vert / Hebdomadaire bleu). Dropdown sur fiche candidat secrétariat + badge couleur dans tableau quand mission active.',
      'PAGE CALENDRIER PAIEMENTS — /secretariat/paiements/calendrier affiche les 3 calendriers 2026 (79 dates seed : 14 mensuel décalé + 12 mensuel + 53 hebdomadaires). Badge ● PROCHAIN sur la prochaine date par mode. Stats candidats actifs par mode.',
      'CRON EMAIL J-2 — Nouvelle route /api/cron/paiement-rappel-heures tournant chaque jour à 7h UTC (9h CEST). Envoie 1 email par candidat actif avec mode défini, 2 jours avant son paiement. Dédup via secretariat_paiement_notifs_log.',
      'TEMPLATE EMAIL L-AGENCE — Logo officiel + badge couleur mode + bouton WhatsApp pré-rempli (vert) ouvrant la conversation avec +41 76 297 97 95 + texte personnalisé selon la période. Sender L-Agence SA <noreply@talent-flow.ch>, reply-to info@l-agence.ch.',
      'MERGE EXCEL 2026 — 766 opérations DB sans erreur : secretariat_accidents (12 UPDATE), secretariat_candidats (351 UPDATE + 118 INSERT → 548 total), secretariat_alfa (180 UPDATE + 14 INSERT → 194), secretariat_alfa_paiements (74 UPDATE + 15 INSERT → 91), secretariat_loyers (2 UPDATE). Politique safe : jamais d\'écrasement par valeur Excel vide.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.73 — Sign : aide visuelle dans éditeur WizardEditor + preview admin
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.73',
    date: '2026-05-26',
    label: 'Sign : panneau « Aide visuelle » désormais aussi dans l\'éditeur Mode Wizard + bouton visible en preview admin',
    features: [
      'PANNEAU AIDE VISUELLE EN MODE WIZARD — En v2.9.72, le panneau n\'était disponible que dans Mode Document (SelectedFieldsPanel). Désormais visible aussi dans le panneau d\'édition d\'un champ en Mode Wizard (FieldEditor). FieldHelpAttachmentEditor extrait en composant standalone réutilisé par les 2 éditeurs.',
      'BOUTON ℹ️ VISIBLE EN APERÇU LIVE — Avant : `if (!token) return null` masquait le bouton dans l\'aperçu mobile de l\'éditeur (pas de token côté admin). Désormais : bouton affiché en mode preview, clic = alert info « Aperçu admin — disponible côté candidat ». Côté wizard candidat (token valide), comportement identique à v2.9.72.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.72 — Sign : aide visuelle par champ (bouton ℹ️ dans le wizard)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.72',
    date: '2026-05-26',
    label: 'Sign : aide visuelle par champ — PDF/image attaché à un champ, bouton « ℹ️ Voir infos » dans le wizard candidat',
    features: [
      'NOUVELLE OPTION ÉDITEUR — Sur n\'importe quel type de champ (case, texte, date, etc.), nouveau panneau « 💡 Aide visuelle » dans l\'éditeur de template : charge un PDF ou image (max 10 MB) + personnalise le texte du bouton (défaut « Voir infos », ou écris « Cliquez ici », « Voici comment », etc.). Stockage Supabase `talentflow-sign/templates/{tplId}/help/`.',
      'BOUTON ℹ️ DANS LE WIZARD — Quand un champ a une aide visuelle, un bouton jaune « ℹ️ Voir infos » apparaît à droite du label du champ dans le wizard candidat. Clic → ouvre le modal preview portalisé (PDF iframe / image zoom 1-5× / Imprimer / Télécharger).',
      'COMPOSANT PARTAGÉ — FilePreviewModal extrait de /sign/[envelopeId]/page.tsx vers components/sign/FilePreviewModal.tsx pour réutilisation (page enveloppe + wizard).',
      'ROUTE PUBLIQUE — /api/sign/document/[token] étendue pour servir les helpAttachments (vérif token + appartenance au template). Pas de stamp envelope ID sur les fichiers d\'aide (servis tels quels).',
      'NOUVELLE ROUTE ADMIN — POST /api/sign/templates/[id]/help-upload (PDF + JPEG/PNG/WebP, 10 MB max).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.71 — Sign : fix modal preview (createPortal)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.71',
    date: '2026-05-26',
    label: 'Sign : fix modal aperçu (👁) qui ne couvrait pas tout l\'écran',
    features: [
      'Le modal preview ajouté en v2.9.70 était rendu directement dans le composant parent au lieu d\'être portalisé. Un ancêtre avec `transform`/`filter` cassait `position: fixed` (pattern #10) → le backdrop restait limité à la largeur de son conteneur. Désormais : `createPortal(modal, document.body)` → couvre tout l\'écran, scroll bloqué, clic hors zone ferme.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.70 — Sign : route /sign/rapports/templates/[id]/edit + modal sections + œil preview + recto-verso 1 PDF + lien fiche candidat
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.70',
    date: '2026-05-26',
    label: 'Sign : édition template Rapport vraiment isolée + modal Sections gère les champs + bouton « 👁 Aperçu » + recto+verso en 1 PDF dans l\'enveloppe + lien fiche candidat',
    features: [
      'ROUTE /sign/rapports/templates/[id]/edit — Avant : éditer un template Rapport ouvrait /sign/templates/[id]/edit → sidebar allumait « Signatures », retour pointait vers Templates Signatures. Désormais : édition d\'un template Rapport route dédiée, sidebar allume « Rapports », bouton retour pointe vers « Templates Rapports ». Detection auto via usePathname.',
      'MODAL « GÉRER LES SECTIONS » DÉPLIABLE — Quand une section est dépliée dans le modal, sa liste de champs apparaît avec : badge type, label, case « Obligatoire », flèches monter/descendre, bouton supprimer. Gestion complète sans fermer le modal.',
      'BOUTON « 👁 APERÇU » — Sur chaque pièce jointe candidat ET chaque document signé de la page enveloppe : nouveau bouton œil qui ouvre un modal de preview portalisé (PDF iframe / image avec zoom 1×-5× / texte fallback). Boutons Imprimer (ouvre nouvel onglet) + Télécharger + Échap pour fermer.',
      'RECTO + VERSO ASSEMBLÉS EN 1 PDF DANS L\'ENVELOPPE — Quand un champ pièce jointe contient ≥ 2 images, nouveaux boutons « Aperçu 1 PDF (recto + verso) » + « Télécharger 1 PDF » sous le groupe. Utilise la même composition que l\'email récap final (lib/sign/compose-attachment-pdf.ts), nouvelle route /api/sign/envelopes/[id]/uploads?composed=fieldId.',
      'LIEN FICHE CANDIDAT — Quand l\'enveloppe est liée à un candidat (envelope.candidate_id), le nom du destinataire candidat (1er signataire non-créateur) devient cliquable et ouvre directement /candidats/[id]. Le créateur (consultant) reste non-cliquable.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.69 — Sign : bouton « Regrouper par section » + fix badge AUTO + uploads null guard
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.69',
    date: '2026-05-26',
    label: 'Sign : bouton « Regrouper par section » dans l\'éditeur Wizard + fix badge AUTO-SIGNÉ + uploads route robuste',
    features: [
      'BOUTON « 🔀 REGROUPER PAR SECTION » — Dans l\'éditeur Wizard d\'un step contenant des sections (template rapport d\'heures), nouveau bouton qui réordonne step.fieldIds pour rendre tous les champs d\'une même section contigus. Évite la lecture chaotique « Lundi-Heures, Lundi-Repas, Jeudi-Repas, Mardi-Repas, Mercredi-Repas, … » héritée d\'imports DocuSign ou éditions désordonnées. Sections triées par 1ère apparition, fields stables au sein de chaque section, sans-section en queue.',
      'BADGE « AUTO-SIGNÉ » FIX — Le badge orange ajouté en v2.9.67 ne s\'affichait jamais car la route GET /tokens ne sélectionnait pas signature_method dans son SELECT SQL → côté client t.signature_method était toujours undefined. Désormais : colonne ajoutée au SELECT.',
      'UPLOADS ROUTE ROBUSTE — Route /api/sign/envelopes/[id]/uploads renvoyait 500 « Cannot read properties of null » quand documents JSONB contenait des entrées NULL (debris d\'édition). Filtre .filter(d => d != null) + Array.isArray(d.fields) ajoutés pour immuniser contre futurs nulls.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.68 — Sign : fix 500 /uploads (docs null) + badge Auto-signé visible
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.68',
    date: '2026-05-26',
    label: 'Fix : sections dupliquées wizard + install prompt desktop + crash retour arrière',
    features: [
      'SECTIONS DUPLIQUÉES — Dans l\'éditeur Wizard, les sections (Lundi, Mardi…) apparaissaient plusieurs fois et ne se dépliaient pas. Cause : l\'algorithme « run-length » recréait un header à chaque changement de section, donc si les champs n\'étaient pas triés par section dans step.fieldIds, chaque section apparaissait autant de fois qu\'elle avait de blocs discontinus. Fix : remplacement par un Set seenSections → chaque header s\'affiche exactement une fois.',
      'INSTALL PROMPT SUR DESKTOP — Le bandeau « Installer TalentFlow » apparaissait sur Chrome desktop car beforeinstallprompt se déclenche aussi sur desktop quand le manifeste est installable. Ajout du guard isMobileDevice() (innerWidth ≤ 768 ou UA mobile) → bandeau visible uniquement sur mobile.',
      'CRASH AU RETOUR ARRIÈRE — La page /sign/templates crashait avec « Cannot read properties of null (reading fields) » après un retour depuis l\'éditeur. Cause : certains templates avaient des entrées null dans leur tableau documents JSONB. Le .reduce() sur d.fields plantait sur ces null. Fix : .filter(Boolean) sur documents avant toute itération.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.67 — Sign : 4 bugs + 4 features (tél, erreurs lisibles, titre email, filename, Auto-signé, rôles)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.67',
    date: '2026-05-26',
    label: 'Sign : tél candidat ne déborde plus + erreurs lisibles + titre email avec nom candidat + filename UTF-8 préservé + badge Auto-signé + rôles destinataires',
    features: [
      'TÉL CANDIDAT — Les 2 champs téléphone du template « Documents à signer » avec flag NULL ont été migrés en DB (urgence → false, portable → true). La case dans l\'éditeur écrit désormais explicitement true OU false (plus de NULL). Plus de débordement sur les champs tiers (urgence, conjoint, parent).',
      'MESSAGES D\'ERREUR LISIBLES — « Groupe 11 » devient « Méthodes de paiement du salaire » (groupName auto-généré remplacé par wizardSection en DB + fallback intelligent côté code). Les fields obligatoires affichent « Section — Tooltip : à remplir pour continuer » au lieu d\'un message tronqué. Plus de jargon technique pour le candidat.',
      'BOUTON « RAPPORTS » RETIRÉ de la page Signatures (redondant : Rapports est maintenant un onglet sidebar distinct).',
      'TITRE EMAIL RÉCAP — Au lieu de « Documents à signer — Documents signés », le sujet devient « Flavian Casaubon — Documents signés + pièces jointes ». Lookup candidat lié en DB (fallback : 1er destinataire non-créateur).',
      'FILENAME PJ — « Carte d\'identité ou passport » s\'affichait « Carte d identit ou p... » dans Outlook (l\'apostrophe et l\'accent strippés par une regex \\w trop stricte). Désormais : normalisation NFC + strip uniquement des caractères vraiment interdits (/ \\ : * ? " < > |). UTF-8 préservé partout.',
      'BADGE « AUTO-SIGNÉ » à côté de « Signé » sur la liste destinataires de l\'enveloppe : indique visuellement que la signature a été apposée automatiquement depuis la signature pré-enregistrée du template (signature_method = \'auto\').',
      'RÔLES DESTINATAIRES — La liste /sign affiche désormais « À : João Barbosa (Consultant), Flavian Casaubon (Candidat) » au lieu de juste les noms. Permet d\'identifier les rôles d\'un coup d\'œil.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.66 — Templates Rapports : route dédiée /sign/rapports/templates
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.66',
    date: '2026-05-26',
    label: 'Templates Rapports déplacés sur leur propre route /sign/rapports/templates (séparation complète Signatures / Rapports)',
    features: [
      'ROUTES DISTINCTES — Avant : /sign/templates?kind=report (querystring) faisait quand même tomber la sidebar sur l\'onglet Signatures. Désormais : /sign/templates (Signatures) et /sign/rapports/templates (Rapports) sont 2 routes complètement séparées qui partagent le même composant interne.',
      'SIDEBAR PROPRE — La règle `startsWith /sign/rapports` allume désormais TOUJOURS le bon onglet pour toutes les sous-pages de Rapports (templates, [id], new, submissions).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.65 — Sidebar : Rapports vraiment distinct de Signatures (plus de chevauchement)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.65',
    date: '2026-05-26',
    label: 'Sidebar : Rapports et Signatures vraiment séparés (plus de double-highlight ni de bouton retour Signatures)',
    features: [
      'SIDEBAR FIX — Cliquer sur « Rapports » allumait aussi « Signatures » (la règle `startsWith /sign` matchait `/sign/rapports`). Désormais : `/sign` ne s\'allume PAS sur `/sign/rapports/*`, et la page `/sign/templates?kind=report` allume « Rapports », pas « Signatures ».',
      'BOUTON RETOUR RETIRÉ — La page Rapports affichait un bouton « ← Signatures » en haut, suggérant qu\'elle était un sous-module. Retiré : Rapports est une section top-level distincte.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.64 — Sidebar : Rapports séparé de Signatures + Templates filtrés par kind
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.64',
    date: '2026-05-26',
    label: 'Sidebar : onglet Rapports distinct de Signatures + page Templates filtrée par kind (signatures vs rapports)',
    features: [
      'NOUVEL ONGLET « RAPPORTS » dans la sidebar (icône ClipboardList), distinct de « Signatures ». Les 2 modules sont désormais clairement séparés visuellement.',
      'TEMPLATES FILTRÉS — La page /sign/templates accepte un paramètre `?kind=report` qui filtre la liste pour n\'afficher QUE les templates de rapports (et inversement, sans param = templates de signatures, les rapports exclus). Le titre, le compteur et le bouton retour s\'adaptent.',
      'Le bouton « Templates » de /sign/rapports pointe désormais vers /sign/templates?kind=report → vue dédiée. Bouton « Templates » de /sign reste sur la vue signatures.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.63 — Sign : safePdfText étendu au stamp + bouton « Modifier signature » + labels checkbox propres + logs Bug B
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.63',
    date: '2026-05-26',
    label: 'Sign : normalisation texte étendue au stamp des champs + bouton « Modifier ma signature » réparé + labels checkbox propres',
    features: [
      'NORMALISATION ÉTENDUE — La normalisation des accents UTF-8 NFD (v2.9.62) couvrait le certificat mais pas le stamping des champs eux-mêmes. Désormais étendue à tout le pipeline (cert + stamp des valeurs saisies par le candidat). Garantie : aucune saisie utilisateur (accent, smart quote, emoji, char exotique copié-collé) ne peut faire planter le PDF final.',
      'MODIFIER MA SIGNATURE RÉPARÉ — Le bouton « Modifier ma signature » du wizard (et le clic sur une zone signature déjà signée en mode Document) ne faisait rien depuis v2.9.57 (garde anti-réouverture trop stricte). Maintenant : un paramètre `force=true` bypass la garde quand l\'utilisateur clique explicitement.',
      'LABELS CHECKBOX PROPRES — Le groupe « Groupe 1 » est renommé en « Permis de conduire » avec ses 2 cases « Oui » / « Non » (au lieu de « Permis de conduire » / « Case à cocher 1500188d-... »). Le banner d\'erreur est désormais lisible : « Permis de conduire : sélectionne exactement 1 case ».',
      'LOGS DIAG BUG B — Logs ajoutés sur tous les points d\'ouverture du SignaturePad (handleSignatureAdopted, tryOpenSignaturePad, goToNextField). Au prochain test où le pad s\'ouvre 2 fois, la console DevTools du candidat dira exactement quelle voie est responsable.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.62 — Sign : cert fix renforcé (strip combinants orphelins après NFC)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.62',
    date: '2026-05-26',
    label: 'Sign : certificat fix renforcé — strip des accents combinants orphelins',
    features: [
      'Le fix v2.9.61 (normalize NFC) ne suffisait pas pour les combinaisons sans précomposé Unicode (ex : « d » + accent aigu n\'existe pas → l\'accent restait détaché → WinAnsi rejetait toujours). Désormais : tous les accents combinants restants après NFC sont strippés, et un filet de sécurité final remplace tout caractère hors Latin-1 par « ? ». Le certificat se génère désormais pour TOUS les cas.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.61 — Sign : certificat encore en panne (accents UTF-8 NFD) + badges recto/verso + canal WhatsApp retiré
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.61',
    date: '2026-05-26',
    label: 'Sign : certificat de signature généré pour de bon + badges Recto/Verso sur les pièces jointes + section WhatsApp retirée',
    features: [
      'CERTIFICAT — Cause racine du certificat manquant trouvée : certains noms de documents (« Sécurité… ») étaient stockés en UTF-8 NFD (forme décomposée : « e » + accent combinant séparé). pdf-lib StandardFonts utilise WinAnsi qui ne supporte QUE les caractères précomposés → throw silencieux à la génération du certificat. Désormais : helper safePdfText() normalise NFC + remplace les guillemets typographiques, tirets cadratin, etc. Le certificat est désormais généré pour toutes les enveloppes, sur la liste de l\'enveloppe.',
      'BADGES RECTO/VERSO — Sur la section « Pièces jointes chargées par le candidat » : les fichiers d\'un champ configuré en Recto + Verso affichent désormais un badge jaune « RECTO » sur le 1er et « VERSO » sur le 2e. Les champs « Plusieurs fichiers » affichent « FICHIER 1 », « FICHIER 2 », etc.',
      'CANAL D\'ENVOI — La section « Canal d\'envoi » (Email / WhatsApp / Email+WhatsApp) est retirée des Options avancées. L\'envoi par email (Resend) reste la seule option. Pour un partage manuel WhatsApp, utiliser le bouton « WhatsApp » de la page enveloppe (deep link wa.me).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.60 — Sign : certificat absent → bouton « Régénérer » + fallback minimal
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.60',
    date: '2026-05-26',
    label: 'Sign : récupérer le certificat de signature manquant + fallback minimal sans logo',
    features: [
      'BOUTON « RÉGÉNÉRER LE CERTIFICAT » — Quand une enveloppe est complétée mais que le certificat de signature manque (erreur silencieuse à la finalisation), un bandeau jaune apparaît sur la page de l\'enveloppe avec un bouton pour le régénérer manuellement.',
      'FALLBACK SANS LOGO — Si la génération du certificat plante (cause #1 probable : le logo PNG ne se charge pas côté serveur), un second essai est fait sans le logo (juste texte). Évite que le cert ne soit pas généré pour une raison cosmétique.',
      'LOGS ENRICHIS — La cause exacte de l\'échec est désormais loguée (stack trace) au lieu d\'un simple warn. Permet d\'identifier rapidement la racine pour les futures versions.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.59 — Sign : suite v2.9.58 — tél candidat ne déborde plus sur tél urgence/conjoint
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.59',
    date: '2026-05-26',
    label: 'Sign : fix complet — le téléphone du candidat ne s\'affiche QUE sur les champs explicitement cochés (pas sur urgence / conjoint / parent)',
    features: [
      'Le fix v2.9.58 ne couvrait que le useEffect côté client + un endroit serveur. Mais l\'input du champ utilisait encore l\'ancienne logique : tous les champs téléphone affichaient le tél candidat comme valeur par défaut, peu importe le flag « Pré-remplir avec le téléphone du candidat lié ». Désormais : la case à cocher de l\'éditeur contrôle vraiment partout (affichage input, stamping PDF, validation Terminer).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.58 — Sign : « Texte par défaut » du template stampé sur le PDF final
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.58',
    date: '2026-05-26',
    label: 'Sign : 4 fixes UX — defaultValue stampé + checkbox tél candidat + banner d\'erreur listant les bloqueurs + log diag enrichi',
    features: [
      'TEXTE PAR DÉFAUT — Si tu configures un « Texte par défaut » sur un champ dans l\'éditeur template (ex: « CCT », « Monthey le »), cette valeur est désormais pré-remplie côté candidat (modifiable) ET stampée sur le PDF final si le candidat ne la modifie pas. Avant : la valeur n\'était utilisée que comme placeholder gris dans l\'input — jamais sauvegardée ni stampée.',
      'TÉL CANDIDAT EXPLICITE — Nouvelle case à cocher dans l\'éditeur de champ Numéro/Téléphone : « Pré-remplir avec le téléphone du candidat lié à l\'enveloppe ». À cocher UNIQUEMENT sur le champ « Tél portable du candidat » — laisser décochée pour tél urgence / conjoint / parent. Plus fiable que la devinette par mots-clés.',
      'BANNER D\'ERREUR EN MODE DOCUMENT — Quand le bouton Terminer reste grisé en mode Document, un bandeau rouge en haut liste désormais les champs/groupes/signatures qui bloquent (avec le nom du document et la page). Évite à l\'utilisateur de chercher à l\'aveugle.',
      'LOG DIAG ENRICHI — La console du candidat (DevTools) liste maintenant les 3 types de bloqueurs : champs obligatoires vides, signatures manquantes, groupes de checkboxes incomplets (« Choisir Suisse OU Étranger », etc.). Permet d\'identifier instantanément la cause d\'un Terminer grisé.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.57 — Sign : tél pré-rempli ciblé + tooltip flip + pad ne se ré-ouvre plus
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.57',
    date: '2026-05-26',
    label: 'Sign : téléphone candidat ne déborde plus sur les champs urgence/conjoint + info-bulle visible en haut de page + pad signature ne se ré-ouvre plus après signature',
    features: [
      'TÉLÉPHONE CIBLÉ — Le pré-remplissage du téléphone du candidat exclut désormais les champs « tiers » : urgence, conjoint, parent, mère, père, maman, papa, proche, famille, employeur, contact, enfant. Seuls les vrais champs « Tél. portable » / « Numéro de portable » du candidat sont remplis.',
      'INFO-BULLE FLIP — Quand un champ est en haut de page, l\'info-bulle (« Votre numéro de portable », etc.) bascule automatiquement EN BAS au lieu d\'être coupée par le bord supérieur de l\'écran.',
      'PAD SIGNATURE NE SE RÉ-OUVRE PLUS — Après avoir signé et cliqué « Adopter et signer », le pad ne se ré-ouvre plus instantanément (race condition entre adoption + re-render React). Ref synchrone empêche toute réouverture si signature déjà adoptée.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.56 — Sign : impossible d'ouvrir la signature tant que les champs ne sont pas remplis
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.56',
    date: '2026-05-26',
    label: 'Sign : pad signature bloqué tant qu\'un champ obligatoire est vide + auto-fill candidat (métier, téléphone) restauré',
    features: [
      'CRITIQUE — Le métier et le téléphone du candidat lié n\'étaient JAMAIS chargés (la requête SQL pointait vers une colonne inexistante metier_recherche → erreur silencieuse → candidat retourné null). Conséquence : le champ « Tél. portable » de la fiche d\'inscription restait vide, et le titre/fonction n\'était pas pré-rempli. Fix : utiliser le nom correct pipeline_metier (cohérent avec la règle métier).',
      'PAD SIGNATURE — Helper unique tryOpenSignaturePad utilisé partout (4 voies couvertes). Bloque l\'ouverture du pad tant qu\'un champ obligatoire non-signature est vide. Toast d\'erreur explicite + scroll automatique au premier champ manquant.',
      'DIAGNOSTIC TERMINER GRISÉ — Si canFinalize=false, log explicite avec la liste des bloqueurs (doc, page, type, label, id). Au prochain test on saura immédiatement quel champ obligatoire empêche de terminer.',
      'Bonus : goToNextField (navigation Suivant) priorise les champs non-signature avant la signature. Le candidat finit toujours de tout remplir avant d\'arriver à la signature.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.55 — CRITIQUE Sign : PDF final était VIDE (pattern #71 pdf-generator)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.55',
    date: '2026-05-26',
    label: 'CRITIQUE Sign : les documents PDF finaux ne contenaient AUCUN champ rempli (uniquement la signature)',
    features: [
      'CRITIQUE — Les documents finaux reçus par email étaient quasi-vides : seuls la signature et les champs sans recipientOrder explicite étaient stampés. Tous les champs remplis par le candidat (adresse, NPA, ville, nationalité, état civil, téléphone, paiement, allocations, etc.) — pourtant bien sauvegardés en base — étaient absents du PDF. La signature consultant pré-remplie aussi. Cause : mismatch d\'ordre destinataire (envelope 0-based) vs ordre champ (template 1-based) dans le générateur PDF. Cohérent avec le fix v2.9.53 côté envoi mais le générateur PDF n\'avait pas reçu le même fix.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.54 — Sign : bloque signer si champs obligatoires vides + logs diag téléphone
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.54',
    date: '2026-05-26',
    label: 'Sign : impossible de signer si un champ obligatoire est vide + diagnostic pré-remplissage téléphone',
    features: [
      'BLOQUE SIGNER SI CHAMPS VIDES — Cliquer sur une zone de signature alors que des champs obligatoires sont vides affiche désormais un message d\'erreur et amène automatiquement au prochain champ à remplir, au lieu d\'ouvrir le pad de signature. Avant : le candidat pouvait signer, puis se retrouvait avec un bouton Terminer grisé sans savoir pourquoi.',
      'DIAGNOSTIC TÉLÉPHONE — Logs détaillés sur le pré-remplissage du téléphone candidat (autoFill.telephone, candidateFieldIds, phoneFieldsDetected) pour identifier au prochain test pourquoi certains champs « Tél. portable » restent vides malgré la liaison candidat.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.53 — Sign : auto-sign consultant via pattern #71 + cross-key toujours
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.53',
    date: '2026-05-25',
    label: 'Sign : auto-sign consultant fiabilisé (pattern recipientOrder) + clé partagée propage toujours',
    features: [
      'AUTO-SIGN PATTERN #71 — Le mapping destinataire ↔ champ template est désormais fait par INDEX des orders distincts (cohérent avec verify-token et SignWizard). Avant : le consultant en order 1 (0-based) cherchait les champs preset en order 1 (= candidat dans le template 1-based) → mismatch → mail signature reçu quand même.',
      'CLÉ PARTAGÉE PROPAGE TOUJOURS — La cross-template key (Code postal, Ville, Adresse) propage maintenant à chaque saisie, sans condition « si cible vide ». Avant : seul le 1er caractère se propageait (la cible « R » bloquait « Ro » comme déjà rempli). Synchronisation bidirectionnelle : si le candidat saisit dans la cible, la source est aussi mise à jour.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.52 — Sign : signature consultant en dur (4 fixes post-test João)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.52',
    date: '2026-05-25',
    label: 'Sign : signature consultant en dur — auto-sign dès qu\'au moins un champ a une preset + nom auto + pas de doublon mail',
    features: [
      'AUTO-SIGN ÉLARGI — Le destinataire consultant est désormais auto-signé dès qu\'AU MOINS UN de ses champs signature/paraphe a une signature pré-remplie (avant : il en fallait sur TOUS). Cette unique preset est utilisée pour stamper TOUS ses champs signature/paraphe du PDF final (typique : 1 seule signature dessinée → appliquée sur les 5 pages).',
      'NOM AUTO-REMPLI — Quand le destinataire auto-signé correspond au créateur de l\'enveloppe et que son Prénom/Nom est vide dans le formulaire d\'envoi, on le remplit automatiquement avec son full_name profil. Évite les champs « Nom du consultant » vides sur la fiche d\'inscription.',
      'PAS DE DOUBLON MAIL — Les destinataires auto-signés ne reçoivent plus le mail « Documents signés » de fin d\'enveloppe (ils n\'ont jamais signé manuellement, pas besoin de les confirmer). Évite le doublon récap quand l\'adresse de réception est un groupe Exchange qui forward vers le consultant.',
      'LOGS DIAGNOSTIC — Logs détaillés dans /api/sign/verify-token (distribution recipientOrder des fields) pour identifier d\'un coup d\'œil les bugs « le candidat signe 2 fois » ou « le consultant voit la signature du candidat ».',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.51 — Sign : signature consultant en dur dans le template + email de réception
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.51',
    date: '2026-05-25',
    label: 'Sign : signature consultant intégrée au template (« en dur ») + email de réception personnalisable',
    features: [
      'SIGNATURE EN DUR — Sur n\'importe quel champ signature ou paraphe d\'un template, nouveau bouton « Dessiner la signature pré-remplie » (consultant). Quand activée, cette image est stampée automatiquement à la finalisation, à la place d\'attendre une signature live. Permet de dupliquer un template par consultant (un « Joao », un « Seb ») avec sa propre signature consultant intégrée — le candidat n\'a plus que sa propre signature à faire.',
      'AUTO-SIGN À L\'ENVOI — Si TOUS les champs signature/paraphe d\'un destinataire sont en mode pré-rempli, il est auto-signé à l\'envoi (status passe à signé, audit log « preset_template ») et ne reçoit pas de lien d\'invitation. Le candidat reste le seul destinataire actif.',
      'EMAIL DE RÉCEPTION DU RÉCAP — Nouveau champ dans les options avancées de la page d\'envoi : « Email de réception du récap final ». Par défaut le récap part sur ton adresse, mais tu peux mettre n\'importe quelle adresse (ex : info@l-agence.ch). Permet aux secrétaires d\'envoyer un template Seb et recevoir le récap sur la BAL collective. Le candidat ne voit pas cette adresse.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.50 — Sign : email récap consultant fiabilisé + logs diagnostic
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.50',
    date: '2026-05-25',
    label: 'Sign : email récap consultant fiabilisé + pièces jointes candidat accessibles sur la page enveloppe',
    features: [
      'EMAIL RÉCAP — En pièces jointes : uniquement les documents juridiquement signés (avec champ signature). Les documents purement informatifs (rapport d\'heures, fiche salaires, calendrier) ne polluent plus la boîte du consultant — ils restent accessibles sur la page de l\'enveloppe.',
      'PIÈCES JOINTES CANDIDAT — Nouvelle section « Pièces jointes chargées par le candidat » sur la page enveloppe. Liste les fichiers (CV, permis, photo selfie, etc.) avec leur taille et date d\'expiration éventuelle, bouton télécharger par fichier. Avant : les uploads candidat n\'étaient accessibles que via l\'onglet Conformité de la fiche candidat.',
      'TAILLE PJ — Si la taille totale dépasse 35 Mo, les uploads candidat sont retirés du mail et un bandeau jaune dirige explicitement vers la page enveloppe pour les visualiser et télécharger. Si Resend renvoie quand même une erreur, retry automatique sans pièces jointes.',
      'DIAGNOSTIC — Logs détaillés sur le pipeline finalize (stamping signature + génération certificat + envoi email récap). Permet de comprendre en un coup d\'œil pourquoi un destinataire ne reçoit pas sa signature stampée ou son email final.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.49 — Sign : 3 corrections (catégorie, auto-fill consultant, certificat unique)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.49',
    date: '2026-05-25',
    label: 'Sign : catégorie « Autres » retirée + auto-fill candidat visible côté consultant + UN seul certificat global',
    features: [
      'CATÉGORIES — La catégorie « Autres » est retirée des fiches candidat (signatures électroniques). Tout va sur « Général » par défaut, sauf le « Contrat de travail » qui reste dans sa propre catégorie. Les enveloppes existantes classées « Autres » sont automatiquement rebasculées sur « Général ».',
      'CONSULTANT — Les champs auto-fill remplis par le candidat (nom, prénom, email, fonction, téléphone, société) apparaissent désormais correctement en lecture seule dans la vue consultant. Avant : ils s\'affichaient vides à l\'écran intermédiaire alors qu\'ils étaient bien dans le PDF final.',
      'CERTIFICAT — UN seul certificat de signature est généré pour toute l\'enveloppe, listant tous les documents signés avec leur empreinte SHA-256. Avant : un certificat par document, y compris pour les documents purement informatifs (rapport d\'heures, calendrier). Les documents sans champ signature ne figurent plus au certificat.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.48 — Missions : tri « Début dans 1j » correct (même fix que v2.9.47)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.48',
    date: '2026-05-25',
    label: 'Missions : les missions « Début dans 1j » se classent maintenant en haut avec les autres « Début dans Nj »',
    features: [
      'Suite à la v2.9.47, le statut affichait bien « Début dans 1j » mais la mission restait classée tout en bas avec les missions actives. Le tri avait la même typo de fuseau horaire (déjà corrigée pour l\'affichage). Comparaison de tri désormais alignée → les missions qui démarrent demain remontent au-dessus des missions actives.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.47 — Missions : statut « Début dans Nj » correct pour le lendemain
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.47',
    date: '2026-05-25',
    label: 'Missions : statut « Début dans 1j » correct pour les missions qui démarrent demain',
    features: [
      'Une mission qui démarrait le lendemain (J+1) tombait à tort sur le statut « En mission » au lieu de « Début dans 1j ». Cause : un piège de fuseau horaire (les dates ISO sont parsées en UTC alors que l\'heure courante est en heure locale). Le calcul du statut compare désormais au niveau du jour, pas du datetime — toutes les missions à venir affichent le bon décompte.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.46 — Sign : intro temps réel + photo selfie → fiche + cleanup recto/verso
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.46',
    date: '2026-05-25',
    label: 'Sign : intro en temps réel + photo selfie sur la fiche + cleanup recto/verso',
    features: [
      'INTRO TEMPS RÉEL — l\'édition d\'une étape d\'introduction (titre, sous-titre, texte) est maintenant fluide : les frappes rapides ne sont plus perdues.',
      'PHOTO SELFIE — sur un champ « pièce jointe », nouvelle option « Utiliser comme photo de profil du candidat ». Si la fiche n\'a pas encore de photo, la 1ʳᵉ image chargée à la signature devient automatiquement sa photo de profil. Idéal pour la photo selfie de la fiche d\'inscription.',
      'TYPE DE DOCUMENT — les deux contrôles redondants (dropdown « Recto + Verso » + case « Plusieurs fichiers autorisés ») sont fusionnés en UN seul dropdown clair avec 3 options : « Une seule face », « Recto + Verso », « Plusieurs fichiers ».',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.45 — Sign : étape d'introduction personnalisable
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.45',
    date: '2026-05-22',
    label: 'Sign : nouvelle étape d\'introduction (logo + titre + texte + image)',
    features: [
      'Dans l\'éditeur de template Sign, un nouveau bouton « + Intro » permet d\'ajouter une étape d\'introduction au wizard du signataire.',
      'Tu personnalises librement : afficher/masquer le logo L-Agence, titre, sous-titre, texte (multi-paragraphes), image optionnelle. L\'image est compressée automatiquement (max 1200 px) et stockée dans le template.',
      'Le signataire voit un écran propre (logo + titre + texte + image), lit, puis clique « Continuer ». Aucun champ à remplir.',
      'Pratique pour souhaiter la bienvenue, expliquer le contexte, rappeler une consigne avant le formulaire — totalement additif, les templates existants ne sont pas modifiés.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.44 — Rapports : champs d'édition alignés sur mobile (page client)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.44',
    date: '2026-05-22',
    label: 'Rapports : champs alignés en mode édition sur mobile',
    features: [
      'Sur la page de validation client, en mode « Modifier les données » sur mobile, les champs verts (heures, repas, déplacement) débordaient leurs cellules et se chevauchaient. Ils sont désormais alignés proprement dans le tableau du rapport, comme sur ordinateur.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.43 — Rapports : « Corriger » envoie le lien de signature au client
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.43',
    date: '2026-05-22',
    label: 'Rapports : « Corriger » — envoi du lien de signature au client',
    features: [
      'CORRIGER — quand tu corriges un rapport que le client n\'a pas encore signé, un bouton « Enregistrer + envoyer au client pour signature » lui envoie directement le lien pour valider et signer la version corrigée. Avant : il recevait seulement le PDF corrigé, sans invitation à signer.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.42 — Rapports : totaux, bug corrections client, gestion des corrections
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.42',
    date: '2026-05-22',
    label: 'Rapports : totaux corrigés + suppression / renvoi / correction des rapports',
    features: [
      'TOTAUX — les totaux du rapport (heures, repas, déplacement) ne comptaient pas le samedi et avaient des références cassées. Corrigés : ils suivent les 7 jours et se recalculent dès qu\'une valeur change.',
      'BUG — quand le client modifiait les données puis signait sans cliquer « Sauvegarder », ses corrections étaient perdues (PDF final avec les anciennes valeurs). La signature enregistre désormais automatiquement les corrections en attente.',
      'MOBILE — la page de validation client est refondue pour le mobile (en-tête et boutons lisibles). La case « Ajouter une note » du bas, en doublon avec le bouton « Notes / Remarques », a été retirée.',
      'RAPPORTS — nouveau bouton « Renvoyer pour correction » : renvoie le rapport au candidat (email et/ou WhatsApp) avec une raison ; il le corrige et le re-signe.',
      'RAPPORTS — nouveau bouton « Corriger » : modifie toi-même tout le rapport (heures, repas, semaine…), puis envoie le PDF corrigé au candidat et au client.',
      'RAPPORTS — nouveau bouton « Supprimer » : efface complètement un rapport ; la semaine se libère et le candidat peut la re-soumettre.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.41 — TalentFlow Mobile : en-tête propre sur tous les onglets
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.41',
    date: '2026-05-21',
    label: 'TalentFlow Mobile : en-tête propre sur tous les onglets',
    features: [
      'Sur les onglets autres que Candidats, la barre de recherche de l\'en-tête poussait le profil hors de l\'écran. Elle est masquée sur mobile → en-tête propre partout (menu, notifications, profil).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.40 — TalentFlow Mobile Phase 2b : en-tête + écran d'accueil
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.40',
    date: '2026-05-21',
    label: 'TalentFlow Mobile : en-tête compact + écran d\'accueil refondu',
    features: [
      'EN-TÊTE — sur mobile, les boutons secondaires (Importer CV, thème) débordaient hors de l\'écran et masquaient la cloche / le profil. L\'en-tête est désormais compact : menu, recherche, notifications, profil.',
      'ACCUEIL — la carte « Bonjour » écrasait le texte (un mot par ligne). Elle passe en colonne unique sur mobile, lisible et propre.',
      'Refonte mobile en cours, écran par écran — les listes (candidats, missions…) suivent.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.39 — TalentFlow Mobile Phase 2a : pages larges accessibles
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.39',
    date: '2026-05-21',
    label: 'TalentFlow Mobile : les pages larges (liste candidats…) ne sont plus tronquées',
    features: [
      'Sur mobile, les pages plus larges que l\'écran (liste des candidats, missions…) avaient toute leur partie droite coupée et inaccessible (téléphone, âge, actions).',
      'Désormais ces pages défilent horizontalement d\'un glissement de doigt — tout le contenu redevient atteignable.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.38 — TalentFlow Mobile (PWA consultant) — Phase 1
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.38',
    date: '2026-05-21',
    label: 'TalentFlow Mobile : app installable + barre de navigation (Phase 1)',
    features: [
      'TalentFlow est désormais installable comme une application sur ton téléphone (bandeau d\'installation sur le tableau de bord — bouton Android / tuto iPhone).',
      'Nouvelle barre de navigation basse sur mobile : Accueil · Candidats · Clients · Missions · Signatures · Rapports — accès direct façon app.',
      'Phase 1 : l\'app est installable et navigable. L\'optimisation mobile détaillée de chaque page suivra (Phase 2).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.37 — PWA Rapport : icône dédiée (éclair + document)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.37',
    date: '2026-05-21',
    label: 'PWA rapport : icône dédiée (éclair TalentFlow + document)',
    features: [
      'L\'app « TalentFlow Rapport » a désormais sa propre icône : l\'éclair TalentFlow accompagné d\'un document, pour la distinguer de l\'app principale.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.36 — PWA : page d'ouverture de l'app ne reste plus bloquée
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.36',
    date: '2026-05-21',
    label: 'PWA rapport : l\'app ouvre directement la connexion ou le rapport',
    features: [
      'À l\'ouverture de l\'app installée, l\'écran d\'accueil restait bloqué sur un message sans bouton.',
      'Désormais l\'app va directement : au dernier rapport ouvert, ou au rapport du candidat s\'il est connecté, ou à la page de connexion sinon.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.35 — Portail rapport candidat installable en application (PWA)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.35',
    date: '2026-05-21',
    label: 'Portail rapport candidat : installable comme une application (PWA)',
    features: [
      'Le portail rapport candidat peut désormais être installé comme une application « TalentFlow Rapport » sur le téléphone du candidat — icône sur l\'écran d\'accueil, ouverture plein écran.',
      'Un bandeau d\'installation discret apparaît : sur Android, bouton « Installer » en 1 tap ; sur iPhone, un mini-tutoriel illustré (Partager → Sur l\'écran d\'accueil).',
      'Le portail continue de fonctionner exactement comme avant dans tous les navigateurs — l\'installation est un bonus optionnel.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.34 — Conformité : visionneuse de documents corrigée
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.34',
    date: '2026-05-21',
    label: 'Conformité : visionneuse de documents — ajustement écran + zoom + télécharger + imprimer',
    features: [
      'Quand on ouvrait un document de Conformité (permis, carte d\'identité…), l\'image s\'affichait à sa taille réelle (énorme), impossible de la voir en entier ni de dézoomer.',
      'La visionneuse ajuste désormais l\'image à l\'écran automatiquement, avec des boutons zoom avant / arrière / ajuster.',
      'Ajout des boutons « Télécharger » et « Imprimer » dans la visionneuse.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.33 — Recherche par rayon : distance routière estimée
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.33',
    date: '2026-05-21',
    label: 'Recherche par rayon (Ville & Rayon) : distance routière au lieu du vol d\'oiseau',
    features: [
      'La recherche par région calculait la distance à vol d\'oiseau (ligne droite GPS). En Valais, les routes contournent les montagnes → une recherche « Sion 25 km » ramenait des profils en réalité bien plus loin en voiture.',
      'Désormais un facteur détour routier (×1,35) est appliqué : « Sion 25 km » filtre les candidats réellement à ~25 km par la route, et la distance affichée sur les cartes est une estimation routière.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.32 — Envoi en masse : retirer les candidats déjà contactés
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.32',
    date: '2026-05-21',
    label: 'Envoi en masse (iMessage / WhatsApp) : bouton pour retirer les candidats déjà contactés',
    features: [
      'Quand un envoi groupé (iMessage/SMS ou WhatsApp) contient des candidats déjà contactés ces 7 derniers jours, l\'alerte n\'était qu\'informative. Désormais un bouton « Retirer N de la liste » les enlève directement de la sélection en un clic.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.31 — Sign : email unique de finalisation + fix PDF en .txt
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.31',
    date: '2026-05-21',
    label: 'Sign : un seul email à la finalisation + corrections pièces jointes candidat',
    features: [
      'EMAIL FUSIONNÉ — À la fin d\'une signature, vous receviez 2 emails séparés (un avec les documents signés, un avec les pièces jointes chargées par le candidat). Désormais un SEUL email regroupe tout : documents signés + pièces jointes du candidat, avec le bon design L-Agence.',
      'FIX .TXT — Les documents signés arrivaient en pièce jointe comme des fichiers texte (s\'ouvraient dans TextEdit au lieu d\'un lecteur PDF). Cause : le nom de fichier n\'avait pas l\'extension « .pdf ». Désormais chaque PDF signé porte bien l\'extension .pdf.',
      'FIX DOUBLON — Chaque pièce jointe du candidat était envoyée en double (ex : 2× « Permis de travail.pdf » identiques). Corrigé : chaque document n\'apparaît plus qu\'une seule fois.',
      'FIX ROTATION — Les photos prises au téléphone (carte d\'identité, permis) arrivaient tournées sur le côté. L\'orientation de la photo est désormais corrigée automatiquement.',
      'FIX NOM DE FICHIER — Les pièces jointes (CV, permis…) sont maintenant nommées d\'après le champ du formulaire (« CV.pdf », « Permis de travail.pdf ») au lieu de « image.jpg ». Une photo seule est aussi convertie en PDF.',
      'Le candidat ne reçoit toujours QUE ses documents signés — jamais les pièces jointes (carte d\'identité, permis…) qu\'il a lui-même scannées.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.30 — Sign : fix signature consultant (voyait les champs du candidat)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.30',
    date: '2026-05-21',
    label: 'Sign : correction — le consultant voyait la signature du candidat au lieu de la sienne',
    features: [
      'Quand le consultant ouvrait son lien, il voyait le champ de signature DU CANDIDAT à signer (alors que le candidat avait déjà signé), et son propre champ restait masqué. Cause : l\'affichage du document utilisait l\'ordre brut du destinataire au lieu de l\'ordre réconcilié avec le template (les 2 ne coïncidaient pas — pattern #71).',
      'Désormais : la signature du candidat s\'affiche bien comme « signée » (lecture seule), et le consultant ne voit que SON champ de signature à remplir.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.29 — Sign : pièce jointe accepte tous les types d'image
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.29',
    date: '2026-05-20',
    label: 'Sign : pièce jointe — tous les formats d\'image acceptés + choix simplifié',
    features: [
      'UPLOAD IMAGES — Le stockage des pièces jointes n\'acceptait que les PDF (erreur « image/jpeg is not supported »). Désormais tous les formats d\'image sont acceptés (JPEG, PNG, HEIC iPhone, WebP…).',
      'ÉDITEUR — Le réglage des types de fichier d\'un champ pièce jointe passe d\'une liste de cases techniques à un choix simple : « Photos + PDF » / « Photos uniquement » / « PDF uniquement ».',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.28 — Sign : upload réparé, téléphone, champ masqué, hyperlien, drag
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.28',
    date: '2026-05-20',
    label: 'Sign : upload pièce jointe réparé + champ masqué wizard + hyperlien cliquable + fixes',
    features: [
      'UPLOAD RÉPARÉ — Le chargement des pièces jointes échouait (« Échec de l\'envoi du fichier ») : le fichier est désormais envoyé correctement vers le stockage Supabase.',
      'TÉLÉPHONE — Le numéro du candidat pré-remplit vraiment les champs téléphone du wizard maintenant (le filtre interne ratait le champ selon son ordre). Détection par libellé « Tél. portable / Natel… ».',
      'CHAMP MASQUÉ DU WIZARD — Nouveau réglage « Masquer dans le wizard » : un champ reste sur le PDF et en Mode Document mais n\'apparaît pas au candidat — idéal pour un champ rempli automatiquement (adresse via clé partagée).',
      'LIEN HYPERTEXTE — Nouveau réglage « Lien hypertexte » sur un champ : un lien cliquable (texte personnalisable, ex « QUIZ ») s\'affiche dans le wizard et ouvre un nouvel onglet. Sur une case à cocher, cliquer le lien coche aussi la case automatiquement.',
      'GLISSER-DÉPOSER — En Mode Wizard, déplacer un champ ne le colle plus à la section voisine ; le drag ne fait que réordonner.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.27 — Sign : sections en liste, autofill tel, undo/redo wizard, recto/verso
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.27',
    date: '2026-05-20',
    label: 'Sign : sélecteur sections en liste + autofill téléphone + undo/redo wizard + pièce jointe recto/verso',
    features: [
      'SECTIONS — Le choix de la « Section d\'affichage » d\'un champ se fait via une liste déroulante propre, au lieu d\'un mur de pastilles illisible quand il y a 20+ sections (Mode Document et Mode Wizard).',
      'TÉLÉPHONE — Le numéro de portable du candidat (depuis sa fiche) pré-remplit automatiquement les champs téléphone du wizard, même si le champ n\'a pas le réglage « Format → Téléphone » (détection par libellé « Tél. portable », « Natel »…). La valeur est enregistrée, plus seulement affichée.',
      'CLÉ PARTAGÉE — Les champs portant la même clé partagée dans une même enveloppe se recopient désormais en direct pendant le remplissage (ex : adresse saisie dans la Fiche d\'inscription → recopiée dans le Contrat cadre du même envoi).',
      'UNDO / REDO — Boutons Annuler / Refaire dans l\'éditeur Mode Wizard (+ raccourcis Cmd+Z / Cmd+Maj+Z).',
      'PIÈCE JOINTE RECTO/VERSO — Nouveau réglage « Type de document : Recto + Verso » : le candidat voit 2 emplacements distincts (Recto / Verso) et les 2 photos sont assemblées sur une seule page A4 dans l\'email.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.26 — Sign : 3 correctifs du flux « Envoyer à signer »
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.26',
    date: '2026-05-20',
    label: 'Sign : flux « Envoyer à signer » — candidat préservé au choix du template + 2 fixes',
    features: [
      'CANDIDAT PRÉSERVÉ — Bug corrigé : choisir un template délié le candidat de sa fiche et effaçait son téléphone. Le lien candidat et le téléphone sont désormais conservés quand on sélectionne le template.',
      'BOUTONS FICHE — Les boutons « Conformité » et « Envoyer à signer » n\'apparaissent que sur les fiches de candidats traités (Actif).',
      'ÉTAPES — « Définir des étapes de signature » n\'est plus coché par défaut : quand un template a des rôles, c\'est le template qui définit le routing, pas les étapes libres.',
      'RECHERCHE CANDIDAT — L\'autocomplétion des destinataires remonte plus de résultats (un candidat moins récent pouvait être absent de la liste).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.25 — Sign : pièces jointes recto/verso assemblées en 1 PDF type scan
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.25',
    date: '2026-05-20',
    label: 'Sign : recto + verso d\'un document assemblés en un seul PDF dans l\'email',
    features: [
      'Quand le candidat charge plusieurs photos dans un même champ pièce jointe (ex : recto puis verso d\'une carte d\'identité), l\'email reçu par le créateur contient désormais un seul PDF propre — recto en haut, verso en bas sur une page A4, comme un vrai scan — au lieu de deux fichiers séparés.',
      'Fonctionne pour les photos JPEG / PNG. Les autres formats (PDF déjà fourni, etc.) restent attachés tels quels. L\'onglet Conformité conserve recto et verso comme deux faces distinctes.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.24 — Sign : fiabilisation du workflow (diagnostic 15 bugs corrigés)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.24',
    date: '2026-05-20',
    label: 'Sign : workflow fiabilisé — données garanties, anti-double, validations',
    features: [
      'DONNÉES GARANTIES À LA FINALISATION — Avant : si le candidat validait juste après avoir tapé/chargé un fichier, les 600 dernières millisecondes pouvaient être perdues (pièce jointe non enregistrée). Maintenant les données sont forcées en base avant la finalisation, et aussi en cas de fermeture d\'onglet.',
      'ANTI-DOUBLE FINALISATION — Quand deux signataires terminaient à quelques secondes d\'intervalle, l\'enveloppe pouvait rester bloquée « en cours » ou générer le PDF + les emails en double. Verrou atomique ajouté : la complétion ne s\'exécute plus jamais deux fois.',
      'STATUT SIGNATAIRES FIABLE — Le statut d\'un signataire ne peut plus régresser (« signé » → « en attente ») quand deux signatures s\'enregistrent en parallèle.',
      'ENVOI — Un destinataire sans email ne fait plus planter tout l\'envoi. Et si aucun lien n\'a pu être envoyé, l\'enveloppe reste en brouillon (réenvoi possible) au lieu d\'être marquée « envoyée » à vide.',
      'PDF — Les champs sans destinataire explicite sont désormais correctement attribués au premier signataire (avant : parfois non imprimés sur le PDF).',
      'SÉQUENÇAGE — Le passage au signataire suivant fonctionne même si les ordres de signature sont incomplets. Rappels automatiques : correction d\'un cas où le rappel n\'était pas envoyé selon la casse de l\'email.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.23 — Sign : champ pièce jointe + intégration Conformité de la fiche candidat
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.23',
    date: '2026-05-20',
    label: 'Sign : pièce jointe candidat (upload + lecture IA) reliée à la Conformité de la fiche',
    features: [
      'CHAMP PIÈCE JOINTE — Le champ « Pièce jointe » est désormais fonctionnel : le candidat charge un fichier ou une photo (recto + verso possibles), directement depuis le wizard ou le document. Champ vert une fois chargé.',
      'CONTRÔLE DE LISIBILITÉ — Après chaque chargement de photo, Claude vérifie qu\'elle est lisible. Si elle est douteuse, un message non-bloquant invite à reprendre la photo — mais le candidat peut toujours continuer.',
      'DATE D\'EXPIRATION AUTO — Pour les documents officiels (carte d\'identité, passeport, permis…), Claude lit automatiquement la date d\'expiration. Si la lecture est sûre, elle est remplie ; sinon rien n\'est noté.',
      'CASE À COCHER LIÉE — Sur un champ pièce jointe, on peut choisir une case à cocher qui se coche automatiquement dès qu\'un fichier est chargé (ex : « Copie CV ☑ »).',
      'BOUTON FICHE CANDIDAT — Nouveau bouton « Envoyer à signer » sur la fiche candidat : ouvre la création d\'envoi avec le candidat déjà pré-rempli (nom, email, téléphone).',
      'INTÉGRATION CONFORMITÉ — Chaque champ pièce jointe peut être classé dans une catégorie de la Conformité. À la finalisation, les documents chargés par le candidat atterrissent automatiquement dans l\'onglet 🛡 Conformité de sa fiche (le CV est exclu). Le créateur reçoit aussi tous les fichiers par email ; le candidat ne reçoit jamais ses propres scans.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.22 — Sign : audit champs — conditions en Mode Document + signature wizard + formule
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.22',
    date: '2026-05-20',
    label: 'Sign : conditions réparées en Mode Document + champ signature wizard + champ formule',
    features: [
      'CONDITIONS (correctif majeur) — Les règles « afficher si… / masquer si… / rendre obligatoire si… » ne fonctionnaient PAS en Mode Document (uniquement en Mode Wizard). Comme le Mode Document est l\'affichage par défaut sur ordinateur, les conditions semblaient cassées. Désormais elles s\'appliquent au rendu, à la file « Suivant » et à la validation finale — comportement identique dans les 2 modes.',
      'CHAMP SIGNATURE — Un champ Signature/Paraphe placé dans une étape normale du wizard s\'affichait comme une simple case texte. Il affiche maintenant une vraie zone de signature cliquable (ouvre le pad de signature).',
      'CHAMP FORMULE — En Mode Document, un champ Formule (calcul automatique) était éditable comme un champ texte (le candidat pouvait écraser le calcul). Il est maintenant en lecture seule avec la valeur calculée, comme en Mode Wizard.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.21 — Sign : panneau « Gérer les sections » (renommer / replier / réordonner / supprimer)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.21',
    date: '2026-05-20',
    label: 'Sign : panneau de gestion des sections (renommer, replier, réordonner, supprimer)',
    features: [
      'NOUVEAU PANNEAU — Bouton « Sections » dans l\'éditeur de template (Mode Wizard ET Mode Document) : une vue d\'ensemble de toutes les sections, fini les 50 badges empilés.',
      'RENOMMER — Clic sur le nom d\'une section pour la renommer partout en une fois.',
      'REPLIER — Chaque section peut être repliée (ses champs sont masqués dans l\'éditeur). Bouton « Tout replier / Tout déplier ». Convenance d\'édition : n\'affecte jamais ce que voit le candidat.',
      'RÉORDONNER — En Mode Wizard, flèches ↑/↓ pour déplacer une section avant/après une autre dans son étape.',
      'SUPPRIMER — Deux choix : « Dégrouper » (les champs restent, ils ne sont plus regroupés) ou « Supprimer les champs » (définitif, avec confirmation).',
      'TOUT OBLIGATOIRE — Case par section pour rendre tous ses champs obligatoires / facultatifs (les cases groupées Oui/Non sont ignorées, leur règle de groupe prévaut).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.20 — Sign : affichage 100% auto selon l'appareil (wizard mobile / document desktop)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.20',
    date: '2026-05-20',
    label: 'Sign : mode d\'affichage 100% automatique (wizard sur mobile, document sur desktop)',
    features: [
      'Le mode d\'affichage de la page de signature est maintenant purement déterminé par l\'appareil : wizard guidé sur mobile, document complet sur desktop. Le réglage "preferredViewMode" du destinataire ne force plus le wizard sur desktop.',
      'Sur desktop, le toggle en haut permet toujours de basculer manuellement en wizard si on le souhaite.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.19 — Sign flow : recap supprimé, texte confirmation, 1 seul email consultant, fix signature consultant
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.19',
    date: '2026-05-20',
    label: 'Sign : page Récap supprimée + texte confirmation + 1 email consultant + fix signature consultant cachée',
    features: [
      'RÉCAPITULATIF — La page Récap finale du wizard de signature est supprimée (hideRecap), comme pour les rapports. La dernière étape déclenche directement la finalisation.',
      'CONFIRMATION — Le texte post-signature ne dit plus "Votre signature a bien été enregistrée…" mais "Nous allons analyser et valider votre dossier. Une copie complète vous sera envoyée par email." (plus juste : le dossier n\'est pas encore validé).',
      'EMAIL CONSULTANT — Un seul email au lieu de deux. Avant : le consultant recevait l\'invitation à signer ET la notification "X a signé". Maintenant : si le consultant est aussi le prochain signataire, seule l\'invitation est envoyée — avec le wording "[Candidat] a rempli et signé — veuillez vérifier et confirmer" + un bloc Détails (Enveloppe, Signataire, Signé le).',
      'SIGNATURE CONSULTANT — Corrigé : le consultant voyait la signature du candidat et sa propre case était cachée. Cause : le mapping d\'ordre fuzzy ±1 échouait quand 2 ordres coexistent. Nouveau mapping robuste par index (Nème destinataire ↔ Nème ordre du template). Le consultant peut signer sa partie et corriger les champs du candidat si besoin.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.18 — Sign Templates : 5 améliorations (sections casse, champ date, doc header, téléphone, listes préset)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.18',
    date: '2026-05-19',
    label: 'Sign : casse sections + champ date respecté + nom doc dans wizard + champ téléphone réparé + listes prédéfinies',
    features: [
      'SECTIONS — Le nom des sections s\'affiche en casse normale (avant : tout en MAJUSCULE forcé). Lisible dans l\'éditeur Wizard et côté candidat.',
      'CHAMP DATE — Un champ type "texte libre" dont le label contient le mot "date" (ex: "lieu et date de début") n\'est plus converti automatiquement en sélecteur de date. Le type choisi est respecté.',
      'WIZARD — Le nom du PDF de l\'étape courante s\'affiche dans le header du wizard candidat (à côté de "Étape X / Y"). Le candidat sait quel document il remplit.',
      'CHAMP TÉLÉPHONE — Réparé. Un champ Numéro en format "Téléphone" reste un input tel (accepte +, espaces, zéros de tête) même sans pré-remplissage. Avant : il tombait en input number HTML qui effaçait les + et zéros. Sélecteur éditeur clarifié : "Format du champ" = Nombre OU Téléphone.',
      'LISTES PRÉDÉFINIES — Nouveau sélecteur "Liste prédéfinie" dans l\'éditeur de champ Liste : charge en un clic Permis de conduire (A→G), Permis de séjour (B/C/L/G…), Nationalités (Europe+monde), Cantons suisses, État civil, Civilité, Oui/Non, Taux d\'occupation, Caisses maladie.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.17 — Sign wizard mobile : filter strict répliqué dans 5 endroits, centralisé
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.17',
    date: '2026-05-19',
    label: 'Sign : wizard mobile fix DÉFINITIF — filter ±1 centralisé via effectiveRecipientOrder',
    features: [
      'CAUSE RACINE — v2.9.15 ajoutait un filter tolérant ±1 dans le useEffect viewMode setter UNIQUEMENT. Mais 5 autres endroits avaient un filter strict identique (fields candidat, canFinalize, nextFieldsQueue, toggle button, render wizard). Donc viewMode passait à wizard mais wizardStepsForRecipient = [] → fallback document.',
      'FIX — Nouveau useMemo `effectiveRecipientOrder` qui résout le mismatch 0/1-based (recipient.order vs template wizard_steps.recipientOrder + fields.recipientOrder). Utilisé partout : fields filter, wizardSteps filter, toggle button visibility, render wizard condition.',
      'Pattern #71 (mix 0/1-based) maintenant complètement neutralisé côté lecture (signing page). Le candidat sur iPhone avec recipient.order=0 et wizard_steps[].recipientOrder=1 voit enfin le wizard.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.16 — Sign : auto-sign SUPPRIMÉ + preferredViewMode persisté + ÉTAPE 1/2 réellement affichés
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.16',
    date: '2026-05-19',
    label: 'Sign : 3 fixes résiduels — auto-sign SUPPRIMÉ, mode wizard candidat persisté, ÉTAPE 1/2 fixé pour de bon',
    features: [
      'AUTO-SIGN — Supprimé entièrement (était v2.8.5, restreint v2.9.15, supprimé v2.9.16). Chaque destinataire dans la chaîne signe manuellement via son propre lien, même le créateur s\'il est dans les destinataires. Garantit validité juridique + permet à João de tester chaque flow sans contournement.',
      'WIZARD CANDIDAT — `/api/sign/envelopes` POST sauvegarde maintenant `preferredViewMode` sur le recipient. Avant : choix wizard/document fait dans /sign/new n\'était PAS persisté → recipient.preferredViewMode = undefined → fallback "auto" → souvent mode document. Maintenant le choix est respecté côté candidat (combiné avec wizard FORCÉ sur mobile de v2.9.15).',
      'ÉTAPE 1/2 — Le badge utilise maintenant l\'INDEX du groupe (0, 1, 2...) au lieu de l\'order du recipient (qui peut être 1, 2... selon le template). Display 1, 2, 3 garanti peu importe les orders sous-jacents 0/1-based.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.15 — 5 bugs Sign : auto-sign / email contextuel / ÉTAPE / WhatsApp / wizard mobile
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.15',
    date: '2026-05-19',
    label: 'Sign : 5 bugs corrigés (auto-sign exclu candidat, email contextuel, ÉTAPE 0-based, WhatsApp pré-rempli, wizard auto-mobile)',
    features: [
      'BUG #1 — Auto-sign créateur : exclu si roleName contient "Candidat" ET si destinataire est le 1er signataire (min order). Garantit que le candidat doit toujours signer manuellement, même si on a mis son propre email dans le slot Candidat pour tester.',
      'BUG #2 — Email contextuel : nouveau wording quand le destinataire est en aval d\'un candidat ayant signé. "X a rempli et signé — veuillez vérifier et confirmer avec votre signature" au lieu de "L-Agence vous invite". CTA bouton "Vérifier et signer".',
      'BUG #3 — ÉTAPE 2/3 → ÉTAPE 1/2 : `normalizeOrders` dans `/sign/new` passe en 0-based (était 1-based, ce qui combiné avec `order+1` du rendu affichait 2, 3). Plus de double-incrémentation.',
      'BUG #4 — Wizard auto-mobile : (a) filter steps tolérant aux mix 0/1-based (pattern #71) — match recipientOrder ±1 si pas de match exact. (b) Mobile : wizard FORCÉ si disponible (ignore pref=document). (c) Toggle wizard/document caché sur mobile.',
      'BUG #5 — WhatsApp pré-rempli : `sendViaWhatsApp` lit `envelope.recipients[].phone` (saisi à /sign/new) au lieu de demander à chaque clic. Fallback prompt seulement si phone absent.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.14 — Annotation = info-text + ESC global désactive l'outil placement
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.14',
    date: '2026-05-19',
    label: 'Sign : champ `annotation` rendu comme info-text dans le wizard + ESC désactive l\'outil de placement',
    features: [
      'FIX — Type `annotation` rendait un input texte vide dans le wizard. Correction : rendu en bandeau amber italique avec 💡 et le texte du label, non éditable. Toujours exclu du stamp PDF (pas dans le document signé final). C\'est désormais ce que l\'admin attend : info contextuelle pour le candidat.',
      'UX — Touche `Escape` désactive maintenant l\'outil de placement actif en mode Document, peu importe où est le focus (sauf inputs/textareas pour ne pas interrompre la frappe).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.13 — Wizard Preview : rename attachment ne propageait pas
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.13',
    date: '2026-05-18',
    label: 'Fix Wizard Preview : renommer un attachment se voit maintenant dans l\'aperçu',
    features: [
      'WizardPreview hash incluait fields + step (title/description/fieldIds/displayMode) mais PAS `step.attachments`. Conséquence : renommer un attachment ne changeait pas le hash → snapshot figé → preview affichait l\'ancien nom.',
      'Fix : ajout des attachments dans le hash (id+label+description+docOrder+externalUrl). Le rename propage maintenant immédiatement au preview.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.12 — Sign : autofill cross-template par clé métier
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.12',
    date: '2026-05-18',
    label: 'Sign : autofill cross-template (adresse/NPA/AVS… repris d\'un template signé précédemment)',
    features: [
      'NOUVEAU CHAMP — `SignField.crossTemplateKey?: string` permet de tagger un champ avec une clé métier partagée (adresse, npa, ville, pays, AVS, IBAN, date de naissance, conjoint, permis, etc.). 18 presets fournis + clé custom via saisie libre.',
      'ÉDITEUR — Sélecteur « Clé partagée (autofill cross-template) » visible dans le panneau d\'édition d\'un field text/number/date/email/select/phone. Le tooltip explique le comportement.',
      'API — Nouvelle route publique POST `/api/sign/cross-fill` : prend un token sign (authentifie le destinataire) et renvoie un map `{ crossKey: dernièreValeur }` agrégé sur tous les templates déjà signés par le même email. Plus récent gagne. Skip valeurs vides.',
      'CANDIDAT — `/sign/v/[token]` : useEffect dédié au mount qui appelle cross-fill et pré-remplit les fields ayant une `crossTemplateKey` connue. N\'ÉCRASE JAMAIS une valeur déjà saisie (priorité minimale). Le candidat peut toujours corriger.',
      'USE CASE — Le candidat remplit son adresse/NPA dans la Fiche d\'inscription. Quand on lui envoie ensuite la Mappe, ces champs sont déjà pré-remplis. Idem pour AVS, IBAN, infos conjoint, etc.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.11 — Upload PDF inline dans « Documents à consulter » du Wizard
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.11',
    date: '2026-05-18',
    label: 'Wizard Editor : bouton « 📤 Uploader un PDF » dans Documents à consulter',
    features: [
      'AttachmentsEditor : nouveau bouton 📤 qui ouvre un file picker. Le PDF est uploadé via /api/sign/upload-url (direct Supabase, bypass Vercel 4.5MB) → ajouté à `template.documents[]` → auto-attaché au step en cours. Plus besoin de passer par le mode Document pour ajouter un PDF de référence.',
      'Limite 50 MB par fichier, accept=application/pdf uniquement.',
      'Toast vert au succès, rouge si erreur upload.',
      '⚠️ Limitation actuelle : 1 step = N attachments globaux. Les attachments par carte de section (Cartes par section) viendront dans une release séparée.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.10 — Silence Sentry : "TypeError: Failed to fetch" sur flushSave keepalive
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.10',
    date: '2026-05-18',
    label: 'Sentry nettoyé : plus de "Failed to fetch" parasites sur close onglet pendant auto-save',
    features: [
      'TemplateEditor flushSave : ajout `.catch(() => {})` sur le fetch keepalive (le try/catch sync ne captait pas la promise rejetée quand le navigateur abort la requête).',
      'Sentry instrumentation-client : ignoreErrors étendu (`Failed to fetch`, `NetworkError`, `Load failed` Safari) + beforeSend drop les AbortError.',
      'Effet : fin du bruit Sentry quand un user ferme un onglet pendant qu\'un fetch tourne (cas typique en édition de template).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.9 — Lier/délier une mission à un rapport a posteriori
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.9',
    date: '2026-05-18',
    label: '/sign/rapports/[id] : bouton « Lier une mission » + « Délier » (avant : uniquement à la création)',
    features: [
      'PATCH /api/admin/reports/[id] accepte maintenant `mission_id` (lier/délier). Avant : la liaison ne pouvait se faire qu\'à la création du lien.',
      'Page détail lien : si pas de mission liée → bouton dashed « 🔗 Lier une mission » qui ouvre un modal listant prioritairement les missions du candidat (filtre par candidat_id, fallback sur toutes les missions). Modal portalisé + backdrop blur.',
      'Card « Mission liée » : nouveau bouton « Délier » (rouge outline) pour casser la liaison sans devoir recréer le lien rapport.',
      'Impact métier : quand la mission a une `date_fin`, le candidat ne peut plus soumettre de rapports après cette date — la liaison a posteriori permet d\'appliquer ce garde-fou sur des liens créés sans mission au départ.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.8 — Modal Inviter : pre-fill email candidat + createPortal (fix backdrop sticky)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.8',
    date: '2026-05-18',
    label: 'Modal "+ Inviter" : pré-remplit l\'email candidat + createPortal pour fix backdrop noir sticky',
    features: [
      'PortalAccountsPanel : nouvelle prop `defaultInviteEmail`. Sur /sign/rapports/[id], passer `link.candidat_email` → le modal s\'ouvre avec l\'email pré-rempli (skip si déjà compte créé pour cet email).',
      'BUG MODAL — Backdrop sticky + non flou + ne suit pas le scroll (pattern #10). Cause : un ancêtre du dashboard avec `transform` casse `position:fixed`. Fix : wrap dans `createPortal(jsx, document.body)`. Backdrop blur 6px + WebkitBackdropFilter ajouté pour Safari.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.7 — Phase form rapport : icônes Mon compte/Déconnexion à côté du bouton Aide
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.7',
    date: '2026-05-18',
    label: 'Form rapport : icônes Mon compte/Déconnexion intégrées dans le header à côté du bouton Aide',
    features: [
      'Suppression du bandeau sticky-top dédié au-dessus du header (jugé moche).',
      'Les 2 icônes 32×32 sont maintenant rendues après le bouton Aide jaune, dans la même barre flex → header propre sur mobile et desktop.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.6 — /report/[slug] : icônes account/logout en flow flex (responsive total)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.6',
    date: '2026-05-18',
    label: '/report/[slug] : icônes Mon compte/Déconnexion intégrées dans le header (plus de position:fixed)',
    features: [
      'CandidatWelcomeHeader : nouveau slot `actions` rendu dans le flow flex à droite. Logo réduit 32px + h1 ellipsis + météo ellipsis → contenu garanti lisible sur tout écran (320px à 4K).',
      'Phases sans header (form) : bandeau sticky-top dédié avec les 2 icônes à droite.',
      'Suppression complète du position:fixed qui chevauchait + générait du scroll latéral sur petits écrans.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.5 — Fix scroll latéral /report/[slug]
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.5',
    date: '2026-05-18',
    label: '/report/[slug] : suppression du scroll latéral introduit en v2.9.4',
    features: [
      'Header padding-right ramené à 80px mobile (16px desktop) + box-sizing:border-box + overflow:hidden sur le header.',
      'Tous les wrappers minHeight:100vh du flow rapport candidat ont overflowX:hidden → plus de scroll horizontal parasite.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.4 — Fix chevauchement icônes header /report/[slug] mobile
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.4',
    date: '2026-05-18',
    label: 'Header /report/[slug] : padding-right pour ne plus chevaucher les icônes Mon compte/Déconnexion',
    features: [
      'RAPPORT CANDIDAT — CandidatWelcomeHeader gagne 96px de padding-right sur mobile (220px desktop) pour réserver la place aux pills account/logout fixées top-right. Le logo L-Agence + salutation + météo ne sont plus cachés.',
      'PORTAIL CLIENT — Vérifié : pas de chevauchement (les icônes sont intégrées en ligne 1 du header, pas en position fixed). Aucun changement requis.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.3 — Mobile UX : boutons Mon compte / Déconnexion icon-only sur ≤640px
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.3',
    date: '2026-05-18',
    label: 'Page rapport candidat : boutons Mon compte/Déconnexion icon-only sur mobile',
    features: [
      'RAPPORT CANDIDAT — Les pills « Mon compte » et « Déconnexion » du header /report/[slug] passent en mode icône pure (32×32px) sur ≤640px pour ne plus cacher la photo + nom + boutons d\'action. Desktop ≥641px : libellés conservés.',
      'PAGE SIGNATURE CLIENT — Vérifiée mobile-friendly (déjà isMobile < 900px : logo réduit, label semaine ellipsis, footer sticky bouton Valider sur mobile vs inline header desktop). Pas de changement requis.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.2 — Sign Templates polish + Rapports : bouton WhatsApp client par submission
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.2',
    date: '2026-05-18',
    label: 'Sign : badge condition sous la case + dropdown disambigué — Rapports : bouton WhatsApp client par semaine',
    features: [
      'SIGN — Badge condition ⚙ sur checkbox : déplacé SOUS la case (avant chevauchait le badge étape sur le coin top-left). Ne masque plus le numéro d\'étape.',
      'SIGN — Dropdown « champ déclencheur » dans l\'éditeur de conditions affiche maintenant la page + un ID court (`Section — Nom · p.1 · #abc1`). Permet de différencier deux checkboxes homonymes (ex: 2 « Suisse » dans 2 sections différentes).',
      'RAPPORTS — Bouton WhatsApp client par submission (status `candidate_signed`). Visible sur `/sign/rapports/[id]` à côté de Corriger semaine. Ouvre `wa.me/{tel}?text=…` avec un message pré-rempli incluant le lien `/report/client/{token}` (TTL 7j). Pratique quand le client ne réagit pas à l\'email automatique.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.1 — Sign Templates : conditions show/require + badge condition
  //          sur checkboxes + couleurs custom rôles dans panneau Réassigner
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.1',
    date: '2026-05-18',
    label: 'Sign Templates : règles `show` fonctionnelles + badge ⚙ sur checkboxes + couleurs rôles partout',
    features: [
      'CONDITIONS show/require — Quand un champ a une règle `show`, il est désormais CACHÉ par défaut et n\'apparaît que si la condition est satisfaite (avant : `show` était un no-op silencieux car le défaut était déjà visible). Idem pour `require` : défaut non obligatoire si une règle `require` existe. Permet enfin des règles « Afficher si X ≠ 0 » qui marchent vraiment.',
      'BADGE conditions sur checkboxes — Le badge violet ⚙N (nombre de règles) s\'affiche aussi sur les cases à cocher (avant : visible uniquement sur les fields texte/select). Placé en haut à gauche de la case pour ne pas chevaucher le badge "G" de groupe.',
      'COULEURS rôles partout — Le panneau « Réassigner au destinataire » (multi-sélection) et le sélecteur « Destinataire » (champ unique) utilisent maintenant la couleur custom choisie sur le rôle (colorIdx) au lieu de la couleur par défaut basée sur l\'ordre. Cohérent avec le rendu sur le PDF (pattern #71 + helper `getRecipientPalette`).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.9.0 — Auth portail client + rapports candidat (email + mot de passe)
  //          + UX polish portail mobile + rename PDF rapport + Bilan ETP
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.9.0',
    date: '2026-05-18',
    label: 'Auth email + mot de passe sur portail client & rapports candidat + UX mobile + Bilan ETP',
    features: [
      'AUTH PORTAIL — Nouveau système d\'authentification email + mot de passe pour le portail client (/client-portal/[slug]) et la page candidat rapports (/report/[slug]). Multi-comptes par portail (plusieurs emails pour la même entreprise). Sign / signatures contrat / validation client rapport NE SONT PAS TOUCHÉS (gardent leur fonctionnement par token email).',
      'FLAG auth_required — Toggle "Accès protégé" par portail (et par lien rapport). DEFAULT FALSE → aucune régression sur l\'existant. Activation portail par portail au fur et à mesure que les comptes sont invités. Bandeau jaune dans le dashboard + warning si on active sans aucun compte actif.',
      'FLOW invitation — Admin clique "+ Inviter" (modal email seulement) → compte créé avec password_hash NULL + token invitation 7j → email template L-Agence envoyé → utilisateur clique → page set-password (logo entreprise + nom + email affichés) → crée son mdp → auto-login → bouton "Accéder à mon portail" → portail.',
      'FLOW reset mdp — Lien "Mot de passe oublié ?" sur la page login → email avec lien valable 1h → set-password → auto-login. Anti-énumération (réponse 200 toujours, jamais d\'info sur l\'existence de l\'email).',
      'PAGE Mon compte — /client-portal/account et /report/account : infos compte (email, date création, dernière connexion), changement de mot de passe (avec œil pour voir), bouton déconnexion. Bouton "Mon compte" + "Déconnexion" visibles dans le header du portail si auth_required activé.',
      'SÉCURITÉ — Rate-limit 5 tentatives échouées par IP / 15 min sur /api/portal-auth/login. Compte révoqué (is_revoked) bloqué même avec mdp correct. Cookies HttpOnly + Secure + SameSite=Strict + JWT signé HS256 (PORTAL_AUTH_SECRET). Bcrypt 12 rounds. Tokens invitation/reset invalidés après usage. RLS service_role only sur les 3 nouvelles tables.',
      'UX DASHBOARD — Panneau "Accès" dépliable sous chaque portail dans /missions/portails (et intégré dans /sign/rapports/[id]) : liste comptes avec statut Invité/Actif/Révoqué + boutons Renvoyer/Révoquer/Supprimer + toggle "Accès protégé".',
      'UX PORTAIL CLIENT — Mode liste (1 colonne pleine largeur) sur desktop ≥769px (au lieu de grille 3 cols qui coupait le bouton Documents). Mobile inchangé. Footer auth pages allégé (pas de répétition "L-Agence SA" sous le logo).',
      'UX PORTAIL MOBILE — Header restructuré sur ≤640px : logo L-Agence + badge "Lecture seule" sur ligne 1, ClientLogo + nom entreprise sur ligne 2 (au lieu de tout sur une ligne qui débordait).',
      'UX PAGES LOADING — Spinner orange centré sous le texte "Chargement…" (au lieu de spinner mal centré à gauche). Cohérent sur /client-portal, /report, /report/client, /sign/v.',
      'UX MISSIONS DASHBOARD — Liste portails /missions/portails épurée : retrait du sous-titre redondant "L-AGENCE SA — ..." et du lien "/client-portal/uaUNcYaf…" (déjà visible par bouton Copier/Ouvrir). Ne reste que la date d\'accès.',
      'RAPPORT PDF — Nouveau format de nom de fichier : `Nom_Prenom_Semaine_X.pdf` (rapport) et `Nom_Prenom_Semaine_X_Certificat.pdf` (certificat). Priorité aux champs prenom/nom du candidat lié (DB), fallback split sur 1er espace de candidat_name. Noms composés gérés. Accents retirés.',
      'BILAN MISSIONS — Card hebdo affiche maintenant "X.XX ETP" en chiffre principal (au lieu de "N candidats"), cohérent avec le KPI Total ETP en haut de page. Sous-titre "N missions · Coeff moy. ×0.95". Le vrai coeff moyen est calculé sans pondération prorata (la précédente formule donnait une valeur dénuée de sens).',
      'DB — 2 migrations appliquées : (a) `v290_portal_accounts_auth` (3 tables portal_accounts/portal_tokens/portal_login_attempts + RLS + indexes), (b) `v290_auth_required_flag` (colonnes auth_required sur client_portals + report_links). Cron `cleanup-old-data` étendu : portal_login_attempts >30j, portal_tokens utilisés >30j, portal_tokens expirés >7j.',
      'STACK — `bcryptjs ^3.0.3` ajouté (hash mdp). `jose` (JWT) réutilisé (déjà transit dep Next.js). Nouvelle env var obligatoire `PORTAL_AUTH_SECRET` (32+ chars). Pattern #79 à #82 documentés.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.8.11 — Sign Templates : garde-fous anti-écrasement + suppression chatbot
  //           + règle d'incohérence checkboxes groupées
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.8.11',
    date: '2026-05-17',
    label: 'Sign Templates : garde-fous anti-écrasement DB + suppression chatbot IA + règle checkboxes groupées',
    features: [
      'INCIDENT 17/05 14:56 — Le template « Documents à signer » a été wipé en DB suite à une race condition probable HMR/auto-save (PATCH silent avec docs=[] envoyé pendant l\'hydratation du composant). Restauration depuis le daily backup 17/05 01:56 UTC (5 docs, 102 fields, 16 wizard steps, 2 destinataires intacts, 0 perte fonctionnelle).',
      'GARDE-FOU CLIENT — `TemplateEditor.handleSave` capture les counts au premier load avec data non-vide. Tout PATCH (silent OU manuel) qui tenterait d\'envoyer docs/recipients/wizard_steps vide alors qu\'il y en avait au load est REFUSÉ et déclenche un toast rouge `Auto-save annulée (écrasement détecté)`.',
      'GARDE-FOU SERVEUR — Route PATCH `/api/sign/templates/[id]` retourne 409 Conflict si le payload tente de vider une collection (documents/wizard_steps/recipients_schema) alors que la DB en contient. Override possible via `?confirm_wipe=1` (action explicite uniquement). Double protection client+serveur.',
      'Règle d\'incohérence — checkboxes groupées : quand une checkbox appartient à un groupe avec une règle (SelectExactly/AtLeast/AtMost), son flag `required` individuel est ignoré partout (validation Suivant, calcul allRequired, toast « Tout obligatoire »). La règle du groupe est la seule source de vérité. Évite l\'absurdité « Oui ET Non doivent être cochés ». Auto-décoche required:false à la création d\'un groupe.',
      'Validation groupe en wizard FIXÉE — `SignWizard.validateCurrentStep` vérifie maintenant les règles de groupe. Message d\'erreur précis : « Etes vous au chomage ? : sélectionne exactement 1 case (actuellement 0) ». Plus de skip silencieux du Suivant.',
      'Couleurs des rôles personnalisables — palette 8 couleurs (vert, orange, bleu, violet, rose, cyan, indigo, rouge) sous chaque rôle. Le PDF, les badges et les checkboxes héritent automatiquement de la couleur choisie.',
      'Mode Wizard : regroupement visuel par section — en-tête de section éditable inline (clique pour renommer, Enter pour valider, Escape pour annuler — propagé à tous les fields de la section). Toggle « Tout obligatoire » bascule required sur tous les fields de la section (excepté checkboxes groupées). Champs indentés sous l\'en-tête.',
      'Mode Document : infos du groupe au clic sur une case — sélectionner une checkbox groupée affiche directement les membres, la règle, les pages et les noms des autres cases. Plus besoin de chercher quelles cases vont ensemble.',
      'Chatbot Assistant IA template SUPPRIMÉ — retour utilisateur « ne marche pas ». Composant `TemplateAssistantBar.tsx` + route `/api/sign/templates/[id]/assistant` retirés du code. Le bouton « Améliorer avec l\'IA » (détection auto des fields via Claude Vision sur PDF) reste : c\'est un endpoint séparé (`enrich-with-ai`) qui fonctionne.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.8.10 — TemplateEditor : sections + groupes + couleurs rôles + validation wizard
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.8.10',
    date: '2026-05-17',
    label: 'Éditeur template : sections, groupes visualisés, couleurs rôles, validation wizard groupes',
    features: [
      'Couleurs des rôles personnalisables (palette 8 couleurs) — chaque rôle peut être recoloré via les pastilles sous le sélecteur signer/cc. Le PDF + les badges + les checkboxes héritent automatiquement de la couleur choisie.',
      'Mode Wizard : regroupement visuel par section — quand des champs partagent une « Section d\'affichage », un en-tête « § NomSection » s\'affiche au-dessus avec un toggle « Tout obligatoire » qui bascule required sur tous les champs de la section d\'un clic. Les champs de la section sont indentés sous l\'en-tête. Plus besoin d\'ouvrir chaque champ pour vérifier sa section.',
      'Mode Document : infos du groupe au clic sur une case — sélectionner une checkbox groupée affiche maintenant directement la liste des membres du groupe, leur règle (Exactement N / Au moins / Au plus), les pages concernées et les noms des autres cases. Plus besoin de chercher quelles cases vont ensemble.',
      'Validation groupe en wizard (bloque Suivant) — `areAllRequiredFieldsFilled` vérifie maintenant les règles de groupe (SelectExactly/SelectAtLeast/SelectAtMost). Le bouton Suivant reste désactivé tant que la règle n\'est pas respectée. Plus aucun skip silencieux d\'un groupe « Exactement 1 ».',
      'Assistant IA template fermé par défaut — la bulle minimisée s\'affiche en bas à droite (cliquer pour ouvrir). Plus de panneau qui s\'auto-ouvre et masque l\'éditeur.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.8.9 — Hotfix : double email signé quand consultant == admin == signataire
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.8.9',
    date: '2026-05-17',
    label: 'Hotfix — Double email signé pour le consultant qui est admin + signataire',
    features: [
      'HOTFIX — João recevait 2 emails « Document signé » pour un même envoi : un en tant que destinataire (« João Barbosa ») + un en tant qu\'admin (« L-Agence SA (admin) »). Cause : le check anti-doublon `recipients.some(r => r.email.toLowerCase() === adminEmail.toLowerCase())` ne faisait pas `.trim()` → si un email avait un espace ou casing différent, le doublon n\'était pas détecté. Solution : refacto avec Set + helper normalizeEmail() (lowercase + trim) appliqué aux 2 côtés. Plus de doublon possible. Bonus : « L-Agence SA (admin) » → « L-Agence (admin) » (cohérent avec cleanup v2.8.7).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.8.8 — Portail client : « Bientôt disponible » sur Rapports
  //          + Notes partagées candidat (consultant ↔ client)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.8.8',
    date: '2026-05-15',
    label: 'Portail client — Rapports « Bientôt disponible » + Notes partagées',
    features: [
      'FEATURE — Notes partagées sur un candidat (visibles consultant L-Agence + client via portail). Bouton « 📝 Notes » sur card candidat portail public + sur header fiche candidat dashboard. Compteur de notes affiché en badge. Modal lisible avec différenciation visuelle (bleu = client, jaune = consultant). Composer avec ⌘+Enter pour envoyer. Le consultant peut supprimer ses propres notes. Migration DB : table candidat_notes_partagees + 2 endpoints API (admin + portail public, 3-checks ownership pattern #60).',
      'UX — Onglet « Rapports » du portail client affiché comme « Bientôt disponible ». Évite qu\'un client tombe sur un module pas encore finalisé. Le bouton « Rapports » sur les cards candidat reste visible mais arrive sur un écran d\'attente avec message « Cette fonctionnalité arrive prochainement ». Badge « Bientôt » sur l\'onglet. RapportsTab existant préservé (commenté), réactivable en une ligne.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.8.7 — Sign : Email cleanup (Objet supprimé, "L-Agence" au lieu de
  //          "L-AGENCE SA", pluriel/singulier docs) + bouton Moi auto-fill
  //          + modal Paramètres template (nom/description/message défaut)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.8.7',
    date: '2026-05-15',
    label: 'Sign — Email cleanup + Moi auto-fill + modal Paramètres template',
    features: [
      'FEATURE — Bouton « 👤 Moi » sur chaque carte destinataire dans /sign/new. Click → auto-remplit prénom + nom + email + téléphone depuis ton user_metadata. Évite de retaper tes coordonnées à chaque envoi quand tu es signataire.',
      'FEATURE — Modal « ⚙️ Paramètres » template (nouveau menu item dans le ⋮ de /sign/templates). Édite nom + description + message par défaut sans ouvrir l\'éditeur visuel. L\'ancien « Modifier » est devenu « 📝 Éditeur visuel » (pour fields/positions). Le message par défaut se pré-remplit auto dans le champ Message de /sign/new quand le template est sélectionné.',
      'UX — « Objet » supprimé de /sign/new : champ jamais utilisé (code mort), le subject email est auto-généré depuis le Titre. Simplifie l\'UI.',
      'UX — Email cleanup : « L-AGENCE SA » → « L-Agence » dans header + footer + sender notif + text fallback. Helper normalizeSenderName() retire suffixes juridiques (SA, SARL, GmbH, AG, etc.) + Capitalize si UPPERCASE.',
      'UX — Pluriel/singulier cohérent dans tous les emails : 1 doc → « document à signer », 2+ docs → « documents à signer ». Appliqué partout : subject, headline, CTA bouton, body, fallback texte. 3 templates impactés : invite, rappel, completed.',
      'DB — Migration v286_template_default_message : nouvelle colonne sign_templates.default_message TEXT (pré-fill optionnel du champ Message de /sign/new).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.8.6 — Hotfix REQUEST_HEADER_TOO_LARGE (kill Service Worker corrompu)
  //          + rename template inline + middleware auth sur 8 routes
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.8.6',
    date: '2026-05-15',
    label: 'Hotfix 494 (kill Service Worker) + rename template + middleware auth',
    features: [
      'HOTFIX CRITIQUE — REQUEST_HEADER_TOO_LARGE (494) sur talent-flow.ch. Cause : le Service Worker /sw.js avait stocké en Cache API des réponses contenant des cookies cumulés au fil des sessions Supabase Auth. Au prochain fetch, le SW servait ces caches → les cookies accumulés étaient renvoyés au serveur → dépassait la limite Vercel 16KB → 494 même en navigation privée (le SW persiste cross-session sur certaines configs). Solution : sw.js réécrit en KILL SWITCH (unregister + purge tous caches au prochain visit). Layout (landing) modifié pour unregister tout SW existant + clear caches.keys(). PWA temporairement désactivée — pourra être réactivée plus tard quand on aura besoin.',
      'FEATURE — Renommer template inline depuis /sign/templates/{id}/edit. Click sur le nom (avec icône stylo en hover) → input éditable avec bordure pointillée. Enter ou blur → PATCH /api/sign/templates/{id} avec { name }. Escape → annule. Toast "Nom du template mis à jour ✓".',
      'SÉCURITÉ — Middleware : 8 routes dashboard étaient accessibles sans auth (affichaient juste "introuvable" via RLS mais pas de redirect login). Ajout à isProtectedRoute : /sign (sauf /sign/v/[token] qui reste publique), /clients, /missions, /alertes, /activites, /outils, /import-masse. Maintenant : tout user non authentifié sur ces routes est redirigé vers /login?next=...',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.8.5 — Sign : Signature pré-enregistrée consultant + page Merci
  //          + certificat séparé + 12 fixes UX post-déploiement v2.8.4
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.8.5',
    date: '2026-05-15',
    label: 'Sign — Signature pré-enregistrée + page Merci + certificat séparé',
    features: [
      'FEATURE — Signature manuscrite pré-enregistrée (TalentFlow Sign). Page /parametres/profil : nouvelle card "Ma signature manuscrite" → SignaturePad → stockée dans auth.users.raw_user_meta_data.preset_signature_data_url. À l\'envoi /api/sign/envelopes/[id]/send : si le créateur est dans les destinataires ET a une preset signature → auto-appose + skip son étape + déclenche email candidat direct. Skippe le flow secrétaire (qui n\'est pas dans les destinataires). Toast spécifique "Ta signature a été apposée automatiquement".',
      'FEATURE — Page Merci instantanée après finalize sur /sign/v/[token]. Avant : on restait sur le viewer avec bandeau vert → user devait hard-refresh pour voir l\'état complet. Maintenant : transition immédiate vers une page CenteredCard avec logo L-Agence + check vert + "Merci pour votre signature !" (cohérent avec l\'écran "Document déjà signé"). Évite aussi les bugs de modal qui se rouvrait sur le viewer en arrière-plan.',
      'FEATURE — Certificat séparé du contrat. Avant : appendCertificatePage ajoutait une page certificat en fin de chaque PDF signé. Maintenant : nouvelle fonction generateCertificatePdf() produit un PDF certificat STANDALONE. signed_pdf_paths contient désormais [contrat.pdf, Certificat de signature - contrat.pdf]. Téléchargeables indépendamment via la page détail enveloppe (bouton ZIP ou par doc).',
      'UX — Certificat exclu des emails completed. Avant : tous les destinataires recevaient contrat + certificat → pollution boîte candidat. Maintenant : filter `!d.name.startsWith("Certificat de signature")` dans attachments. Le certificat reste accessible UNIQUEMENT via la page détail /sign/[envelopeId] pour le créateur / admin L-Agence.',
      'UX — Plus de double email pour le consultant. Avant : consultant recevait "Toutes les signatures collectées" (sendSenderNotif) + "Documents signés" (sendSignCompletedEmail) → doublon. Maintenant : skip sendSenderNotif si le sender est DANS les recipients (il reçoit déjà le completed email avec PDF en PJ).',
      'FIX CRITIQUE — PDF generator stampait MAL les signers 0-based. recipientOrder = recIdx + 1 forçait 1-based alors que les fields de l\'éditeur TF Sign sont 0-based. Conséquence : la signature du consultant (rôle 0) n\'était JAMAIS stampée sur le PDF final. Fix : utilise rec.order réel + fallback `f.recipientOrder ?? 1` (cohérent avec PublicFieldsLayer + verify-token).',
      'FIX — Vraies signatures previous signers (vue candidat). verify-token n\'injectait pas signature_data_url des previous signers dans previousFieldValues → le candidat voyait juste "✓ Signé" texte au lieu de l\'image. Maintenant : pour chaque field signature/initial du previous signer, on injecte le data URL → le candidat voit la vraie signature consultant.',
      'FIX — Modal Terminer ne s\'ouvre plus 2× (race condition sign-field POST). handleFinalize check étendu : state local OU signature persistée en DB (data.recipient.signature_data_url). Rehydrate state local si seule la version DB est connue.',
      'FIX — Brouillon vide au retour de l\'éditeur. Le filtre parent_template_id côté API GET excluait les ad-hoc nécessaires au lookup brouillon. Maintenant : API renvoie tout, filtrage côté front. Dropdown /sign/new affiche l\'ad-hoc actuel avec son nom propre (sans "[Envoi] ").',
      'FIX — Stamp OFF par défaut sur upload contrat. Avant : pill orange "Stamp L-Agence ✓" cochée par défaut → user devait décocher. Maintenant : storage_path initial = path_original (OFF). User active manuellement via le pill.',
      'FIX — Rôles ajoutés dans éditeur invisibles dans /sign/new. Filtre s.order > 0 excluait order=0. Corrigé en `>= 0`.',
      'UX — Footer audit ZertES PDF réduit (50% plus fin). Hauteur 30→16pt, textes 7pt/6pt → 5.5pt/5pt. Lisible mais ne cache plus les mentions du contrat en bas de page.',
      'FIX — Page blanche en tête du PDF certificat (PDFDocument.create() crée page implicite côté viewers macOS Aperçu). Solution : remove pages préliminaires après load.',
      'UX — Champ Catégorie supprimé de /sign/new (auto-déduit depuis template_category). "ÉTAPE 0" → "ÉTAPE 1" (1-based humain). Page détail enveloppe affiche badges [ÉTAPE 1] [Candidat] au lieu de juste "Signataire".',
      'UX — Page /sign/v/[token] : logo L-Agence officiel sidebar header (remplace badge ⚡ TalentFlow noir) + écrans loading/erreur (CenteredCard).',
      'SÉCURITÉ — Audit logo emails : 11 templates uniformisés sur logo-agence-officiel-noir.png (200×42 PNG transparent). Avant : Sign emails utilisaient texte Georgia, auth/admin utilisaient badge ⚡ noir, france-travail/rapport-heures sans logo. Liste documentée + script audit bash en mémoire.',
      'DB — Migration v280_template_parent_id : sign_templates.parent_template_id distingue ad-hoc des vrais templates. Backfill rétro des "[Envoi] ..." existants.',
      'DEV — .env.local : NEXT_PUBLIC_APP_URL repassé en http://localhost:3001 (était 192.168.1.228 → liens cassés sur Mac dev).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.8.4 — Sign : Pipeline contrat L-Agence (stamp letterhead temps réel)
  //          + audit logo emails + sync rôles + fixes signature multi-destinataires
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.8.4',
    date: '2026-05-15',
    label: 'Sign — Pipeline contrat L-Agence (stamp temps réel) + audit logo emails',
    features: [
      'FEATURE — Sign : nouveau pipeline « Contrat de travail ». Upload du PDF brut → 2 versions stockées Storage (original + stampé logo+adresse L-Agence page 1). Toggle pill par doc « + Stamp L-Agence ↔ ✓ Stamp L-Agence » en temps réel, sans nouvel appel serveur. Zone upload + toggle visibles uniquement pour template catégorie contrat. Plus de warning rouge.',
      'FIX CRITIQUE — Sign : `PublicFieldsLayer` traitait `recipientOrder=0` comme falsy via `|| 1`. Le 1er destinataire (curOrder=1) voyait TOUS les fields recipientOrder=0 + signait 2 zones d\'un coup. Corrigé en `?? 1`. + `verify-token` utilise désormais `recipient.order` réel (0-based ou 1-based) au lieu de forcer `idx+1`.',
      'FIX — Sign : brouillon vide au retour de l\'éditeur. Cause : mon filtre `parent_template_id IS NULL` côté GET /api/sign/templates excluait les templates ad-hoc nécessaires au lookup du brouillon. Solution : l\'API renvoie tout, le filtrage des ad-hoc se fait côté front (dropdown + liste templates).',
      'FIX — Sign : rôles ajoutés dans l\'éditeur n\'apparaissaient pas dans /sign/new. Cause : `s.order > 0` excluait order=0. Corrigé en `>= 0`.',
      'FEATURE — Sign : sync bidirectionnelle rôles. `roleName` éditable dans /sign/new (input avec dashed border au focus). PATCH /api/sign/envelopes propage recipients → recipients_schema du template ad-hoc lié. POST création template ad-hoc copie les roleName du parent.',
      'UX — Sign : affichage rôles dans /sign/[envelopeId]. Badges colorés `ÉTAPE 1` (jaune brand) + `Candidat`/`Consultant` (surface) à côté du nom destinataire, au lieu de juste « Signataire ».',
      'UX — Sign : « ÉTAPE 0 » → « ÉTAPE 1 » (affichage 1-based humain au lieu du 0-based interne) dans RecipientsGroup.',
      'UX — Sign : champ « Catégorie » supprimé de /sign/new. Auto-déduit depuis template (`template_category` → `document_category` : contrat/mappe/autres).',
      'UX — Sign : skip auto-notification « ✍️ X a signé » quand le sender EST le signataire (cas le plus fréquent : consultant qui signe son propre envoi). Skip aux 2 endroits dans /api/sign/finalize (signature finale + signature séquentielle intermédiaire).',
      'UX — Sign : page /sign/v/[token] affiche le logo L-Agence officiel (1) en haut des écrans loading/erreur (CenteredCard) et (2) en haut de la sidebar à la place du badge ⚡ TalentFlow.',
      'SÉCURITÉ — Templates email : audit exhaustif + uniformisation logo L-Agence officiel (logo-agence-officiel-noir.png, 200×42) dans les 11 templates email TalentFlow/L-Agence. Avant : Sign emails utilisaient texte Georgia, auth/admin utilisaient badge ⚡ TalentFlow sur fond noir, france-travail/rapport-heures sans logo. Maintenant : tous cohérents. Liste documentée en mémoire pour éviter régression.',
      'DB — Migration v280_template_parent_id : `sign_templates.parent_template_id UUID REFERENCES sign_templates(id)` + index partiel. Distingue les templates ad-hoc (créés auto à chaque envoi pour stocker docs override) des vrais templates réutilisables. Backfill rétro des templates « [Envoi]... » existants. Filtrage UI uniquement, les ad-hoc restent fetchables par ID pour le lookup brouillon.',
      'PATTERN — Stamp PDF papier à en-tête : nouvelle fonction `stampLAgenceLetterhead()` dans `lib/sign/pdf-stamp.ts`. Embed logo carré noir (branding/l-agence-logo-noir.png) en haut-gauche + barre footer noire (tel/email/adresse + URL) en bas. Appliqué via `/api/sign/upload` quand letterhead=lagence. NE PAS confondre avec le logo officiel emails (logo-agence-officiel-noir.png transparent) — le stamp PDF imite le papier imprimé.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.8.3 — Feedback "Créer le groupe" + default SelectExactly
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.8.3',
    date: '2026-05-14',
    label: 'Sign — Feedback Créer le groupe checkboxes',
    features: [
      'FIX — "Créer le groupe" Mode Document : toast de confirmation explicite ("Groupe « X » créé · 2 cases · Exactement 1").',
      'UX — Si les cases sont DÉJÀ groupées, message indique "remplacement appliqué" (avant : silencieux → l\'utilisateur croyait que rien ne se passait).',
      'UX — Bouton affiche "✓ Créé !" pendant 500ms puis revient à "Créer le groupe".',
      'UX — Reset auto du formulaire (label vidé, X=1) après création pour enchaîner un autre groupe.',
      'UX — Default règle passe de "Au moins X" à "Exactement X" (cas le plus fréquent pour Oui/Non = radio).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.8.2 — Chatbot template : modal de confirmation lisible et éditable
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.8.2',
    date: '2026-05-14',
    label: 'Sign — Modal de confirmation chatbot lisible + éditable',
    features: [
      'UX — Modal "Confirmer les modifications" : noms HUMAINS des champs (via getFieldDisplayLabel) au lieu des UUIDs DocuSign tronqués.',
      'UX — Chaque modification proposée peut être DÉCOCHÉE individuellement (checkbox jaune) avant d\'appliquer.',
      'UX — Toutes les modifications peuvent être ÉDITÉES inline avant apply : libellé, annotation, section, valeur de condition, opérateur, action, triggerField (dropdown avec optgroup), règle de groupe, etc.',
      'UX — Le bouton "Appliquer (N)" affiche le compteur de modifications actives. Si l\'assistant s\'est trompé sur une assomption, tu corriges sans re-prompter.',
      'UX — Si l\'assistant indique "Hypothèse" (champ ambigü), le warning amber s\'affiche en haut du modal pour t\'inviter à vérifier.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.8.1 — Chatbot template : panneau flottant déplaçable + redimensionnable
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.8.1',
    date: '2026-05-14',
    label: 'Sign — Chatbot panneau flottant',
    features: [
      'UX — Chatbot IA passe d\'une barre fixed bottom à un panneau FLOTTANT déplaçable (header drag) et redimensionnable (corner bas-droit).',
      'UX — Bouton "minimiser" → réduit le panneau en bulle 56×56 cliquable n\'importe où.',
      'UX — Position + taille + état (minimisé/ouvert) persistés en localStorage (clé tf-assistant-window-v1).',
      'UX — Clamp automatique de la position quand le viewport change (resize fenêtre).',
      'UX — Largeur min 320 / max 900, hauteur min 280 / max 800.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.8.0 — Assistant IA chatbot dans l'éditeur de templates Sign
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.8.0',
    date: '2026-05-14',
    label: 'Sign — Assistant IA template (chatbot)',
    features: [
      'FEATURE — Sign : barre de chat IA en bas de l\'éditeur de template. Configure les champs par commande naturelle ("Rends Email obligatoire", "Cache ce champ si Suisse", etc.).',
      'UX — Sign : barre réduite 48px (toujours visible), expand au clic avec historique des 6 derniers messages et suggestions contextuelles selon le champ sélectionné.',
      'UX — Sign : modal de confirmation portalisé avant d\'appliquer les changements (montre le détail de chaque modification proposée).',
      'API — Nouvelle route /api/sign/templates/[id]/assistant : Claude Sonnet 4.6 reçoit le contexte template + commande → retourne JSON typé (action / explanation / unsupported). Anti-hallucination : validation des fieldId/stepId côté serveur.',
      'API — Nouvelle route /api/feedback/feature-request + table feature_requests (RLS user-isolated) pour collecter les demandes bloquées par l\'IA ("cette feature n\'existe pas encore").',
      'Capacités assistant : set_required, set_label, set_help_text, set_section, set_section_description, set_default_checked, add_condition, remove_condition, move_to_step, create_step, group_fields.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.7.9 — Dropdowns conditions lisibles (fin des UUIDs DocuSign)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.7.9',
    date: '2026-05-14',
    label: 'Sign — Dropdowns conditions lisibles',
    features: [
      'UX — Sign : les dropdowns "Si ce champ" dans l\'éditeur de conditions affichent maintenant un nom lisible (section + tooltip) au lieu des UUIDs DocuSign ("Case à cocher d109a26e-..." → "Permis de conduire — Oui").',
      'UX — Sign : options groupées par section (optgroup HTML) pour retrouver facilement les champs.',
      'UX — Sign : helper `getFieldDisplayLabel` partagé entre tous les éditeurs de conditions (Mode Document, Mode Wizard, multi-select).',
      'UX — Sign : bloc "Conditions actives" affiche également les noms lisibles.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.7.8 — Auto-cochage conditionnel checkboxes
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.7.8',
    date: '2026-05-14',
    label: 'Sign — Auto-cochage conditionnel',
    features: [
      'UX — Sign : 2 nouvelles actions dans les règles conditionnelles : "Auto-cocher" et "Auto-décocher" (uniquement sur checkboxes).',
      'UX — Sign : exemple d\'usage — Impôts à la source auto-coché Non si Suisse ou Permis C, Oui sinon.',
      'UX — Sign : le candidat peut toujours override l\'auto-check en cliquant manuellement.',
      'UX — Sign : auto-check pris en compte au PDF stamping final (la case apparaît cochée dans le PDF signé).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.7.7 — Refonte UX éditeur templates Sign (audit-driven)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.7.7',
    date: '2026-05-14',
    label: 'Éditeur templates Sign — UX & corrections audit',
    features: [
      'UX — Sign : preview iPhone stable (snapshot 700ms + React.memo + contain:layout) + scale responsif sur petits écrans + ResizeObserver.',
      'UX — Sign : Mode Wizard et Mode Document synchronisés (Texte du champ = label+tooltip, Annotation/Instruction, Section, Étape).',
      'UX — Sign : annotation de section synchronisée entre tous les fields siblings (édition 1× → propagation).',
      'UX — Sign : règles checkbox group (SelectExactly N=1 = radio, SelectAtMost N>1 = bloque excess) appliquées au signing.',
      'UX — Sign : auto-fill modifiable par défaut (verrou optionnel), nouvelle source phone pour les fields Numéro.',
      'UX — Sign : étoile required + helpText cohérents entre les 2 modes ; label masqué dans cards mode si vide.',
      'UX — Sign : multi-select Mode Document avec "Ajouter condition aux N champs" + "Déplacer vers étape wizard" + "Tout effacer conditions".',
      'UX — Sign : badge violet ⚙N visible en haut-droite des champs avec conditions (PDF Mode Document).',
      'UX — Sign : sélecteur "Filtrer par étape" Mode Document — focus visuel sur 1 étape, autres champs grisés.',
      'UX — Sign : double-clic sur outil palette → placement au centre de la page (raccourci 1-clic).',
      'UX — Sign : bouton "Champs orphelins" accessible aussi en Mode Document (modal partagé).',
      'UX — Sign : "Aperçu live" actif par défaut Mode Wizard ; bouton "Enregistrer" ne recharge plus la page.',
      'PERF — Sign : pagination IA enrichment (3 docs/batch si template > 5 docs) → évite timeout Vercel 120s.',
      'FIX — Sign : "Re-générer auto" supprimé (cause de bugs dates semaine) — utilise "Améliorer avec l\'IA".',
      'FIX — Sign : flicker bouton "Enregistrer" pendant auto-save silencieux → state manualSaving séparé.',
      'FIX — Sign : suppression DocuSign Envelope ID dans le PDF final signé (couvert par notre header).',
      'FIX — Sign : multi-patch atomique (onPatchManyMixed) — fix bug "condition s\'ajoute seulement sur 1 champ".',
      'FIX — Logo L-Agence dans le CV personnalisé : hauteur corrigée (ratio 722×147 au lieu de 550×170).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.7.6 — Fix logo CV personnalisé (ratio hauteur corrigé)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.7.6',
    date: '2026-05-13',
    label: 'Fix logo CV personnalisé',
    features: [
      'FIX — Logo L-Agence dans le CV personnalisé : hauteur corrigée (ratio 722×147 au lieu de l\'ancien 550×170).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.7.5 — Durcissement sécurité + dette technique (17 fixes audit global)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.7.5',
    date: '2026-05-12',
    label: 'Durcissement sécurité (17 fixes audit global)',
    features: [
      'SÉCURITÉ — requireAuth() + whitelist Supabase sur /api/cv/print, /api/cv/rotate, /api/cv/docx-images (anti-SSRF).',
      'SÉCURITÉ — requireAuth() sur /api/rapport-heures/send-email, send-whatsapp, /api/bug-report (anti-spam).',
      'SÉCURITÉ — Bump Next.js 16.1.7 → 16.2.6 (CVE middleware bypass, SSRF WS, cache poisoning).',
      'SÉCURITÉ — Headers HSTS + X-Frame-Options + nosniff + Referrer-Policy + Permissions-Policy.',
      'SÉCURITÉ — Helper requireSecretariatAccess() sur 19 routes /api/secretariat/* (consultants bloqués, secrétaires + admin OK).',
      'SÉCURITÉ — Webhook WhatsApp : vérification signature Meta X-Hub-Signature-256 (HMAC-SHA256, mode dégradé si WHATSAPP_APP_SECRET absent).',
      'SÉCURITÉ — CRON_SECRET strict sur 8 crons : route bloquée (401) si secret absent (avant : route ouverte).',
      'PERF — maxDuration crons document-alerts et auto-arret-reports : 60s → 300s (anti-timeout).',
      'UX — 12 alert() natifs remplacés par toasts Sonner (cohérence design V2).',
      'NETTOYAGE — 4 composants morts supprimés (ReminderPopup, ClientSearch, CvPdfViewer, usePipeline).',
      'NETTOYAGE — 4 routes API orphelines supprimées (sharepoint/files, onedrive/reset-orphans, ml/insights, candidats/init-import-status).',
      'CODE — lib/utils/date.ts créé (source canonique formatDate/formatDateShort/formatDateTime/formatDateLongFr — migration progressive).',
      'UX — Bandeau erreur dashboard + page erreur /alertes (isError React Query, plus de page blanche si Supabase KO).',
      'DARK MODE — Couleurs erreur/neutres hardcodées migrées vers tokens CSS (FranceTravailComposer, BetaBadge).',
      'DB — 22 index FK manquants créés (migration add_missing_fk_indexes_v2_7_5) : missions.client_id, pipeline_rappels.*, historique_pipeline.*, emails_recus.*, etc.',
      'DB — Cleanup Storage one-shot : 3 842 fichiers (4.15 GB) supprimés du bucket cvs (temp_import vidé + doublons par candidat).',
      'DOC — CLAUDE.md : patterns #57-69 documentés (compliance, portail, sign détection IA, auto-save invisible, mode portail rapports, durcissements sécurité). Tableau pages mis à jour. Routes spéciales enrichies.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.7.4 — Détection auto IA des champs depuis le PDF (Claude Sonnet 4.6)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.7.4',
    date: '2026-05-12',
    label: 'Détection automatique des champs template via Claude Vision PDF',
    features: [
      'BOUTON "🔍 Détecter les champs automatiquement" — apparaît dans l\'éditeur de template (TemplateEditor) quand 0 champ est défini. Lance une analyse Claude Vision (Sonnet 4.6) du PDF natif et place automatiquement les champs détectés (nom/prénom, dates, signatures, checkboxes, etc.) en ~20-30s. Wizard steps construits automatiquement par sections logiques. Bouton amber large + sous-titre explicatif "L\'IA analyse votre PDF et place les champs en ~30s".',
      'BOUTON "✨ Améliorer avec l\'IA" — apparaît quand des champs existent déjà. Outline discret. Restructure les étapes du wizard et enrichit tooltips/conditions/listItems sans toucher aux positions/types des champs.',
      'SYSTEM_PROMPT ENRICHI L-AGENCE SA — Le prompt système intègre 10 conventions spécifiques de L-Agence : (1) signatures collaborateur GAUCHE / L-Agence DROITE, (2) Nom + Prénom toujours 2 fields séparés (jamais fullname), (3) format date suisse jj.mm.aaaa (dd.MM.yyyy), (4) vocabulaire CH (NPA, AVS, CCT, Helsana, SUVA, permis B/C/G/L), (5) pattern "Oui/Non" en 2 checkboxes adjacentes, (6) recipientOrder=1 candidat vs 2 consultant, (7) champs conditionnels avec required=false + helpText, (8) ne pas halluciner sur les pages de texte légal SECO du contrat cadre (7 pages CGV + 1 page signature), (9) autoFill=true pour firstname/lastname/email/company/title, (10) CHF uniquement pour monnaie.',
      'BUMP MODÈLE — Claude Sonnet 4-5 → 4-6 (plus précis sur la détection visuelle de champs denses comme la fiche d\'inscription L-Agence ~85 champs/page).',
      'BANNER SUCCÈS POST-DÉTECTION — Après détection, banner vert "✅ N champs placés automatiquement sur P page(s)". Le compteur de fields en bas du bandeau actions reflète le nouveau total.',
      'ÉTATS PROGRESSIFS — Spinner + texte "📄 Téléchargement du PDF…" puis "🤖 Claude analyse votre document…" pour feedback utilisateur pendant l\'attente (PDF natif Claude peut prendre 20-30s).',
      'CONFIRMATION AVANT RÉENRICHISSEMENT — Si des champs existent déjà, modal de confirmation avant de lancer l\'analyse (l\'opération restructure les étapes wizard, les champs eux-mêmes restent intacts).',
      'PARALLÉLISATION — Traitement des N documents en parallèle via Promise.allSettled (au lieu de séquentiel). Gain : 5 docs ~125s → ~35s (-72%). Évite le timeout Vercel 120s sur templates multi-PDF. placeholderToUuid rendu local à chaque doc (évite collision entre docs en parallèle).',
      'AJOUT PDF AU TEMPLATE EXISTANT (bug fix) — Nouveau bouton dashed "📄 Ajouter un PDF" dans le bandeau actions de TemplateEditor. Avant : UI manquante, impossible d\'ajouter un nouveau PDF après création du template. Maintenant : file picker (multi-fichiers, max 10, 50MB chacun), upload via /api/sign/upload, ajout au state docs, setDirty(true). Bascule auto sur le 1er PDF nouvellement ajouté.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.7.3 — Bouton mission → /sign/rapports/new pré-rempli (validation manuelle)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.7.3',
    date: '2026-05-12',
    label: 'Création lien rapport depuis mission — redirige vers /sign/rapports/new pré-rempli',
    features: [
      'CHANGEMENT — Le bouton "📋 Rapport" sur la liste missions ne crée plus le lien automatiquement. Il redirige vers /sign/rapports/new avec query params (candidat_id, candidat_nom, client_id, client_name, mission_id, metier) pour que l\'utilisateur choisisse le contact client et valide avant création.',
      'PRÉ-REMPLISSAGE — Au mount de /sign/rapports/new, lecture des query params : si candidat_id présent → fetch /api/candidats/[id] pour récupérer email + téléphone (pas dispo dans missions). Nom entreprise pré-rempli. Contact client + email RESTENT VIDES (l\'utilisateur les saisit explicitement). Titre auto "Rapport {candidat} — {client} ({metier})". Bandeau violet "🔗 Création depuis une mission".',
      'API — POST /api/admin/reports accepte désormais mission_id et le stocke dans report_links.mission_id (synchro auto des dates avec /api/missions PATCH inchangée).',
      'CLEANUP — Suppression de la route /api/admin/missions/[id]/create-report-link (créée en v2.7.1, plus utilisée).',
      'SUSPENSE — La page /sign/rapports/new utilise désormais useSearchParams → wrapper Suspense ajouté au top-level pour Next 16 prerendering (pattern obligatoire CLAUDE.md règle v1.9.78).',
      'BUG FIX — /missions/portails : ajout d\'un bouton "← Missions" en haut de page (oubli initial).',
      'MODE PORTAIL RAPPORTS — Nouveau toggle "🪟 Utiliser portail rapports" sur /sign/rapports/new ET /sign/rapports/[id]. Quand activé : (a) au moment de la signature candidat (status=candidate_signed), l\'email de notification va à clients.email (mail principal entreprise) au lieu du contact saisi sur le lien, (b) le lien dans l\'email pointe vers /client-portal/{slug}?tab=rapports (slug permanent) au lieu de /report/client/{token} (TTL 7j), (c) le client voit TOUS les rapports à valider en un seul endroit avec bouton jaune par rapport. Le token client_token reste généré (defensive, permet le fallback). Nouvelle colonne report_links.use_client_portal boolean DEFAULT false. Helper lib/report/portal-helper.ts (getOrCreateClientPortal) qui auto-crée le portail si absent au moment de l\'activation (Q4=B). Pour activer, le lien doit avoir un client_id lié en DB (sinon erreur 400 — le portail est indexé par client_id).',
      'PORTAIL CLIENT — Onglet "📋 Rapports" (2e onglet sur /client-portal/{slug}). Filtres "Tous / À valider / Validés". Groupage par candidat → photo carré + métier + count. Bouton jaune "Voir le rapport à valider →" qui régénère auto le token si expiré (POST refresh-token). Modal Aperçu PDF + Télécharger. Bandeau notes_candidat (amber) et notes_client (bleu). 3 nouvelles routes publiques (liste, document, refresh-token).',
      'NOTES CLIENT — Bouton "📝 Notes / Remarques" à côté de "Modifier les données" sur /report/client/[token]. Modal portalisé (300 chars). PATCH update-fields immédiat. Visible : admin tooltip 📝 SubmissionHistoryTable, candidat tooltip historique, portail client bandeau bleu, emails admin/candidat à la signature.',
      'DOWNLOAD + WHATSAPP — Sur /report/client/[token] : bouton "⬇️ Télécharger" (nouvelle route /api/reports/client/[token]/download génère PDF stampé à la volée si pas en Storage) + bouton "📱 WhatsApp" (wa.me?text=... avec lien PDF — le destinataire clique pour télécharger).',
      'EMAIL ALERTES CONFORMITÉ — Refonte routing : email récap quotidien envoyé UNIQUEMENT à info@l-agence.ch (toute l\'équipe sur cette boîte). Suppression du routage par consultant (plus d\'emails séparés par João/Seb). Rappels candidat J-30 / J-14 : destinataire = candidat, cc systématique à info@l-agence.ch.',
      'MODAL "MA MISSION" CANDIDAT — Clic sur card "Mes missions" sur /report/[slug] ouvre désormais un modal portalisé avec dates + durée calculée ("2 mois et 5 jours") + responsable + boutons Appeler/WhatsApp/Email. Plus de bascule formulaire (qui montrait le rapport déjà soumis en mode lecture vide). Bug 2 A.',
      'BOUTON RAPPORTS PORTAIL COLLABORATEURS — Nouveau bouton compact 🪟 "Rapports" sur chaque card candidat dans l\'onglet Collaborateurs qui bascule vers l\'onglet Rapports.',
      'BOUTON RETOUR PORTAIL — Sur /report/client/[token] en mode portail : bouton "← Portail" dans le header → retour à /client-portal/{slug}?tab=rapports sans devoir valider. Lookup auto serveur via use_client_portal + client_portals.slug.',
      'FIX BUG DATES FORMAT — Les fields type=date pré-remplis par auto-fill (Lundi/Mardi/.../Semaine N°) sont désormais VERROUILLÉS en lecture seule. Affichage respecte field.dateFormat (ex: "dd.MM" → "11.05") au lieu de l\'input HTML natif qui imposait jj/mm/aaaa tronqué dans les cellules étroites. Nouvelle prop lockedFields sur PublicFieldsLayer.',
      'FIX FORMAT WEEKLABEL — formatWeekLabel() inclut maintenant le n° de semaine ISO : "Semaine 20 du 11 au 17 mai 2026" partout (emails, header validation client, dashboard).',
      'EMAIL SIGNATURE — En mode portail, salutation = "Bonjour" sans nom de contact (l\'email part à l\'adresse principale entreprise, pas à un contact nommé). En mode direct, comportement original préservé ("Bonjour Marie,"). Candidat affiché avec métier entre parenthèses : "Mickael Voyenet (Chauffeur PL)".',
      'POLISH UI — Loader fade-in décalé sur 3 pages (portail, RapportsTab, page validation client). Card semaine portail rapports : suppression de la ligne client_name + métier redondante (déjà dans le header de groupe). Fix double "Semaine 20" sur header validation. Bouton retour "← Missions" ajouté sur /missions/portails.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.7.2 — Portail Client : onglet "Rapports d'heures"
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.7.2',
    date: '2026-05-12',
    label: 'Portail Client — 2e onglet "Rapports" (voir + valider + télécharger)',
    features: [
      'PORTAIL CLIENT — Navigation par onglets (👥 Collaborateurs / 📋 Rapports). Onglet actif souligné amber. URL ?tab=rapports pour deep-link. Badge rouge avec count des rapports en attente de validation sur l\'onglet Rapports.',
      'ONGLET RAPPORTS — Liste groupée par candidat puis par semaine (ISO). 3 états : ⏳ "À valider" (candidate_signed, amber + bouton Valider →), ✅ "Validé" (completed/client_signed, vert + Aperçu PDF + Télécharger), ✏️ "Brouillon" (draft, gris, lecture seule). Totaux calculés (h normales · h sup · repas · h dépl.) via sumSubmissionMetrics. Bandeau amber affichant notes_candidat sur les rapports à valider.',
      'FILTRES — Tous / À valider (badge count) / Validés. Filtre par défaut : "À valider" si count>0, sinon "Tous".',
      'TOKEN AUTO-RÉGÉNÉRÉ — Si client_token expiré (TTL 7j dépassé), le bouton "Valider" devient "🔄 Régénérer mon lien et valider →" qui appelle POST /api/client-portal/[slug]/rapports/[id]/refresh-token pour générer un nouveau token (crypto.randomUUID + TTL 7j) puis redirige vers /report/client/{token}. Le slug du portail prouve la légitimité du client — pas besoin de contacter L-Agence.',
      'APERÇU PDF — Modal portalisé (z-index 9999, ESC pour fermer) avec iframe vers /api/client-portal/[slug]/rapports/[id]/document?inline=1. Bouton Télécharger dans le header du modal. Si le PDF n\'est pas encore stampé en Storage (status=candidate_signed), il est généré à la volée via generateReportPdf (pattern #53).',
      'API — 3 nouvelles routes publiques : GET /api/client-portal/[slug]/rapports (liste + counts + totaux), GET .../[id]/document (proxy PDF avec ownership check), POST .../[id]/refresh-token (régen token). Toutes vérifient slug actif + report_link_clients.client_id = portal.client_id (ownership strict).',
      'SOURCE DES DONNÉES — Q1=B : on inclut TOUTES les submissions dont report_link_clients.client_id matche portal.client_id (historique élargi). Donc même après fin de mission, le client garde l\'accès à ses rapports passés pour la compta.',
      'AUCUNE MIGRATION SQL — Le portail s\'appuie sur les tables existantes (client_portals, report_links, report_submissions, report_link_clients). Aucune nouvelle dépendance npm.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.7.1 — Lien mission ↔ rapport : création 1-clic depuis la liste missions
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.7.1',
    date: '2026-05-12',
    label: 'Bouton "Créer lien rapport" depuis une mission + jours d\'arrêt désactivés',
    features: [
      'LISTE MISSIONS — Nouveau bouton 📋 dans la colonne Actions de chaque ligne. Si aucun rapport lié : outline (création 1-clic), si rapport existant : vert (ouvre le lien rapport). Désactivé avec tooltip "Mission incomplète" si la mission n\'a ni candidat ni client.',
      'CRÉATION AUTOMATIQUE — POST /api/admin/missions/[id]/create-report-link. Récupère candidat (prenom/nom/email/tel), client (nom + contact principal contacts[0]), métier (metier_display||metier), dates (date_debut/date_fin). Choisit automatiquement le template kind="report" le plus récent. Idempotent : si un lien existe déjà pour la mission, renvoie l\'existant.',
      'DB — Nouvelle colonne report_links.mission_id (FK ON DELETE SET NULL) + unique index partiel (1 mission ↔ 1 lien max). Nouvelle table report_auto_arret_log (dédup envois cron auto-arrêt).',
      'SYNC DATES — PATCH /api/missions/[id] propage automatiquement les changements date_debut/date_fin vers report_link_clients.mission_start_date/end_date. Aucune submission déjà signée n\'est modifiée — seulement le cadrage des semaines à venir.',
      'CARD MISSION LIÉE — Sur /sign/rapports/[id], affichage d\'une card violette "🔗 Mission liée" avec métier + client + période + bouton "Voir la mission". Cliquable vers /missions?highlight={mission_id}.',
      'JOURS D\'ARRÊT DÉSACTIVÉS — Sur /report/[slug], les jours couverts par un arrêt mission (lus depuis missions.arrets via report_links.mission_id) sont automatiquement grisés et bloqués en saisie. Le candidat ne peut pas y entrer d\'heures. Tooltip "Arrêt".',
      'CRON AUTO-ARRÊT — Nouveau cron /api/cron/auto-arret-reports (dimanche 20h UTC, Bearer CRON_SECRET). Pour chaque lien rapport rattaché à une mission, si un arrêt de ≥ 14 jours couvre toute la semaine qui vient de se terminer, envoie un email récapitulatif au créateur du lien + ADMIN_EMAIL (jamais au client ni au candidat). Dédup via report_auto_arret_log. PAS de signature, PAS de PDF — juste un email info HTML.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.7.0 — Compliance Documents : permis, CQC, identité + alertes + portail client
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.7.0',
    date: '2026-05-12',
    label: 'Compliance Documents — permis, CQC, identité + alertes + portail client',
    features: [
      'CONTEXTE — Un chauffeur PL a été arrêté à cause d\'un permis C échu (ni L-Agence ni le client ne l\'avaient vu venir). Cette release outille la gestion des documents de conformité pour éviter la récidive.',
      'FICHE CANDIDAT — Nouveau bouton 🛡 Conformité dans le header (à côté de Documents). Ouvre un panel CRUD complet : ajout/édition/suppression de documents (permis, CQC, identité, formations), upload recto/verso vers bucket privé, viewer plein écran, badges statut couleur (vert/jaune/orange/rouge). Si le candidat est détecté chauffeur (métier "Chauffeur PL" ou regex /chauffeur/i sur pipeline_metier||titre_poste, ou override manuel), affichage automatique d\'une banner amber + checklist des 3 documents obligatoires (Permis, CQC, Carte conducteur tachygraphe).',
      'MODAL MISSION — Champ métier auto-rempli (lecture seule) depuis la fiche candidat. Nouveau champ "Intitulé affiché (optionnel)" max 100 chars stocké dans missions.metier_display. Priorité d\'affichage liste/table : metier_display || metier.',
      'BLOCAGE CRÉATION MISSION CHAUFFEUR — Au POST /api/missions, si le candidat est chauffeur ET qu\'un document obligatoire est manquant ou expiré, l\'API renvoie 422 avec la liste des documents bloquants. L\'UI affiche un modal "Documents incomplets" avec liste + 2 boutons "Compléter docs" (redirect fiche candidat) / "Ignorer et créer quand même" (orange). Si l\'utilisateur ignore, une note auto est ajoutée à missions.notes avec son email et la liste des docs manquants.',
      'CLOCHE HEADER — Fusion dans NotificationBell existant : nouvelle section "🪪 Documents conformité" qui agrège pipeline_rappels + entretiens + alertes documents. Lien "Voir toutes les alertes →" dirige vers /alertes.',
      'PAGE /alertes — Liste filtrable (Tous / Expirés / <14j / 15-30j) + toggle "Mes candidats uniquement" (filtre par pipeline_consultant). KPI cards (Total/Expirés/Urgents/Attention). Badge "EN MISSION" si candidat actuellement déployé chez un client. Click row → fiche candidat.',
      'CRON QUOTIDIEN — Nouvelle route /api/cron/document-alerts (Bearer CRON_SECRET, 0 8 * * * via vercel.json). Email agrégé HTML envoyé chaque matin à 8h00 à ADMIN_EMAIL (récap global) + 1 email par consultant assigné avec ses propres candidats. Logo L-Agence, KPI row, tableau alertes coloré, bouton "Voir toutes les alertes →".',
      'PORTAIL CLIENT PUBLIC — Nouvelle page /client-portal/{slug} accessible sans auth (slug imprévisible 16 chars random). Le client voit la liste des candidats en mission active chez lui + leurs documents conformité (avec statut) + leurs documents legacy (CV, attestations). Photo, nom, métier, âge affichés. Bandeau "🚛 Chauffeur" si applicable. Aucune donnée sensible (marge, tarif) ne fuite. Footer avec contact L-Agence (tel + WhatsApp).',
      'GESTION PORTAILS — Nouvelle page /sign/portails (accessible via bouton "Portails" dans /sign). Liste des portails avec copy lien, ouvrir, désactiver/réactiver, supprimer. Modal de création avec autocomplete client + nom auto-rempli. Bandeau d\'info "URL imprévisible 16 caractères".',
      'DB — 3 nouvelles tables : document_types (catalogue seedé avec 8 types : Permis, CQC, Carte conducteur, ADR, FCO, Identité, Visa, Attestation), candidat_documents (instances par candidat + view candidat_documents_with_status calculée), client_portals (slug unique permanent, is_active toggle). 2 colonnes ajoutées : missions.metier_display, candidats.is_driver_override (NULL=auto / TRUE=forcé chauffeur / FALSE=forcé non-chauffeur).',
      'STORAGE — Nouveau bucket privé candidat-documents (service role only, 10 MB max par fichier, MIME limité à PDF/JPG/PNG/WebP). Path : {candidat_id}/{document_id}/{recto|verso}.{ext}.',
      'SÉCURITÉ — Toutes les routes API protégées par requireAuth() (sauf /api/client-portal/{slug} qui valide via slug imprévisible + is_active). Aucune donnée sensible candidat (marge, notes internes, téléphone) ne fuite côté portail public.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.6.17 — Rapports : correction semaine admin + préventif candidat/client
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.6.17',
    date: '2026-05-12',
    label: 'Rapports : corriger la semaine d\'un rapport signé + alerte préventive',
    features: [
      'CURATIF — Nouveau bouton "🔄 Corriger semaine" dans /sign/rapports/[id] (colonne Actions). Visible sur toute submission signée (candidat_signed/client_signed/completed). Au clic, modal avec sélecteur des 16 dernières semaines + textarea raison obligatoire (10-500 chars) + récap visuel "S20 → S19". Permet à admin ET consultants de corriger.',
      'PIPELINE CORRECTION — La lib correct-week.ts (1) check conflit (refuse si une autre submission existe déjà pour la semaine cible, 409), (2) UPDATE week_start + week_end + recalcul des field_values auto-fill (dates par jour + numéro de semaine), (3) régénère le PDF stampé avec les bonnes dates (signatures préservées), (4) append metadata.corrections (audit historique), (5) INSERT report_audit_log action="week_corrected".',
      'EMAIL DÉDIÉ — Nouveau template sendCorrectionEmail (3 audiences : admin/créateur + candidat + client). Logo L-Agence, pavé "S{ancien} → S{nouveau}", bandeau raison de la correction, PDF corrigé en PJ. Le candidat reçoit en plus une note "la semaine X est de nouveau disponible dans ton portail". Aucune mention "corrigé" sur le PDF lui-même (juste les nouvelles dates).',
      'PRÉVENTIF CANDIDAT — Le ConfirmDialog avant l\'envoi au client est enrichi : titre "Vérifie la semaine avant d\'envoyer", pavé jaune "Tu déclares les heures de Semaine {N} — Semaine du X au Y", bandeau rouge "⚠️ Une fois signé, seul un administrateur peut corriger la semaine."',
      'PRÉVENTIF CLIENT — Remplacement du confirm() natif par un dialog stylé vouvoiement : "Vérifiez la semaine avant de signer", pavé jaune avec nom candidat + semaine en gros, bandeau rouge "⚠️ Votre signature est définitive. En cas de doute, refusez et contactez L-Agence."',
      'DB — Mini-migration : étend le CHECK constraint report_audit_log.action avec la valeur "week_corrected". Aucune nouvelle table.',
      'CONTEXTE — Cas réel Ismael Jarmoun (12/05/2026) : a déclaré ses heures sur la mauvaise semaine (S20 au lieu de S19), client a signé sans rien remarquer. Correction effectuée en prod via script one-shot. Cette release outille la correction pour que João + Seb puissent le faire eux-mêmes depuis le dashboard, et évite la récidive grâce aux alertes préventives candidat + client.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.6.16 — Libellé bouton "Uniformiser" : clarifie "N autres champs"
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.6.16',
    date: '2026-05-11',
    label: 'Libellé bouton plus clair ("N autres champs")',
    features: [
      'CLARIFICATION LIBELLÉ — Le bouton affichait "Uniformiser les 5 similaires" alors qu\'il y a 6 champs au total. Le 5 = les autres champs (le champ sélectionné = la référence, donc non compté). Renommé en "Uniformiser N autres champs (taille + ligne)" pour éviter la confusion. Tooltip ajoute "(ce champ-ci sert de référence)".',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.6.15 — Matching "similaires" ignore les noms de jours (Lun/Mar/...)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.6.15',
    date: '2026-05-11',
    label: 'Uniformiser similaires : match aussi sans nom de jour',
    features: [
      'MATCHING ENCORE PLUS TOLÉRANT — Les noms de jours (Lundi, Mardi, ..., Dimanche) sont désormais retirés du nom du champ lors de la comparaison. Conséquence : "Heures normales Lundi" matche "Heures normales Samedi" (et tous les autres jours) automatiquement, même si l\'admin a renommé un seul champ avec un suffixe différent.',
      'Sécurité préservée : type identique requis, placeholder "0" exclu. Le tooltip diagnostique du bouton affiche toujours la liste des champs trouvés pour vérification.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.6.14 — Auto-fill semaine pour champs date avec format WW
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.6.14',
    date: '2026-05-11',
    label: 'Champ date "Semaine WW" auto-rempli depuis la semaine sélectionnée',
    features: [
      'AUTO-FILL NUMÉRO DE SEMAINE — Tout champ de type date avec un format contenant "WW" (Semaine WW, Sem. WW, etc.) est désormais auto-rempli avec la date du lundi de la semaine sélectionnée par le candidat. Affiché en "Semaine 20" via le format. Pas besoin de wizardSection jour : le format WW déclenche l\'auto-fill directement.',
      'Appliqué côté candidat (page form) ET côté client (résolution des valeurs auto-fill candidat dans le PDF stampé).',
      'Cas d\'usage : champ "Numéro de la semaine" en haut du rapport → s\'affiche automatiquement "Semaine 20" sans saisie manuelle.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.6.13 — Matching "similaires" tolérant (tooltip OR label) + tooltip détaillé
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.6.13',
    date: '2026-05-11',
    label: 'Bouton "Uniformiser" : matching plus tolérant (résout cas 5/6 fields)',
    features: [
      'MATCHING SIMILAIRES PLUS TOLÉRANT — Avant : match exclusif sur tooltip OU label (le 1er non vide). Maintenant : match si AU MOINS UN nom commun entre tooltip ET label des 2 fields → résout le cas où un field a un tooltip personnalisé alors qu\'un autre garde son label DocuSign d\'origine.',
      'Sécurité : le type doit être identique (un date ne match pas un number même avec le même nom). Le placeholder DocuSign "0" est exclu pour ne pas créer de faux positifs.',
      'TOOLTIP DÉTAILLÉ — Le tooltip du bouton liste désormais les noms des champs trouvés (max 8 + "+N") avec leur wizardSection préfixée. Permet de diagnostiquer rapidement pourquoi un champ est exclu (= il n\'apparaît pas dans la liste).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.6.12 — "Uniformiser similaires" applique aussi le y (alignement vertical)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.6.12',
    date: '2026-05-11',
    label: 'Bouton "Uniformiser similaires" : taille + alignement vertical',
    features: [
      'BOUTON UNIFORMISER SIMILAIRES — Désormais applique en 1 clic : largeur + hauteur + position y (= alignement horizontal sur la même ligne du tableau). Le x de chaque champ est préservé pour ne pas casser les colonnes Lundi/Mardi/etc.',
      'Renommé "Appliquer cette taille aux N similaires" → "Uniformiser les N similaires (taille + ligne)" pour refléter le nouveau comportement.',
      'Tooltip détaillé : liste les 3 propriétés appliquées + explique pourquoi le x n\'est pas touché.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.6.11 — Smart snap aussi pendant le resize handle
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.6.11',
    date: '2026-05-11',
    label: 'Smart snap aussi sur le resize (handle coin bas-droit)',
    features: [
      'SMART SNAP RESIZE — Pendant le redimensionnement d\'un champ via la handle bas-droit, le coin bas-droit s\'aligne désormais aussi sur les bords des autres champs (left/center/right + top/middle/bottom). Lignes pointillées bleues affichées comme pour le drag. Override Cmd / Ctrl maintenu = resize libre sans snap.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.6.10 — Smart snap + aligner/égaliser/distribuer fields (éditeur template)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.6.10',
    date: '2026-05-11',
    label: 'Smart snap drag + Aligner / Égaliser / Distribuer (Figma-like)',
    features: [
      'SMART SNAP (FieldsCanvas) — Quand on drag un champ, il s\'aligne automatiquement avec les bords (left/center/right + top/middle/bottom) des autres champs de la même page. Lignes pointillées bleues affichées pendant le snap. Tolérance 6px. Override : Cmd (⌘) ou Ctrl maintenu = drag libre sans snap. Pas de snap sur multi-drag (comportement existant préservé).',
      'ALIGNER (multi-sélection) — Nouveaux boutons dans le panneau "N champs sélectionnés" : Aligner Gauche / Centre H / Droite + Aligner Haut / Centre V / Bas. Calcule les bornes du groupe et patche chaque champ avec son x/y final.',
      'ÉGALISER TAILLE (multi-sélection) — Boutons Largeur / Hauteur / L+H : applique la dimension du 1ᵉʳ champ sélectionné (= leader) à tous les autres. Idéal pour uniformiser une colonne "Heures normales".',
      'DISTRIBUER (multi-sélection ≥ 3 champs) — Boutons "⇆ H" / "⇅ V" : espace les champs avec un pas régulier basé sur les positions du 1ᵉʳ et du dernier (tri ASC).',
      'APPLY TO SIMILAR (sélection simple) — Sur la card d\'1 champ, bouton "📏 Appliquer cette taille aux N similaires" qui propage width + height à tous les champs portant le même tooltip/label (insensible à la casse). Affiche le compteur dans le libellé.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.6.9 — Format date "Numéro de semaine" (Semaine 20)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.6.9',
    date: '2026-05-11',
    label: 'Option format date "Numéro de semaine ISO" (Semaine 20)',
    features: [
      'NOUVELLES OPTIONS FORMAT DATE — Dans le dropdown Format d\'un champ date, 4 nouvelles options : "Numéro de semaine (Semaine 20)" / "Semaine court (Sem. 20)" / "Numéro seul (20)" / "Semaine + année (Semaine 20 · 2026)".',
      'Token WW dans formatDate — calcule automatiquement le numéro de semaine ISO 8601 (semaine 1 = celle du 1er jeudi de l\'année) depuis la date stockée.',
      'Usage typique : sur un rapport hebdomadaire, un champ date avec format "Semaine WW" auto-rempli depuis la semaine sélectionnée → affiche "Semaine 20" automatiquement.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.6.8 — Badge section TOUJOURS visible (+ "+ section" si pas configurée)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.6.8',
    date: '2026-05-11',
    label: 'Badge section toujours visible + cliquable',
    features: [
      'BADGE SECTION VISIBLE PARTOUT — Le badge à gauche du nom du field affiche toujours sa wizardSection si configurée (badge jaune), sinon "+ section" en pastille pointillée grise. Clic sur le badge ouvre le panneau d\'options pour assigner une section. Plus besoin d\'ouvrir l\'expand pour voir quelle section est attribuée.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.6.7 — Badge "Section" devant le nom du field dans la liste Wizard
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.6.7',
    date: '2026-05-11',
    label: 'Badge section (Lundi/Mardi/...) devant chaque field dans la liste Wizard',
    features: [
      'BADGE SECTION DANS LA LISTE WIZARD — Chaque field d\'une étape affiche désormais sa wizardSection en badge jaune cliquable juste devant le nom (ex: [Lundi] Date · [Lundi] Heures normales · [Mardi] Date). Permet de s\'organiser visuellement sans ouvrir les options de chaque field.',
      'Badge masqué si pas de wizardSection définie (fields sans groupage). Tooltip au survol affiche "Section : Lundi".',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.6.6 — Format date "Jour de la semaine" (EEEE) dans l'éditeur template
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.6.6',
    date: '2026-05-11',
    label: 'Option "Jour de la semaine" (EEEE) dans options format date',
    features: [
      'NOUVELLES OPTIONS FORMAT DATE — Dans l\'éditeur de template (panneau d\'édition d\'un champ type date), 3 nouvelles options ajoutées au dropdown "Format" : "Jour de la semaine (Lundi)" / "Jour court (Lun)" / "Jour + date (Lundi 11.05)". Le jour est déduit automatiquement de la date stockée — pas besoin de saisie manuelle.',
      'EXTENSION lib/sign/pdf-stamp.ts formatDate — Support des tokens EEEE/EEE (jour de la semaine FR) + MMMM/MMM (nom du mois FR) en plus de dd/MM/yyyy. Calcul du jour de semaine via UTC pour éviter les décalages timezone. Ordre des replace : tokens longs avant courts.',
      'IMPACT — Sur les rapports d\'heures, un field date avec wizardSection="Lundi" auto-rempli en "2026-05-11" + format "EEEE" → affiche "Lundi" dans le rendu read-only ET dans le PDF stampé final. Cohérence totale sans effort.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.6.5 — Historique candidat : plus de duplication, juste les plus anciens
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.6.5',
    date: '2026-05-11',
    label: 'Historique = uniquement les rapports plus anciens que les 3 cards principales',
    features: [
      'COHÉRENCE HISTORIQUE — L\'accordion "Voir l\'historique" affichait TOUS les rapports (incluant les 3 déjà visibles en cards principales), créant une duplication confuse. Désormais : 3 cards principales = 3 plus récents, historique = rapports plus anciens uniquement.',
      'Exemple : 4 rapports total → 3 cards + 1 dans historique. 5 rapports → 3 cards + 2 dans historique. Le bouton est masqué si total ≤ 3.',
      'Renommé "Voir tout l\'historique" → "Voir l\'historique" (le nombre indique le restant, pas le total).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.6.4 — Cards "Mes derniers rapports" : numéro semaine + année dans le titre
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.6.4',
    date: '2026-05-11',
    label: 'Cards rapports : "S20 · 11.05.2026 → 17.05.2026"',
    features: [
      'CARDS RAPPORTS MOBILE — Format date complet désormais affiché : "S20 · 11.05.2026 → 17.05.2026" au lieu de "11.05 → 17.05". Plus de doute possible sur l\'année du rapport.',
      'Page candidat : ajout calcul automatique du numéro de semaine ISO (via getWeekDates) dans le mapping allMissions → propagé à MissionList + HistoryAccordion.',
      'MissionList : retrait du .slice(0, 5) sur formatDateChDot → date jj.mm.aaaa complète conservée.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.6.3 — Bandeau "modifié par le client" emails + logo officiel certificat
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.6.3',
    date: '2026-05-11',
    label: 'Email candidat + créateur signalent "Modifié par le client" + vrai logo certif',
    features: [
      'BANDEAU "MODIFIÉ PAR LE CLIENT" — Les emails post-signature client (createur USER + candidat) affichent désormais un bandeau amber explicite "⚠️ Données modifiées par le client" avec liste des champs si le client a cliqué "Modifier les données" avant de signer. Avant, l\'info n\'était que sur le certificat PDF. Texte d\'invitation au candidat à contacter L-Agence en cas de désaccord.',
      'LOGO L-AGENCE TRANSPARENT DANS CERTIFICAT — Les 2 certificats de signature (Sign global `lib/sign/pdf-generator.ts` + Rapports `lib/report/pdf-generator.ts`) embed désormais le vrai PNG officiel `public/logo-agence-officiel-noir.png` (722×147 alpha) au lieu du texte "L-AGENCE SA" en Helvetica Bold. Fallback texte conservé si lecture FS impossible.',
      'sendCompletedEmailToAdmin/Candidat — nouveaux args clientModified + modifiedFields[]. Caller (sign route) lit submission.metadata.client_modified + .modified_fields.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.6.2 — Blocage jours hors mission + jours déjà déclarés ailleurs
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.6.2',
    date: '2026-05-11',
    label: 'Semaines + jours bloqués selon dates mission et autres rapports',
    features: [
      'LIMITATION WEEKSELECTOR — Les semaines AVANT mission_start_date et APRÈS mission_end_date sont masquées du sélecteur côté candidat. Si la semaine courante tombe hors fenêtre après changement d\'entreprise, auto-reset vers la semaine en cours.',
      'BLOCAGE JOURS HORS MISSION — Quand le candidat sélectionne une semaine qui chevauche partiellement la mission (ex : mission débute mercredi), les fields lundi-mardi sont grisés avec mention "Hors mission" + cadenas. Les jours après mission_end_date également (vendredi grisé si mission finit jeudi).',
      'BLOCAGE JOURS DÉJÀ DÉCLARÉS — Si le candidat a déjà soumis un rapport validé pour une AUTRE entreprise sur la même semaine, les jours déjà remplis (heures > 0) sont grisés sur le 2ᵉ rapport avec mention "Chez {entreprise}". Évite la double facturation.',
      'NOUVEAU HELPER lib/report/day-blocking.ts — buildBlockedDaysForWeek + buildBlockedFieldsMap + getDeclaredDaysFromValues (mapping field → jour via wizardSection).',
      'NOUVELLE ROUTE GET /api/reports/[slug]/declared-days?week=...&exclude=clientId — Renvoie pour chaque autre entreprise du lien la liste des jours ISO déjà déclarés sur status validé (candidate_signed / client_signed / completed). Côté front : fetch automatique au changement de semaine + entreprise.',
      'PublicFieldsLayer prop blockedFields Map<fieldId, reason> — Render read-only grisé hachuré avec tooltip explicatif. Exclu de la validation areAllRequiredFieldsFilled (le candidat peut soumettre sans remplir un jour bloqué).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.6.1 — Entreprises : responsable mission + tel + dates + section "Mes missions"
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.6.1',
    date: '2026-05-11',
    label: 'Infos mission par entreprise + section "Mes missions" candidat',
    features: [
      'MIGRATION DB — 4 nouvelles colonnes nullables sur `report_link_clients` : mission_contact_name + mission_phone + mission_start_date + mission_end_date. Contrainte CHECK end_date >= start_date. Aucune rupture sur les liens existants (tout en NULL = comportement v2.6.0 inchangé).',
      'MODAL "ENTREPRISES AUTORISÉES" — Nouvelle section "Mission (affiché côté candidat)" avec 4 inputs : responsable terrain (distinct du contact signataire), téléphone, début + fin mission. Validation dates côté UI + serveur.',
      'ROUTES API — POST + PATCH /api/admin/reports/[id]/clients[/:clientId] acceptent les 4 nouveaux champs. GET /api/reports/[slug]/clients (publique) les retourne.',
      'PAGE CANDIDAT — Nouvelle section "Mes missions" insérée entre "Nouveau rapport" et "Mes derniers rapports". Cards par entreprise affichant : nom responsable terrain · 📞 téléphone cliquable (tel:) · 📅 période. Tap → auto-select l\'entreprise + bascule en phase form direct.',
      'COMPOSANT MissionInfoList — Réutilisable (props clients + onSelect optionnel). Filtre auto les entreprises sans aucune info mission pour éviter une section vide.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.6.0 — Rapports candidat : contraste mobile lisible + suppression brouillons
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.6.0',
    date: '2026-05-11',
    label: 'Récap candidat lisible mobile + bouton supprimer brouillon',
    features: [
      'CONTRASTE RECAP MOBILE — Composant RecapPeriode (partagé page candidat publique + dashboard) utilisait des tokens CSS `var(--surface/--border/--muted/--foreground/--card)` non définis sur la page candidat publique → texte invisible (même couleur que fond) sur mobile. Fix : fallback `var(--token, #couleur)` partout (FAFAF7/E5E7EB/6B7280/1C1A14/#fff) → lisible dans les 2 contextes sans toucher au dark mode dashboard.',
      'BOUTON SUPPRIMER BROUILLON — Cards "Mes derniers rapports" + historique accordion : bouton 🗑 rouge soft pâle (#FEF2F2 / #FECACA / #B91C1C) à droite, visible UNIQUEMENT pour status=`draft`. Tap → window.confirm() avec semaine + entreprise, puis DELETE /api/reports/{slug}/submissions/{id} → refresh data. Les rapports envoyés/signés/validés NE peuvent PAS être supprimés (sécurité).',
      'NOUVELLE ROUTE DELETE — `/api/reports/{slug}/submissions/{id}` méthode DELETE : vérifie le slug + status=`draft` strict + scope link_id, log audit `draft_deleted`. Refuse 409 si statut ≠ draft.',
      'TYPE ReportAuditAction étendu — Ajout `draft_deleted` pour tracer les suppressions.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.5.3 — Logo vraie transparence (2 nouveaux PNGs alpha) — retrait des hacks
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.5.3',
    date: '2026-05-11',
    label: 'Logo officiel VRAIE transparence — 2 PNGs alpha (noir + blanc) — retrait mix-blend-mode + wrapper card blanche',
    features: [
      'NOUVEAUX FICHIERS LOGO TRANSPARENTS — João a fourni 2 PNGs avec vrai canal alpha (fond transparent au lieu de fond blanc opaque) :',
      '  • public/logo-agence-officiel-noir.png  (texte NOIR, 722×147, alpha) → fond clair',
      '  • public/logo-agence-officiel-blanc.png (texte BLANC, 723×147, alpha) → fond foncé',
      'COMPOSANT LogoLAgence.tsx — Pointe vers les 2 nouveaux fichiers selon prop color. Retrait de la prop mix-blend-mode (plus nécessaire avec vraie alpha). Ratio recalculé 722/147 ≈ 4.91 (au lieu de l\'ancien 550/170 ≈ 3.23).',
      'EMAILS RAPPORTS — Retrait du wrapper card blanche (background:#fff + padding + border-radius + border) qui servait à masquer le rectangle blanc du PNG opaque. Le PNG transparent ne nécessite plus ce hack. URL des `<img>` mise à jour vers /logo-agence-officiel-noir.png. Hauteur passée de 38px à 42px (légèrement plus grand pour profiter du ratio).',
      'EMAILS SIGN — Idem, retrait wrapper + nouvelle URL. Bonus : sous-titre HTML "Emplois fixes & temporaires" retiré car déjà inclus dans le PNG officiel (le sous-titre est partie intégrante du logo dessiné). Plus de doublon. Alt text du `<img>` enrichi : "L-Agence — Emplois fixes & temporaires".',
      'PDFs — cv-generator.ts (CV candidat) et rapport-heures/route.ts (rapport heures legacy) pointent vers le nouveau PNG noir transparent. Cohérent avec les pages web et emails.',
      'CODE PLUS PROPRE — Plus besoin de hack mix-blend-mode CSS (cause potentielle de bugs Safari/Chrome edge cases), plus besoin de wrapper card blanche dans les emails. Le PNG transparent fait le boulot proprement partout.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.5.2 — Logo officiel partout (vraiment) + fix refs cassées logo-lagence.png
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.5.2',
    date: '2026-05-11',
    label: 'Logo officiel : audit complet — ajouté sur page client "Rapport signé" + Sign emails + fix refs logo-lagence.png cassées',
    features: [
      'PAGE CLIENT — CenteredCard (page "Rapport signé !" / "Invalide" / "Expiré" / "Annulé" / "Déjà signé") affiche désormais le LogoLAgence en haut, comme côté candidat. Cohérence visuelle complète.',
      'SIGN EMAILS — Module Sign (différent de Rapports) a ses propres templates emails dans lib/sign/send-email.ts. Le span texte "L-AGENCE" en Georgia a été remplacé par <img> du PNG officiel + wrapper card blanche, même pattern que Rapports.',
      'FIX REFS LOGO CASSÉES — Le fichier public/logo-lagence.png a été renommé en logo-agence-officiel.png en v2.4.4. Mais 2 routes pdf-lib référençaient encore l\'ancien nom et échouaient silencieusement (catch sans log) : lib/cv-generator.ts (génération CV PDF) + app/(dashboard)/api/rapport-heures/route.ts (rapport heures legacy). Les PDFs étaient générés SANS logo depuis 24h. Corrigé.',
      'TRANSPARENCE — Le PNG officiel a un fond blanc opaque (pas vraie alpha). Sur les pages web, mix-blend-mode:multiply CSS le masque. Dans les emails (mix-blend-mode non supporté), wrapper avec background:#fff explicite. Dans les PDFs pdf-lib, le fond blanc s\'imprime tel quel (acceptable sur fond blanc de page). Pour une vraie transparence, regénérer le PNG avec un canal alpha — pas critique maintenant.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.5.1 — Fixes UX client + crash "Modifier données" (Rules of Hooks) + logo emails
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.5.1',
    date: '2026-05-11',
    label: '4 corrections page client + fix crash "Modifier les données" (Rules of Hooks violées) + logo emails dans card blanche',
    features: [
      'CRASH "MODIFIER LES DONNÉES" — Cause identifiée : violation Rules of Hooks dans PublicFieldsLayer (useEffect appelé APRÈS un early return conditionnel sur forceReadOnly). Quand le client cliquait "Modifier les données", certains fields candidat passaient de forceReadOnly=true à false → l\'ordre des hooks changeait → React crash "Rendered fewer hooks than expected" → écran "Application error: a client-side exception". Fix : useEffect d\'auto-focus déplacé AVANT le return forceReadOnly + condition interne.',
      'NUMÉRO DE SEMAINE — La page client affiche désormais le numéro ISO de la semaine en gras avant le label : "Semaine 19 · Semaine du 4 au 10 mai 2026". Route GET /api/reports/client/[token] retourne weekNumber depuis getWeekDates().',
      'BOUTON WIZARD CÔTÉ CLIENT RETIRÉ — Le client n\'a pas à utiliser le mode wizard (il valide juste un rapport déjà rempli par le candidat, il n\'a pas à remplir étape par étape). Bouton bascule Wizard/Document supprimé du header. viewMode forcé à \'document\' en permanence côté client.',
      'AFFICHAGE ÉPURÉ DES VALEURS CANDIDAT — Côté client, les fields déjà remplis par le candidat (forceReadOnly) ne sont plus encadrés d\'un rectangle vert dashed avec fond vert clair. Affichage en TEXTE SIMPLE par-dessus le PDF de fond (qui contient déjà la grille du contrat). Plus propre. Les fields client à remplir gardent leur cadre vert.',
      'LOGO EMAILS DANS CARD BLANCHE — Le PNG logo-agence-officiel.png a un fond blanc opaque qui faisait un rectangle blanc visible sur le fond crème (#FAFAF7) des emails. Fix : le bloc d\'en-tête (logo + sous-titre) est désormais enveloppé dans une card blanche (background:#fff + padding + border-radius + border subtile). Le fond blanc du PNG se fond avec la card blanche → plus de rectangle visible. Appliqué aux 5 templates Resend.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.5.0 — Multi-entreprise même semaine + wording post-soumission candidat
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.5.0',
    date: '2026-05-11',
    label: 'Multi-entreprise réelle : 2 brouillons même semaine si 2 missions distinctes + wording post-soumission "Rapport envoyé" vs "Rapport validé"',
    features: [
      'MULTI-ENTREPRISE MÊME SEMAINE — Le candidat peut désormais avoir un rapport ENTREPRISE A (lundi-mardi) ET un rapport ENTREPRISE B (mercredi-vendredi) sur la MÊME semaine. Avant : la route save-draft (POST + GET) ne scopait pas par entreprise → bloquait avec 409 "Semaine déjà rempli" dès qu\'une 2ᵉ entreprise était sélectionnée. Maintenant : save-draft scope sur (link_id, week_start, report_link_client_id). Le UNIQUE constraint DB autorise déjà ce triplet → 2 brouillons distincts coexistent.',
      'PAGE CANDIDAT — submissionForWeek est calculé désormais sur (week_start + report_link_client_id) au lieu de week_start seul. isLockedWeek est donc local à l\'entreprise sélectionnée. Le useEffect de chargement du draft se redéclenche quand selectedClient change (et pas seulement quand weekStart change) — recharge le bon brouillon par entreprise.',
      'ROUTE GET save-draft — Accepte un nouveau query param ?client=<report_link_client_id>. Si absent → filtre IS NULL (mode legacy). Si présent → filtre EQ. Le candidat reçoit le brouillon SPÉCIFIQUE à l\'entreprise sélectionnée.',
      'ROUTE POST save-draft — Accepte report_link_client_id dans le body. Persisté en DB sur la row report_submissions. Le 409 "déjà soumise" devient "déjà soumise pour cette entreprise" — clair côté UX que ça concerne 1 entreprise précise.',
      'WORDING POST-SOUMISSION CANDIDAT — Le SignWizard affichait "Document signé ! Une copie signée vous a été envoyée par email à votre adresse" après que le candidat ait soumis son rapport — alors qu\'à ce stade, l\'entreprise n\'a pas encore signé. Faux message. Nouvelles props completedTitle + completedSubtitle sur SignWizard, passées depuis /report/[slug] selon le statut :',
      '  • status=candidate_signed → "Rapport envoyé !" + "Votre rapport a été envoyé à {entreprise} pour validation et signature. Vous serez notifié dès qu\'elle aura signé."',
      '  • status=completed/client_signed → "Rapport validé !" + "Votre rapport a été validé et signé par l\'entreprise. Une copie vous a été envoyée par email."',
      'COMPAT — Les props completedTitle/completedSubtitle sont optionnelles. SignWizard utilisé dans Sign classique (/sign/v/[token]) garde le message original "Document signé !" car les props ne sont pas passées.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.4.9 — Renommage "Mappe" → "Général" partout (label UI uniquement)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.4.9',
    date: '2026-05-11',
    label: 'Renommage UI "Mappe" → "Général" (template polyvalent pour tout type de document) — value DB inchangée',
    features: [
      'LABEL "GÉNÉRAL" — Le type de template "Mappe" est rebrandé en "Général" partout dans l\'UI Sign. Description : "Tout type de document (mappe, divers, multi-champs)". Couvre désormais l\'usage initial (dossier d\'inscription candidat) ET tous les autres documents polyvalents. La VALUE interne reste \'mappe\' dans la DB (SignCategory enum) pour ne pas casser les envelopes existantes — seul l\'affichage change.',
      'FICHIERS TOUCHÉS — (a) lib/sign/types.ts : CATEGORY_LABELS.mappe = "Général". (b) components/sign/CreateTemplateModal.tsx : option "Général" avec icône FileText (au lieu de Briefcase plus restrictif) + nouvelle description + placeholder "Ex : Document candidat". (c) components/sign/CandidatSignSection.tsx : CATEGORIES.mappe.label = "Général". (d) components/sign/TemplatesTable.tsx : libellés du convertisseur de kind ("Convertir en Général / Contrat") et confirm.',
      'CONTRAT DE TRAVAIL CLARIFIÉ — La description du type "Contrat de travail" précise désormais le flow réel : "Contrat à signer par le candidat (PDF pré-signé L-Agence scanné)". L\'admin imprime + signe sa partie + scanne, puis upload → candidat signe sa partie électroniquement. Le template kind="contract" reste à implémenter dans une session future.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.4.8 — Autocomplete client modal entreprise + Récap dark mode
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.4.8',
    date: '2026-05-11',
    label: 'Modal "Ajouter une entreprise" branché sur la DB clients (autocomplete) + récap période compatible dark mode',
    features: [
      'AUTOCOMPLETE ENTREPRISE — Le modal "Ajouter une entreprise" dans LinkClientsSection utilise désormais le composant ClientContactAutocomplete (même pattern que /sign/rapports/new). Recherche dans /api/clients?search=…&per_page=15 dès la 2ᵉ lettre. Au clic sur une suggestion : pré-remplit nom + contact + email + persiste client_id en base. Saisie libre toujours possible pour les entreprises non-DB. Bouton X "délier" disponible.',
      'PERSISTANCE client_id — Le payload POST /api/admin/reports/[id]/clients inclut désormais client_id quand l\'entreprise vient de la DB (autocomplete). Permet la liaison avec la table clients (pour stats futures).',
      'RÉCAP PÉRIODE DARK MODE — components/report/RecapPeriode.tsx : remplacement des couleurs hardcodées #FAFAF7/#fff/#E5E7EB/#6B7280/#1C1A14 par les tokens CSS var(--surface)/var(--card)/var(--border)/var(--muted)/var(--foreground). Le modal du dashboard /sign/rapports/[id] s\'affiche correctement en dark mode. La card amber "TOTAL PÉRIODE" garde ses couleurs sémantiques (#FFFBEB + #FDE68A) — couleur dédiée fonctionnelle qui reste pareille light + dark.',
      'BOUTON "GÉNÉRER" — Passe de fond noir/texte blanc à fond jaune brand (#EAB308) avec texte foncé + bordure noire. Cohérent avec les autres boutons primaires de l\'app et lisible en dark mode.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.4.7 — Sécurité données candidat + Logo emails + Fix Modifier + Récap conditionnel + Dédup brouillons
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.4.7',
    date: '2026-05-11',
    label: '9 corrections : email client masqué, "Client"→"Entreprise", logo emails+pages confirmation+page client, fix Modifier entreprise, récap conditionnel, viewer inline, dédup brouillons',
    features: [
      'PROTECTION DONNÉES — ConfirmDialog candidat ne révèle plus l\'email du client destinataire. Le candidat voit juste "Le rapport sera envoyé à Metabader SA pour validation et signature" + card verte "Rapport signé prêt à envoyer". L\'email reste géré côté serveur (envoi auto).',
      'RENOMMAGE — Toutes les occurrences user-facing "Client" deviennent "Entreprise" côté candidat (page form, page submitted, bandeaux validé/en attente, toasts renvoyer). Le candidat voit "Validé par Metabader SA" / "En attente de signature de Metabader SA" / "Notification renvoyée à l\'entreprise".',
      'LOGO PARTOUT — (a) CenteredCard (pages confirmation candidat : Merci/Lien invalide/expiré/etc) reçoit le LogoLAgence en haut. (b) Page client /report/client/[token] : LogoLAgence remplace l\'icône jaune ClipboardList + texte "L-AGENCE" approximatif. (c) 5 templates emails Resend (admin/client/candidat invite + completed) : `<img>` du PNG officiel hébergé sur https://www.talent-flow.ch/logo-agence-officiel.png (38px height).',
      'PAGE CLIENT — Bouton "Valider et signer" devient juste "Valider" (la signature s\'opère en cliquant Valider). Confirm dialog reste "Valider et signer ce rapport ?" explicit pour user.',
      'BOUTON MODIFIER ENTREPRISE — Fix payload PATCH : retrait du display_order superflu (la route PATCH ne l\'accepte pas et ça causait potentiellement un comportement erratique). Capture du modal state dans une const locale pour éviter les races avec setModal(null). Logs console explicites en cas d\'erreur serveur (status + body) pour debug facile.',
      'BOUTON RÉCAPITULATIF — Affiché UNIQUEMENT si au moins 1 soumission est validée (status completed OU client_signed). Conditionné côté candidat (panneau récap collapsible) ET côté dashboard (bouton "Récapitulatif période" à droite de l\'historique). Évite l\'affichage de chiffres incomplets / biaisés.',
      'MODAL VIEWER INLINE — Route GET /api/reports/[slug]/submissions/[id]/download accepte un query param ?inline=1 qui change le Content-Disposition de "attachment" à "inline". SubmissionViewerModal utilise ?inline=1 pour son iframe → aperçu PDF s\'affiche correctement (au lieu de déclencher le téléchargement direct). Bouton "Télécharger" garde le comportement attachment.',
      'DÉDUPLICATION BROUILLONS — Filtre côté front dans la construction de allMissions : si une soumission non-draft existe pour une semaine donnée, les drafts orphelins (report_link_client_id=NULL, legacy avant migration v2.4.0) sur la même semaine sont MASQUÉS de "Mes derniers rapports". Évite l\'affichage "Brouillon + En attente" pour la même semaine. SQL one-shot : DELETE des drafts NULL orphelins quand non-draft existe pour la même (link, week).',
      'COHÉRENCE UI — Bandeaux "Validé par X" / "En attente de signature de X" utilisent désormais selectedClient.client_name en priorité, fallback link.client_name (cas legacy).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.4.6 — Logo partout + dashboard nettoyé + footer mode document only
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.4.6',
    date: '2026-05-11',
    label: 'Logo officiel partout candidat + dashboard sans "Metabader SA" legacy + footer "Confirmer et envoyer" mode document only',
    features: [
      'DASHBOARD — Retire l\'affichage de link.client_name dans le sous-titre header de /sign/rapports/[id] (avant : "ACTIF · Metabader SA · 1 soumission"). Désormais : "ACTIF · 1 soumission". Les entreprises destinataires sont dans la section "Entreprises autorisées" en bas, pas en header.',
      'PAGE CANDIDAT — Footer "Confirmer et envoyer" affiché UNIQUEMENT en mode \'document\'. En mode wizard, le wizard SignWizard a déjà son propre bouton "Confirmer et envoyer" sur la dernière étape (signature) via onFinalize. Plus de doublon visuel + plus de bouton parasite sur les étapes intermédiaires.',
      'LOGO OFFICIEL PARTOUT — Le vrai logo LogoLAgence apparaît désormais sur toutes les phases candidat : landing (déjà ok), select_client (header avec bouton retour + logo + h1), form (remplace l\'icône jaune ClipboardList + texte "L-AGENCE" approximatif par le PNG officiel). Hauteur 30-36px selon mobile/desktop.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.4.5 — Logo PNG fond blanc rendu transparent via mix-blend-mode
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.4.5',
    date: '2026-05-11',
    label: 'Fix logo — fond blanc du PNG officiel rendu transparent via mix-blend-mode: multiply',
    features: [
      'LOGO — Le PNG logo-agence-officiel.png a un fond blanc opaque qui faisait un rectangle visible sur les fonds crème (#FAFAF7) de l\'app candidat. Fix CSS non-destructif : LogoLAgence.tsx applique mixBlendMode="multiply" sur l\'Image → les pixels blancs (255,255,255) se multiplient avec le fond et deviennent invisibles, le texte noir reste visible. Marche sur Safari iOS 12+, Chrome 41+, Firefox 32+. Aucune régénération du PNG nécessaire. Pour color="light" (variant texte blanc fond foncé), mode "screen" appliqué (inverse).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.4.4 — Sécurité + Logo officiel
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.4.4',
    date: '2026-05-11',
    label: 'Sécurité — suppression WhatsApp candidat (le client reçoit toujours par email automatique) + vrai logo L-Agence officiel + warning anti-partage du lien permanent',
    features: [
      'SÉCURITÉ — Le bouton "Envoyer par WhatsApp à mon responsable" côté candidat est SUPPRIMÉ. Raison : un candidat malhonnête pouvait copier le lien client et l\'envoyer à un complice qui aurait signé à sa place (fraude possible avec n\'importe quel canal qui transite par le candidat). Le SEUL canal d\'envoi au client est désormais email automatique vers client_email pré-configuré dans report_link_clients. L\'admin pré-saisit le bon email lors de la configuration des entreprises autorisées — le candidat ne voit jamais ce mail et ne peut pas le rediriger.',
      'UX — SendChannelDialog remplacé par ConfirmDialog simple. Au clic "Confirmer et envoyer", un dialog centré demande confirmation et affiche le destinataire ("Email destinataire : sd@metabader.ch"). Plus de choix de canal — un seul flow : confirmation → POST submit → email auto.',
      'WHATSAPP DASHBOARD → CANDIDAT — Le seul usage de WhatsApp restant est l\'envoi du lien permanent AU candidat depuis le dashboard (bouton "WhatsApp" sur la page détail du lien). Message enrichi avec un warning "⚠️ IMPORTANT : ne partagez ce lien avec personne. Vous seul devez l\'utiliser. Si une autre personne y accède, elle pourrait modifier vos données."',
      'LOGO OFFICIEL — Le composant LogoLAgence.tsx bascule du SVG inline approximatif vers le VRAI fichier PNG officiel uploadé dans public/logo-agence-officiel.png (texte noir 550×170, fond transparent). Variante public/logo-agence-officiel-transparent.png (texte blanc) pour fond foncé via prop color="light". Plus de "L" en gras ou de sous-titre en sérif — c\'est le vrai logo cette fois.',
      'NETTOYAGE CODE — Imports toWhatsAppSafe + waMeUrl retirés de la page /report/[slug] (plus utilisés côté candidat). Variable d\'état sendingWa supprimée. Fonction handleSubmitWhatsApp supprimée. Composant SendChannelDialog remplacé par ConfirmDialog plus simple.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.4.3 — Refonte page détail lien : Entreprises autorisées éditables + WhatsApp candidat sans numéro
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.4.3',
    date: '2026-05-11',
    label: 'Page détail lien refondée — InfoCards CANDIDAT only + table Entreprises autorisées éditables (modal centré) + auto-create + WhatsApp candidat sans numéro',
    features: [
      'PAGE DÉTAIL LIEN — Header simplifié : retire les 4 InfoCards "Entreprise client / Contact client / Email client / Canal de notif". Ne garde que les 3 InfoCards CANDIDAT (Nom / Email / WhatsApp). Toutes les coords client vivent désormais dans la section "Entreprises autorisées" en bas de page.',
      'ENTREPRISES AUTORISÉES — Format tableau (Nom entreprise / Nom client / Email client / Actions). Bouton ✏️ par ligne ouvre un MODAL centré (createPortal) avec 3 inputs (Nom entreprise + Nom contact + Email). Sauvegarde via PATCH /api/admin/reports/[id]/clients/[clientId]. Bandeau d\'info "💡 La modification s\'applique aux futures soumissions seulement" — les rapports déjà envoyés ne sont pas affectés.',
      'AUTO-CREATE — Si un lien n\'a pas encore d\'entreprise dans report_link_clients (cas legacy ou créé avant la migration), LinkClientsSection auto-crée silencieusement la 1ʳᵉ row depuis link.client_* au montage du composant. Plus jamais "Aucune entreprise configurée" sur un lien actif.',
      'CRÉATION DE LIEN — POST /api/admin/reports crée AUSSI une 1ʳᵉ row report_link_clients en parallèle de l\'insert report_links. Cohérence garantie dès la création.',
      'WHATSAPP CANDIDAT SANS NUMÉRO — Le bouton "Envoyer par WhatsApp à mon responsable" ouvre désormais wa.me/?text=… SANS numéro pré-rempli. Le candidat choisit son responsable dans ses propres contacts WhatsApp (picker natif). Bouton TOUJOURS actif (plus de "Numéro non disponible" grisé). Le champ Téléphone WhatsApp dans le modal entreprise est retiré (devenu inutile). Le client reçoit toujours par email côté infra.',
      'ROUTE API — PATCH /api/admin/reports/[id]/clients/[clientId] (édition d\'une entreprise autorisée : client_name, client_contact_name, client_email, client_phone). Validation strict côté serveur (nom requis, email lowercased, phone normalizé E.164).',
      'BACKFILL SQL — One-shot pour le lien orphelin Metabader SA (créé avant la migration v2.4.0). Tous les liens actifs ont désormais au moins 1 entreprise dans report_link_clients.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.4.2 — Patch UX Rapports candidat (cards cliquables + viewer + share + flow simplifié + logo)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.4.2',
    date: '2026-05-11',
    label: 'Patch UX candidat — cards cliquables (brouillon→reprendre / validé→viewer+share) + bouton Aide compact + logo transparent + flow finalisation simplifié',
    features: [
      'CARDS HISTORIQUE CLIQUABLES — Sur la landing candidat, les cards "Mes derniers rapports" (et l\'accordion historique complet) deviennent interactives. (a) Statut "Brouillon"/"Annulé" → tap reprend le rapport : restore week_start + entreprise destinataire (report_link_client_id propagé via /api/reports/[slug] route publique) et bascule en phase form. (b) Statut "Validé"/"Signé client"/"En attente" → tap ouvre SubmissionViewerModal (PDF iframe full-screen + bouton Télécharger + bouton Partager via Web Share API native iOS/Android — picker système WhatsApp/SMS/Mail avec fallback clipboard).',
      'BOUTON CONTACTER L-AGENCE — Variant "compact" ajouté (pill jaune small height 36px avec icône + label "Aide"). Sur la phase form du candidat, le bouton est désormais dans le header haut-droite (à côté du retour) au lieu du floating bottom-right qui gênait le clavier mobile. La landing garde le bouton flottant gros. La page submitted aussi (CenteredCard simple).',
      'LOGO L-AGENCE — Remplacement par composant inline LogoLAgence.tsx (SVG pur, fond transparent, texte sérif foncé). Plus de rectangle jaune (PNG/SVG précédents étaient verrouillés à un fond jaune). Marche sur n\'importe quel fond clair/foncé. Utilisé dans CandidatWelcomeHeader (top gauche landing) + ContactAgenceButton modal (centré haut).',
      'FLOW FINALISATION SIMPLIFIÉ — Le footer du formulaire est nettoyé : 1 seul bouton "Confirmer et envoyer" (au lieu de 2 boutons + 2 bandeaux info/alerte qui encombraient toute la fin de page). Les 2 boutons (WhatsApp + Email auto) et les bandeaux info amber + alerte rouge "N\'envoyez PAS à L-Agence" sont déplacés DANS le nouveau SendChannelDialog (ancien ConfirmDialog enrichi) — affichés UNIQUEMENT après que l\'utilisateur ait cliqué "Confirmer et envoyer". UX plus claire : on remplit → on confirme → on choisit le canal.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.4.1 — Phase 2 Rapports v2 (Historique complet + Récapitulatif période + PDF)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.4.1',
    date: '2026-05-11',
    label: 'Rapports v2 Phase 2 — Historique complet candidat + Récapitulatif par période + Export PDF',
    features: [
      'HISTORIQUE COMPLET — Nouveau bouton "Voir tout l\'historique (N)" sur la landing candidat. Au clic, ouvre un accordion expand-in-place (pas de nouvelle route) regroupant TOUS les rapports par mois (Mai 2026, Avril 2026, …) avec nb de rapports par groupe. Réutilise les MissionList cards existantes. Mobile-first.',
      'RÉCAPITULATIF PAR PÉRIODE — Nouveau composant RecapPeriode.tsx (partagé candidat + dashboard). Sélecteur de période (from/to date pickers), bouton "Générer". Calcul des totaux par mission (entreprise) + total global. Détection automatique des champs par heuristique label : "Heures normales / Heures supplémentaires / Repas (checkbox) / Temps de déplacement" — exclut les fields "Total..." (formula) pour éviter le double-count. Marche immédiat sur le template L-Agence rapport_heures sans config admin.',
      'EXPORT PDF — Bouton "Télécharger le récapitulatif PDF" qui ouvre /api/reports/[slug]/recap/pdf?from=…&to=… (A4 portrait, bandeau jaune L-Agence, nom candidat, période, cards par mission, total période, footer "Généré par TalentFlow"). pdf-lib + StandardFonts.Helvetica (asciiSafe normalise les accents).',
      'ROUTES API — GET /api/reports/[slug]/recap (publique, slug suffit) avec params from / to / scope=candidate|dashboard. Scope candidate = statut "completed" uniquement, scope dashboard = completed + client_signed + candidate_signed. Retourne { byMission, total, count }.',
      'DASHBOARD — Bouton "Récapitulatif période" ajouté à droite de "Historique des soumissions" dans /sign/rapports/[id]. Au clic, modal portalisé (createPortal + flex center + var(--card)) avec RecapPeriode scope=dashboard. Périmètre étendu : inclut les rapports en attente client (utile pour les estimations en cours de mois).',
      'COMPOSANTS — lib/report/recap.ts (helpers détection catégorie + somme + groupBy mois + format heures décimales). HistoryAccordion.tsx (accordion mois avec chevron + count). RecapPeriode.tsx (sélecteur + résultat + PDF download). Période par défaut : 1er du mois en cours → aujourd\'hui. Auto-fetch au montage.',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.4.0 — Phase 1 Rapports v2 (multi-entreprise + notes + landing mobile)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.4.0',
    date: '2026-05-11',
    label: 'Rapports v2 Phase 1 — multi-entreprise + notes candidat/client + accueil mobile + WhatsApp candidat',
    features: [
      'MULTI-ENTREPRISE — Nouvelle table report_link_clients : un lien candidat peut désormais autoriser plusieurs entreprises destinataires (1 rapport par semaine par entreprise). Routes API admin GET/POST/DELETE /api/admin/reports/[id]/clients. Route publique GET /api/reports/[slug]/clients. Migration auto-backfill : pour chaque lien existant, une row report_link_clients est créée à partir des champs client_* historiques. Nouveau UNIQUE constraint sur report_submissions (link_id, week_start, report_link_client_id). Section "Entreprises autorisées" dans la page détail du lien (LinkClientsSection.tsx) avec ajout/suppression + champ téléphone WhatsApp dédié par entreprise.',
      'PAGE CANDIDAT — Refonte mobile-first /report/[slug] avec flow accueil → sélection entreprise (skip si 1 seule) → formulaire. CandidatWelcomeHeader.tsx : logo L-Agence + salutation dynamique (heure/jour spécial + Pâques calculé) + météo Open-Meteo gratuite sans clé (silent si géoloc refusée). ClientSelector.tsx : cards verticales avec contact + téléphone cliquable. MissionList.tsx : 5 derniers rapports en cards compactes mobile. Bouton compact "Retour à l\'accueil" depuis le formulaire.',
      'NOTES — Champ notes_candidat (300 chars) saisi par le candidat avant signature, affiché en bandeau amber sur la page client. Champ notes_client (300 chars) saisi par le client avant signature, persisté via PATCH /api/reports/client/[token]/update-fields. Les deux notes apparaissent en bandeau dans l\'email créateur uniquement (jamais dans le PDF, jamais dans l\'email candidat ni client). Icône 📝 + tooltip dans SubmissionHistoryTable du dashboard.',
      'BOUTON WHATSAPP — Nouveau bouton "Envoyer par WhatsApp à mon responsable" côté candidat (vert #25D366) qui : (1) submit DB normalement (marque submitted=true + notif email client), (2) ouvre wa.me deep link avec message pré-rempli (toWhatsAppSafe). Bouton grisé si client_phone non configuré. Notes amber d\'information + alerte rouge "⚠️ N\'envoyez PAS ce lien à L-Agence SA — uniquement à votre responsable direct". Le bouton "Envoyer au client" historique (email) reste disponible en parallèle.',
      'CONTACT L-AGENCE — Bouton fixe en bas à droite "🏢 Contacter L-Agence" (jaune brand pill) + modal bottom sheet portalisé avec WhatsApp (+41 76 297 97 95) + Bureau (+41 24 552 18 70) + horaires (Lun-Ven · 8h-12h / 13h-17h). Helpers centralisés dans lib/lagence-contact.ts (waMeUrl, telUrl, phoneDigits) pour réutilisation future.',
      'DB — Migration ALTER TABLE report_submissions : ajout report_link_client_id (FK report_link_clients ON DELETE SET NULL), notes_candidat (text max 300), notes_client (text max 300). Backfill : tous les liens existants reçoivent 1 row report_link_clients. Backfill : toutes les soumissions existantes voient leur report_link_client_id rempli sur la 1ʳᵉ row.',
      'SIGN + RAPPORTS — Nouveau champ "Annotation / Instruction" par CHAMP (helpText sur SignField, max 200 chars). Affiché en petit texte gris italique entre le label et l\'input du champ (mode Wizard) ou dans la bubble au focus (mode Document). Remplace l\'ancienne "Note d\'étape" amber (retirée du UI WizardEditor + StepNote retiré de SignWizard). Permet d\'expliquer un champ précis (ex : "IBAN suisse au format CH..." sous "Méthode de paiement de salaire") sans polluer toute l\'étape. Édité dans le panneau droit TemplateEditor (juste avant la section Avancé / Tooltip).',
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  // v2.3.0 prod — TalentFlow Sign Phase 4 complet + Module Rapports
  // (consolidation 2.3.0 → 2.3.19, mai 2026)
  // ─────────────────────────────────────────────────────────────────────
  {
    version: '2.3.0',
    date: '2026-05-10',
    label: 'TalentFlow Sign Phase 4 complet + module Rapports + WYSIWYG strict',
    features: [
      `CORRECTIONS — Report : état formulaire réinitialisé au changement de semaine (la page "Merci" ne restait plus affichée sur la semaine suivante vide). Sign /new : templates kind=report exclus du dropdown "Nouvel envoi" (réservés au module Rapports). Sign /new : champ Société affiché uniquement si le template sélectionné contient réellement un champ entreprise (plus de faux positif avec les uploads manuels). Éditeur template : badges numéros d'étapes sur chaque champ (cercles colorés 16×16, toggle "🔢 Étapes" dans la toolbar, persisté localStorage). WizardEditor : modal champs orphelins remplace le bandeau inline — bouton "⚠️ X orphelins" dans la toolbar (caché si 0), modal avec liste scrollable, bouton Localiser par champ (info page/coords), select étape cible + Ajouter par champ, Supprimer individuel, footer bulk sélection multiple. Wizard builder : fix "Re-générer auto" — les champs type=date saisis par le candidat (ex : jours de semaine rapport d'heures) n'atterrissent plus dans l'étape Signature ; seuls les datesigned (metadata.tabType='datesigned') y sont classés.`,
      `SIGN PHASE 4 COMPLET — Signature canvas mobile-friendly (drawn uniquement, fond transparent), génération PDF stampé final via stampPdf multi-pass + page certificat A4 ZertES (logo L-Agence, tableau signataires, IP, hash SHA-256, footer RS 943.03 + eIDAS), workflow séquentiel (triggerNextSigner parallel routing + notif sender à chaque signature), routes download auth + lien public ZIP DEFLATE multi-docs, WhatsApp comme canal de livraison (delivery_channel email/whatsapp/both + recipient_phone E.164).`,
      `SIGN — Refonte UI complète DocuSign-style : page /sign avec mini-sidebar 5 sections (Tous/En cours/Complétés/Brouillons/Expirés-Refusés), filtres avancés (date/statut/catégorie), TemplatesTable avec checkbox bulk + favoris + menu actions ⋮ (modifier/dupliquer/convertir kind/supprimer), page /sign/new full-screen 3 sections (Documents/Templates/Destinataires), importateur DocuSign JSON, éditeur visuel template Konva (drag&drop fields, lasso, multi-drag, undo/redo, copy/paste, zoom). Mode Wizard ↔ Mode Document. ConsentModal CGU ZertES bloquant + audit log complet.`,
      `SIGN — Contraintes resize signature/initial style DocuSign : signature ratio 3:1 + minW 0.15 maxW 0.60 / initial ratio 1:1 carré + minW 0.04 maxW 0.15. Tailles création par défaut alignées sur les contraintes. onHandleDragMove détecte direction du resize (horizontal/vertical) et contraint l\'autre axe automatiquement.`,
      `SIGN — Bouton "Aperçu PDF" dans l\'éditeur de template : nouvelle route POST /api/sign/templates/[id]/preview qui stampe le PDF avec données fictives pour TOUS les types de fields (Lorem/42/2026-05-09/Jean Dupont + signatures rendues comme [Signature]/[Paraphe]). Stream inline pour iframe modal. WYSIWYG strict garanti — ce que l\'admin voit dans l\'éditeur = ce qu\'il obtient dans le PDF stampé final.`,
      `SIGN — drawTextInBox WYSIWYG strict : centrage texte calé sur Konva verticalAlign="middle" (formule y + (h - size × 0.7) / 2). Cohérence éditeur ↔ PDF stampé pour TOUS les types (text/number/date/select/fullname/firstname/lastname/email/company/title/formula).`,
      `RAPPORTS — Nouveau module /sign/rapports (intégré dans Sign, pas de sidebar séparée). Liens permanents par candidat (slug prenom-nom-lagence-XXXX jamais réutilisé). Réutilise sign_templates avec kind=report. Page candidat /report/[slug] avec sélecteur 8 dernières semaines + auto-fill dates par jour + auto-save localStorage immédiat + DB toutes les 30s. Réutilise PublicPdfViewer + PublicFieldsLayer + SignWizard + SignaturePad (zéro doublon). Mode envoi distant uniquement (TTL 7j email/WhatsApp client).`,
      `RAPPORTS — Refonte mode liste DocuSign-style (sidebar Liens Tous/Actifs/En pause/Révoqués + tableau colonnes Candidat/Client/Contact/Statut/Dernière/Actions, menu ⋮ portalisé). Card affiche contact client + page détail header complet 8 InfoCards (candidat name/email/phone + client entreprise/contact/email + canal). Bouton Réactiver pour liens révoqués + Supprimer définitivement.`,
      `RAPPORTS — Page /sign/rapports/new : autocomplete candidat (prénom+nom+email+téléphone pré-remplis depuis DB) + autocomplete client+contacts (1 ligne par contact, ligne header "Choisir cette entreprise" + dialog "Enregistrer ce contact ?" si email modifié → POST /api/clients/[id]/add-contact). Boutons "Tout effacer" par section + X reset complet.`,
      `RAPPORTS — Pipeline finalisation : lib/report/pdf-generator.ts réutilise stampPdf Sign (multi-pass Candidat puis Client) + page certificat dédiée. Upload signed/reports/{linkId}/{submissionId}/. Distribution attachments par destinataire : créateur reçoit RAPPORT + CERTIFICAT (Resend pièces jointes), client + candidat reçoivent UNIQUEMENT le rapport (cert privé créateur). Email créateur TOUJOURS envoyé. Notif WhatsApp candidat post-signature avec lien public.`,
      `RAPPORTS — Routes API : /api/admin/reports/* (dashboard) séparées de /api/reports/* (publiques) — namespace strict pour éviter conflit Next.js Route Groups. Routes publiques : verify-link, save-draft (upsert), submit (signature candidat), document (stream PDF), client/[token] (verify+sign+document), download (PDF rapport, exclut certif), certificate (PDF certif dédié), resend (refresh client_token TTL 7j + renvoi notif).`,
      `RAPPORTS — Modal viewer iframe (PdfPreviewModal portail + boutons Télécharger/Fermer) sur tableau historique submissions : 3 boutons par ligne complétée (Aperçu / Rapport / Certificat). Bouton compact "Envoyer au client" / "Valider et signer" en haut DESKTOP des pages publiques (footer sticky bottom mobile only). Indicateur "⚠️ Champs requis manquants" si !canFinalize.`,
      `WhatsApp safe — toWhatsAppSafe LATIN_MAP exhaustive (FR/PT/ES/DE/IT) + ponctuation Unicode étendue (em-dash U+2014, smart quotes, ellipsis, arrows, NBSP, ZWSP, °, €, ©, ®, ™) appliquée sur le MESSAGE ENTIER. Strip 👋 emoji (rendu ◆ chez certaines apps WA). window.open _blank au lieu de location.href. Deep link wa.me/{phoneDigits}?text=... avec phone candidat E.164.`,
      `PDF — Conversion script one-shot rapport_heures.pdf : 607×431pt (custom paysage) → A4 portrait 595×842 via pdf-lib embedPage + scale-fit. Logs diagnostic [report/pdf-generator] page sizes + [pdf-stamp] field coords par field stampé pour debug placement. Format dates JJ.MM.AAAA déterministe (formatDateChDot, indépendant ICU Vercel). Auto-fill défensif fullname pour fields type=text avec label "Collaborateur(trice)" sans config admin.`,
      `DB — 7 nouvelles tables : sign_templates, sign_envelopes, sign_tokens, sign_audit_log, report_links, report_submissions, report_audit_log. Extensions : sign_templates.kind, sign_envelopes.delivery_channel + signed_pdf_paths, sign_tokens.recipient_phone + signature_*, report_links.candidat_phone/email/contact_name. RLS auth team partagée. Bucket Storage talentflow-sign avec préfixes templates/ envelopes/ signed/ signed/reports/{linkId}/.`,
      `STACK — Nouvelles dépendances npm : konva + react-konva (éditeur visuel template), @dnd-kit/core + sortable + utilities (réordonnancement wizard/recipients), qrcode + @types/qrcode (legacy QR mode présentiel, désormais inactif).`,
    ],
  },
  {
    version: '2.1.20',
    date: '2026-05-08',
    label: 'Sign Pack 1 (rôle suivant voit le rapport rempli) + autocomplete + suggestion contact + fix pipeline modal métiers',
    features: [
      'SIGN PACK 1 — Le rôle 2 (client) voit désormais les valeurs remplies par le rôle 1 (candidat) AVANT de signer. `verify-token` agrège les `field_values` des signers précédents → exposés en `previousFieldValues` + `previousSignerNames`. `PublicFieldsLayer` rend tous les fields du PDF (read-only en vert pour les rôles précédents, masqué pour les rôles futurs). `SignWizard` ajoute un bandeau vert "📋 [Nom] a déjà rempli le rapport" avec bouton "Voir le rapport" qui passe en mode document.',
      'SIGN — Filtrage des wizard steps par `recipientOrder` du destinataire courant. Avant : le candidat voyait "ÉTAPE 1/6" alors qu\'il devrait voir "1/4" (les 2 steps de signature client étaient inclus à tort).',
      'SIGN — Bouton "Document complet" retiré du header interne du SignWizard (doublon avec "Document" dans header global).',
      'SIGN — Header mobile coupé : padding + `env(safe-area-inset-top)` pour éviter chevauchement avec barre Outlook/iOS. minHeight passé de 56→64px sur mobile.',
      'SIGN /sign/new — Autocomplete candidats restauré dans `RoleFixedRecipients` (mode template). Régression : les inputs étaient devenus `<input>` natifs sans recherche DB. Réutilisation du composant `FirstNameAutocomplete` exporté depuis `RecipientCard`.',
      'SIGN /sign/new — Bandeau "Ajouter comme contact de [Client]" : quand l\'admin tape un email dont le domaine match une entreprise déjà dans la base clients, un bandeau jaune propose d\'ajouter ce destinataire comme contact. Bouton "Ajouter" → POST atomic dans `clients.contacts` (jsonb). Si déjà contact : bandeau vert "✓ Déjà contact". 25 domaines génériques exclus (gmail, hotmail, etc.).',
      'SIGN — Nouveaux endpoints : `GET /api/clients/match-email?email=XXX` (match par domaine site_web/email principal) + `POST /api/clients/[id]/add-contact` (append idempotent contact JSONB).',
      'PIPELINE MODAL FICHE CANDIDAT — Dropdown "Métier" était vide ("— Aucun —" seul). Bug : `useMetiers()` retourne `string[]` mais le dropdown itérait avec `m.nom` (undefined sur string). Fix : `m` utilisé directement comme string. Tous les métiers configurés s\'affichent maintenant.',
    ],
  },
  {
    version: '2.1.19',
    date: '2026-05-07',
    label: 'Pack 5 bugs UX + Secrétariat v2 + TalentFlow Sign base structure (Phase 1)',
    features: [
      'LISTE CLIENTS — Ajout flèches de pagination (←/→) dans le header, identiques à la liste candidats. Le simple "· Page X / Y" est remplacé par boutons ChevronLeft/ChevronRight désactivés aux extrêmes.',
      'MATCHING IA — Scroll horizontal ajouté sur le container résultats + minWidth 580px sur les cards candidats. La liste ne se coupe plus sur petit écran.',
      'LISTE CANDIDATS — Nouvelle colonne "Téléphone" (130px, avec icône Phone, ellipsis si long) entre Lieu et Âge.',
      'LISTE CANDIDATS — Badges colorés (🟢 Nouveau / 🟡 Réactivé / 🔵 Actualisé) : fallback ajouté quand `onedrive_change_type` et localStorage sont null mais `last_import_at > created_at + 1j` (candidats mis à jour avant la feature badge).',
      'FICHE CANDIDAT — Panel Infos (mode Modifier) rendu en `position: absolute` overlay au lieu d\'enfant flex. Le viewer CV ne se déplace plus vers la droite à l\'édition.',
      'PIPELINE MODAL — `overflow: hidden` supprimé du wrapper modal "Ajouter au Pipeline". Le dropdown métier `<select>` ne se fait plus clipper dans Chrome.',
      'SECRÉTARIAT — Refonte complète du dashboard secrétariat : nouveau module Administration v2 avec navigation par onglets, gestion candidats, accidents, ALFA, paiements, loyers, notifications améliorées.',
      'SECRÉTARIAT API — Endpoints `/notifications/[id]/cest-fait` et `/notifications/fin-alfa-actives` pour marquer notifications et gérer les fins ALFA.',
      'NORMALISATION — Fix téléphones France : `inferPaysFromLocalisation` détecte maintenant les CP 5 chiffres (France) avant les mots-clés. `normalizeTelephone` : règle unifiée "pays localisation = seul arbitre" pour ambiguïté CH/FR.',
      'SIDEBAR — Renommage "Secrétariat" → "Administration" + nouvelle entrée "Signatures" (icône FileSignature, cachée pour Secrétaire).',
      'SIGN PHASE 1 — Base de données (4 tables : sign_templates, sign_envelopes, sign_tokens, sign_audit_log) + pages structure (`/sign`, `/sign/templates`, `/sign/[id]`) + page publique `/sign/[token]` (viewer PDF "en cours de finalisation") + section dans fiche candidat. Workflow de signature électronique complet en Phase 2.',
    ],
  },
  {
    version: '2.1.18',
    date: '2026-05-05',
    label: 'Pack consolidé 11 fixes (Notes header + Map fiche client, signature v2, historique envois, modal commandes v2, tri secteurs, pills compteur, header liste centré, etc.)',
    features: [
      'FICHE CLIENT NOTES — Boîte Notes en bas SUPPRIMÉE. Remplacée par bouton MessageSquare dans le header avec point rouge si notes existent + tooltip preview au mouseover + clic ouvre modal édition. Pattern cohérent fiche candidat.',
      'FICHE CLIENT MAP LEAFLET — Nouveau composant `ClientFicheMap.tsx` (Leaflet + react-leaflet, lazy SSR-off) affiché en bas si lat/lng. 1 marker, popup avec nom + adresse + lien Google Maps itinéraire. Hauteur 340px.',
      'FICHE CLIENT — Card "Secteurs d\'activité" déplacée TOUT EN BAS (après Map). Avant : au milieu juste après Notes.',
      'PARAMETRES PROFIL SIGNATURE — Boutons "Aperçu" / "HTML source" en jaune brand actif + foreground inactif (avant : blanc/blanc invisible en dark). Bouton Enregistrer passé du violet au jaune brand v2. Aperçu fond blanc fixe + text:#111 (signatures HTML utilisent souvent couleurs sombres). Mode HTML source PAR DÉFAUT (édition directe vs Aperçu read-only).',
      'PARAMETRES SECTEURS — Tri "Par catégorie de métier" et "Par couleur" ne marchaient pas (catOf retournait `cat_` + métier au lieu de la vraie catégorie). Fix : utilise `categories` du hook `useMetierCategories` pour mapper métier → catégorie, et conversion HEX→hue HSL pour tri couleur stable.',
      'HISTORIQUE ENVOIS — Le destinataire affiché utilisait le candidat[0] (ex: "Romuald Trinel") au lieu du client. Fix : prio `client_nom > destinataires[0] > candidats[0]`. Panneau preview : section "À" affiche le client (🏢) + emails. Section séparée "Candidats proposés" avec pills jaune cliquables (lien vers fiche). Hover preview CV sur les pills via `useCvHoverPreview` + `CvHoverTrigger` (style cohérent liste candidats). API `/api/emails/history` étendue avec `cv_url` + `cv_nom_fichier` + `corps_full` (corps complet sans signature, heuristique regex `\\n\\n+Cordialement/Bien à vous/Sincères/etc.`).',
      'MODAL COMMANDES — Modal "Candidats liés à une commande" (OffreCandidatsModal) en design v2 : Instrument Serif 24 + Jakarta wrapper + bouton X 34×34 v2 + backdrop blur 6 + box header primary-soft 44×44.',
      'COHÉRENCE PILL COMPTEUR — Sur Clients, Commandes et Pipeline : ajout d\'un pill `var(--secondary)` à droite du titre (style identique à Candidats), avec count tabular-nums fr-CH. Suppression des sous-titres "X entreprises trouvées / X commandes / X candidats en suivi" (info redondante).',
      'HEADER LISTE CANDIDATS — `headerCellStyleCenter` (justifyContent + textAlign center) sur tous les labels colonnes droite (Évaluation/Notes/CFC/Engagé/Mise à jour/Valider) + `justifyContent: center` sur tous les wrappers row. En mode Actif les pills CFC/Engagé restent INLINE après l\'âge. Header CFC/Engagé columns seulement en mode À traiter.',
    ],
  },
  {
    version: '2.1.14',
    date: '2026-05-05',
    label: '3 fixes (header alignement par colonne, badge clients persiste, email/tel manquants fiche client)',
    features: [
      'HEADER LISTE CANDIDATS — Alignement par colonne corrigé (cassait le mode "Actif" en v2.1.13). LEFT pour Évaluation/CFC/Engagé/Mise à jour (contenu rows à gauche), CENTER pour Notes/Valider (bouton centré dans la cell). Nom/Lieu/Âge restent à gauche.',
      'BADGE CLIENT NOUVEAU — Restait visible dans la liste après ouverture de la fiche (était basé seulement sur `clientsLastSeen` global). Fix : nouveau helper `lib/clients-seen.ts` qui maintient un Set localStorage `talentflow_clients_seen_ids` (max 5000 IDs LRU). `useEffect` au mount de `/clients/[id]` → `markClientSeen(id)` + broadcast event `talentflow:client-seen`. La liste écoute l\'event et re-render → badge disparaît.',
      'FICHE CLIENT — Email + Téléphone général étaient enregistrés en DB et visibles dans le modal d\'édition mais PAS affichés dans la card "Informations" en lecture. Ajout de 2 rows entre Adresse et Site, avec lien `mailto:` / `tel:` cliquable.',
    ],
  },
  {
    version: '2.1.13',
    date: '2026-05-05',
    label: 'Header liste candidats : labels centrés colonnes droite (alignement visuel pills/étoiles) + fusion 17 doublons clients appliquée',
    features: [
      'LISTE CANDIDATS HEADER — Labels des colonnes DROITE (Évaluation, Notes, CFC, Engagé, Mise à jour, Valider) maintenant `justifyContent: center + textAlign: center` (avant : flex-start = labels à gauche alors que pills/étoiles sont visuellement centrés). Nom/Lieu/Âge restent alignés à gauche (matchent le contenu rows à gauche).',
      'FUSION DOUBLONS CLIENTS APPLIQUÉE — 17 fusions effectuées via `scripts/batch/merge-doublons-clients.ts --apply`. Logique winner : zefix_uid > nb contacts > ancienneté. 1131 → 1114 clients. Aucune FK orpheline (0 emails / 0 entretiens / 0 missions à migrer car les doublons étaient récents et pas encore utilisés). Contacts JSONB mergés avec dédup par email lowercase. Champs manquants du winner remplis depuis les losers (adresse, secteur, secteurs_activite, site_web, etc.). CSV rapport sur Desktop.',
    ],
  },
  {
    version: '2.1.12',
    date: '2026-05-05',
    label: 'Pack 4 fixes (header liste candidats aligné, modal Prospection v2, audit doublons clients, secteurs réorder + tri auto)',
    features: [
      'LISTE CANDIDATS HEADER — Décalé d\'environ 36px par rapport aux rows (visible surtout sur "À traiter"). Cause : header `gap: 14, padding: 18` vs row `gap: 10, padding: 14` (compaction v2.0.3 jamais propagée au header). Fix : aligné gap+padding identiques.',
      'MODAL PROSPECTION EMAIL EN LOT — Polish design v2 : Instrument Serif 24 sur le titre + Jakarta wrapper + bouton X 34×34 v2 + backdrop blur 6 + bordure 1px (avant : 2px). Bouton Retour avec radius 10 + Jakarta. Icône Mail dans box 44×44.',
      'AUDIT DOUBLONS CLIENTS — Script standalone `scripts/batch/audit-doublons-clients.ts` qui groupe les clients par nom_entreprise + ville (normalisés : lowercase, accents, suffixes SA/Sàrl/AG strippés). Run : `npx tsx --env-file=.env.local scripts/batch/audit-doublons-clients.ts`. Résultat actuel : 17 groupes / 34 clients dupliqués détectés (CSV exporté sur le Desktop).',
      'SECTEURS D\'ACTIVITÉ /parametres — Réorder complet : (a) Drag&drop natif HTML5 sur chaque card (handle GripVertical visible) + opacity 0.4 + bordure brand au drag. (b) Boutons ↑↓ compacts pour réordonner sans souris. (c) Bouton "Trier par…" en haut avec dropdown 2 options : par catégorie de métier (group + alphabétique) ou par couleur (hex). Toast "X secteurs réordonnés" après save. (d) Bouton "Valider"/"Ajouter" en JAUNE BRAND (au lieu de className neo-btn-primary qui rendait gris/foncé). Numérotation #N basée sur position visible (1..N) au lieu de l\'ordre interne.',
    ],
  },
  {
    version: '2.1.11',
    date: '2026-05-04',
    label: 'Pack 6 fixes (tooltip secteurs clients, badges sidebar rouges, reset mailing, nom CV, genre, panneau Infos v2)',
    features: [
      'LISTE CLIENTS — Hover sur cellule Secteur (clients avec 2+ secteurs) affiche désormais un TOOLTIP PORTAL avec tous les secteurs (style cohérent avec liste candidats Métiers). Avant : `title=` HTML basique pas joli.',
      'SIDEBAR BADGES — Tous les badges sections (Clients/Commandes/Entretiens/Secrétariat) passent en ROUGE (avant : surface-3/muted gris pour les sections génériques). Padding dynamique : 0 pour 1 chiffre (cercle parfait centré) + `0 5px` pour 2+ chiffres. fontSize bumpé 10→11 pour lisibilité. fontVariantNumeric tabular-nums + lineHeight 1.',
      'MAILING NOUVEL ENVOI — Reset COMPLET du formulaire après envoi réussi (avant : seul corps/sujet/contexteIA était reset → candidats joints + destinataires clients restaient mémorisés). Reset : candidatIds, cvAttached, extraDocs, candidatDocsCache, destinataires, ccEmails, overrides, previewIdx, templateId, civiliteByCandidat, customByCandidat + clear sessionStorage `talentflow_mailing_session`.',
      'PIÈCE JOINTE CV MAILING — Nom de fichier renommé en `cv_prenom_nom_YYYY-MM-DD.ext` (avant : nom original brut "PINTO PEREIRA PASSOS vitor manuel 07.03.2022.docx" pas pro pour le client). Sanitize accents/espaces → `_`. Supporte ext PDF/DOCX/DOC/JPG/JPEG/PNG avec contentType correct.',
      'FICHE CANDIDAT GENRE — Affichage Homme/Femme avec emoji 👨/👩 dans la banner après l\'âge (avant : pas affiché en lecture). Masqué si null ou autre valeur.',
      'PANNEAU INFORMATIONS FICHE CANDIDAT — Slide-over droite refondu design v2 : Instrument Serif 22 sur "Informations" + Jakarta wrapper + bouton X 32×32 v2 + backdrop blur 6 + width 380 + padding 20/24 + labels uppercase 10.5px + valeurs 13.5px lineHeight 1.4.',
    ],
  },
  {
    version: '2.1.10',
    date: '2026-05-04',
    label: 'Fix bouton Retour fiche candidat avec CV Word (Edge) — pollution history par iframe Office',
    features: [
      'BOUTON RETOUR FICHE CANDIDAT — Bug Seb sur Edge/Windows : ouvrir une fiche avec CV `.docx`/`.doc` puis cliquer "Retour" → URL change mais reste sur la fiche. Cause : l\'iframe Office Web Viewer (`view.officeapps.live.com`) pollue `window.history` du parent (loading viewer + ouvertures internes Office). `router.back()` revient sur ces entries non-navigables. Fix : snapshot de `window.history.length` au mount via useRef. Si à l\'instant du clic Retour le length a augmenté, on détecte la pollution → on force `router.push(fallbackRoute)` au lieu de `router.back()`. Solution générique (pas de check `cvIsWord` hardcodé) qui couvre aussi tout autre cas de pollution future. Edge montrait juste plus le bug — Chromium est plus permissif sur les history pushes des iframes externes que Firefox/Safari.',
    ],
  },
  {
    version: '2.1.9',
    date: '2026-05-04',
    label: 'Fix tri /clients : "Plus récents" propagé server-side (avant : tri front-only sur page courante)',
    features: [
      'TRI CLIENTS — Le sélecteur "Plus récents / A→Z / Z→A" sur /clients ne triait que la page courante côté front (20 résultats) après que l\'API ait déjà trié par nom_entreprise ASC. Résultat : un nouveau client (ex Z Truc Sàrl) restait page 62 au lieu d\'apparaître page 1 en mode "Plus récents". Fix : ajout du param `?sort=recent|az|za` à `/api/clients` GET + propagation via hook `useClients` (`filters.sort`) + page passe `sortOrder` au hook. Tri server-side respecte aussi la pagination → un nouveau client apparaît bien en page 1 quand "Plus récents" est sélectionné.',
    ],
  },
  {
    version: '2.1.8',
    date: '2026-05-04',
    label: 'Pack 5 fixes (pipeline cats horizontal, polish v2 8 pages /parametres + /outils, refonte métiers/secteurs)',
    features: [
      'PIPELINE — Pills métiers : passage de la disposition VERTICALE (lignes empilées par catégorie) à une BARRE HORIZONTALE de catégories cliquables. Click sur une catégorie → DROPDOWN affichant les métiers de cette catégorie en pills design v2 avec scale brand au sélectionné. Catégorie de métier actif soulignée (bordure basse colorée). Bouton "Tous" en début de barre + "Autres" en fin. État `activeCategory` reset au changement de consultant.',
      'POLISH V2 (4 pages outils/parametres) — Headers passés en Instrument Serif 32px + Jakarta wrapper sur : `/parametres/doublons` (+ card v2 + bandeau success/warning soft + bouton Lancer brand v2), `/parametres/import-masse`, `/outils/analyser-candidats`, `/outils/rapport-heures`.',
      'RAPPORT D\'HEURES — Labels Type de journée raccourcis ("Heures travaillées" → "Travail", "Jour férié" → "Férié", etc.) pour ne plus être tronqués dans la cellule étroite. Bandeau "Semaine N · DD.MM au DD.MM" : couleur passée de `var(--muted)` (illisible sur fond orange-soft) à `COLOR` (orange brand) bold pour contraste.',
      'REFONTE /parametres/metiers — Header serif v2 + pills métiers refondues : background `var(--surface)` + bordure subtile (au lieu de primary-soft+primary jaune intense partout) + hover affiche bordure brand + bouton X qui passe en destructive au hover. Compteur "X métiers définis" en label uppercase au-dessus.',
      'REFONTE /parametres/secteurs-activite — Header serif v2 + sous-titre en muted-foreground.',
      'POLISH V2 /parametres/profil + /parametres/demandes-acces + /parametres/admin — Wrapper Jakarta + Instrument Serif 32 sur les titres (avant : sans-serif 24).',
    ],
  },
  {
    version: '2.1.7',
    date: '2026-05-04',
    label: '2 fixes : badge "Nouveau" décalé en mode À traiter + badges sidebar cercle parfait (box-sizing)',
    features: [
      'BADGE "NOUVEAU" LISTE CANDIDATS — En mode "À traiter", le badge vert "Nouveau" chevauchait le bouton Valider vert (à droite de la card). Fix : `right: 60` au lieu de 6 quand `importStatusFilter === a_traiter` → décalé à gauche du bouton Valider.',
      'BADGES SIDEBAR — Forme ovale avec chiffre mal centré quand 1 chiffre. Fix : ajout `boxSizing: border-box` sur tous les badges sidebar (Candidats / sections génériques / Entretiens / Secrétariat) → cercle parfait quand 1 chiffre, expand propre 2+ chiffres. + `lineHeight: 1` + `fontVariantNumeric: tabular-nums` pour centrage vertical net.',
    ],
  },
  {
    version: '2.1.6',
    date: '2026-05-04',
    label: 'Refontes Modal Notes (slide-over → modal centré v2) + Modal Documents (taille + bouton Ajouter brand)',
    features: [
      'MODAL NOTES FICHE CANDIDAT — Refonte complète : passage du panneau slide-over à droite (design ancien, pas v2) à un MODAL CENTRÉ portalisé style cohérent avec DocumentsPanel. Header Instrument Serif 22px "Notes · {Nom}" + sous-titre count. Composer textarea v2 + bouton Envoyer JAUNE BRAND (au lieu className neo-btn gris). Cards notes design v2 : background var(--surface) + border 12 + boutons icônes 28×28 v2 (Pencil hover jaune / Trash hover destructive-soft). État vide avec border dashed + helper text. Mode édition inline avec textarea border primary 1.5 + Cmd/Ctrl+Enter pour sauver, Échap pour annuler.',
      'MODAL DOCUMENTS — Taille augmentée 700→900px (demande João : ouvrir spacieux même si 1 doc). Bouton "Ajouter" passé en JAUNE BRAND (avant : `surface-2` qui devenait `surface-3` gris moche au hover). Hover : translateY(-1px) + box-shadow renforcée pour effet brand cohérent avec les autres CTAs primary de l\'app.',
    ],
  },
  {
    version: '2.1.5',
    date: '2026-05-04',
    label: 'Pack 11 fixes UX (menu 3 points, photo gauche, bulk bar, modal rappel v2, dédup toasts)',
    features: [
      'FICHE CANDIDAT — Menu 3 points polish design v2 (Jakarta + hover var(--secondary)) + nouveau bouton "Pipeline" (mêmes options que liste candidats : modal mini avec étape, consultant João/Seb, métier).',
      'LISTE CLIENTS — Tooltip mouseover sur cellule Secteur affiche TOUS les secteurs assignés (avant : seul le 1er + "+N" sans tooltip).',
      'FICHE CANDIDAT — Notes popover header refondu design v2 (Jakarta + radius 14 + box-shadow soft + tabular-nums dates).',
      'FICHE CANDIDAT — Boutons photo déplacés à GAUCHE EN VERTICAL de la photo (au lieu d\'en bas qui rajoutait une ligne et épaississait la card). Photo réduite 140→120 pour cohérence.',
      'LISTE CANDIDATS — Bouton "Non vus" : si filtres ou recherche actifs, RESET automatique avant d\'appliquer le filtre (logique : si user clique Non vu, il s\'attend à voir les non-vus pas une intersection).',
      'DASHBOARD — Card "Alertes" supprimée du hero stats : c\'était un placeholder MORT (`stats.alertes` jamais calculé → toujours 0). Remplacement futur si nouvelle sémantique trouvée.',
      'LISTE CANDIDATS BARRE BULK — Refonte ordre : pill "X sélectionnés" supprimée (info déjà dans titre), bouton Archiver supprimé partout (n\'existait plus comme onglet), Vu/Non vu déplacé à gauche (avec Tout/Désél/À traiter), Pipeline déplacé à droite (avec Lier à commande).',
      'MISSIONS — Col Dates passée en flex strict 0 0 180px (avant : 0 1 155 qui shrinkait sous 155px → date_fin tronquée par Répart.). Coeff col 50→60. Overflow:hidden+ellipsis sur la date pour propreté.',
      'PIPELINE — Modal "Rappel" refondu design v2 : Instrument Serif 24px title + Jakarta wrapper + boutons inline v2 (au lieu className neo-btn).',
      'TOASTS — Position Sonner top-right → bottom-right (cachait Importer CV / cloche / profil dans le header). offset 20.',
      'TOASTS RAPPELS — Dédup via `id` Sonner stable : `rappel-deleted-{id}` empêche le double toast quand suppression cascade modal+panel. `rappel-notif-{id}` permet de dismiss la notif permanente "🔔 Rappel" dès que le rappel est supprimé/marqué done.',
    ],
  },
  {
    version: '2.1.0',
    date: '2026-05-04',
    label: 'TalentFlow 2.1 — Polish complet post-V2 (50+ fixes UX/design groupés par thème)',
    features: [
      'SÉCURITÉ ADMIN HARDENED — `requireAdmin` côté serveur accepte désormais email==ADMIN_EMAIL OU user_metadata.role∈{Admin,Administrateur} (évite 403 quand ADMIN_EMAIL Vercel diffère). Hub /parametres : sections "Demandes d\'accès" et "Administration" filtrées côté client. Pages /parametres/admin et /parametres/demandes-acces : guard `useRequireAdmin()` redirige vers /parametres si non-admin. Sidebar cohérente via helper `isAdminUser()`.',
      'PIPELINE REFONTE COMPLÈTE — Passage de la grille 3 cols à une LISTE grid horizontal avec colonnes alignées (Photo 48 / Nom+métier flex / Lieu 200 / Âge 50 / Notes 220 / Rappel 90 / Actions 180) + header colonnes Jakarta uppercase. Pills métiers GROUPÉES PAR CATÉGORIE (Maçonnerie, Électricité, etc.) via `useMetierCategories`, séparateurs pointillés + label catégorie coloré (avant : wrap flat à la rache). Onglet métier actif : point blanc + texte foncé contrastant. Modal "Mes rappels" contraste corrigé.',
      'LISTE CANDIDATS — Compaction massive : avatar 68→48, padding row 8/14, gap 10, radius 12, nom 14px, INFO col 260, étoiles col 110, notes col 48 + bouton 24, âge pill 11px. Onglets Actif/À traiter h28 segmented control V2 (vert/orange soft). Mini-pager inline (chevrons + Page X/Y) à côté du compteur "/ N" dans la barre filtres. Compteur total en pill tabular-nums. Onglet Archivé supprimé. Affiche jusqu\'à 2 métiers + "+N" tooltip portal. Petit œil sur photo supprimé (hover CV reste sur l\'avatar). Délai CV preview 200→60ms ouverture, 200→80ms fermeture. Fade overflow sur localisation/nom (plus de débordement). Police Jakarta forcée partout (paging, selecteurs, labels).',
      'LISTE CLIENTS — Mode liste refondu en GRID horizontal style liste candidats avec header de colonnes (Statut / Nom / Lieu / Secteur / Téléphone / Email / Date). Email + téléphone CLIQUABLES (mailto/tel) avec stopPropagation. Logos clients via cascade logo.dev → Google Favicons → initiales. Modes grille et split conservent les cards classiques.',
      'FICHE CANDIDAT — Boutons photo (Camera/Crop/Rotation/Delete) en BAS de la photo en 18×18 avec couleurs originales (jaune brand / orange / bleu info-soft / rouge destructive-soft). Bouton ciseaux fonctionnel (`<PhotoCropModal>` déplacé au niveau racine, était dans col 1 cachée en lecture). Bouton "Documents" col 1 supprimé (doublonnait header). Bouton Valider VERT vif (bg #16A34A + border #15803D + shadow brand vert) — className neo-btn supprimée car overrides CSS bloquaient. Hover surbrillance brand jaune sur téléphone/email (cohérent hover lieu Google Maps). Pills CFC + Engagé en vert. WhatsApp + Mail header pré-remplissent sujet+corps. WhatsApp via `whatsapp://send?...` (app native) au lieu de wa.me/.',
      'WhatsApp + MAIL FICHE CANDIDAT — Boutons header pré-remplissent désormais sujet+corps email + message WhatsApp. WhatsApp ouvre l\'app native via `whatsapp://send?phone=X&text=MESSAGE`.',
      'SIDEBAR — Pointillés séparateurs supprimés (logo + footer Configuration). Padding logo réduit pour remonter la nav. Bouton toggle topbar : bordure 1.5px + box-shadow doublonnée supprimés (petit trait fantôme). Barre indicatrice gauche de l\'item actif : ORANGE FONCÉ #B45309 (cohérent brand jaune, contraste OK).',
      'TEMPLATES (/messages) — Refonte grid cards en LISTE compacte single-column (1 row par template : pastille canal + nom + sujet/preview + boutons "Copier vers" + Pencil + Trash). Modals "Nouveau template" et "Modifier le template" stylés design V2 : DialogContent en `var(--card)` + Jakarta + padding 24, DialogTitle en Instrument Serif 26px (au lieu sans-serif shadcn par défaut).',
      'MATCHING IA — Résultats en LISTE compacte (au lieu grille cards 340px). 1 row par candidat avec checkbox / rang / avatar / nom+métier+lieu / tags compétences ✓✗ / mini-barres / score circulaire / actions CV+Profil. "Vider résultats" reset aussi selectedIds. Modal Contacter : header Instrument Serif 22px + Jakarta wrapper.',
      'NOTES PREVIEW HOVER — Si candidat a une note, mouseover bouton notes affiche dernière note en preview (portail, pointer-events: none) sans ouvrir popover éditable.',
      'CATÉGORIE MÉTIER DROPDOWN — Police catégorie 11→12.5px uppercase letter-spacing. Pastille 7→9px.',
      'ENVOIS HISTORIQUE — Panneau droite affiche NOMS candidats (pill 👤 brand jaune) au lieu des numéros/emails si campagne a candidats liés.',
      'MODAL PROSPECTION — z-index sticky header passé à 5 (logos clients ne passent plus devant). Dropdown secteurs : pastille couleur résolue via mapping métier représentatif (cohérent pills cards clients).',
      'INTÉGRATIONS — Cards visuelles OneDrive/Microsoft 365/WhatsApp Business cachées (statut via panneau OneDrive). PendingValidation : wrapper externe orange-soft (alerte) + card intérieure `var(--card)` foncé en dark mode + DIFF intérieure (CHAMP / CANDIDAT SUSPECT / CV IMPORTÉ) en `var(--surface)` dark-aware avec bordure (avant : `#F9FAFB` hardcodé illisible en dark).',
      'OUTILS & PARAMÈTRES — Boutons retour internes "← Outils" supprimés sur 4 outils (analyser-candidats, rapport-heures, corriger-photos, doublons) qui doublonnaient le BackButton. ParametresBackButton intelligent : pour les 3 outils dans /parametres/*, label/href "Retour à outils" → /outils au lieu de /parametres.',
      'CV WORD VIEWER — Office Web Viewer Microsoft (`view.officeapps.live.com/op/embed.aspx`) au lieu de Google Docs Viewer deprecated qui cassait sur URLs Supabase signées.',
      'MISSIONS — fontFamily Jakarta forcée sur wrapper d-page (uniformise inputs/tables/textes natifs).',
      '"TOUT MARQUER VU" — Reset COMPLET (16-B) : badge rouge + badges colorés Nouveau/Actualisé/Réactivé. (a) localStorage `recently-updated` cleared, (b) DB UPDATE `onedrive_change_type=null + onedrive_change_at=null`, (c) invalidation `["candidats"]`. Side-effect cross-user assumé.',
      '0 LOGIQUE MÉTIER TOUCHÉE — `git diff main..HEAD -- app/api lib/supabase middleware.ts lib/candidat-matching* lib/cv-photo* lib/normalize-localisation lib/geocode-localisation` = 0 ligne. Tous les fixes 2.1 sont strictement design/UX.',
    ],
  },
  {
    version: '2.0.0',
    date: '2026-05-03',
    label: 'TalentFlow 2.0 — Interface entièrement repensée (Design V2) + 1 mois de fonctionnalités majeures',
    features: [
      'INTERFACE ENTIÈREMENT REPENSÉE (DESIGN V2) — Nouveaux tokens CSS (palette OKLCH "warm white" + or brand), polices DM Sans / Instrument Serif / JetBrains Mono, rayons 14-16px, ombres softer, fini le neo-brutaliste épais. Login en split layout crème + glow jaune + animations flottantes. Dashboard avec hero gradient + KPI cards V2 + sparklines. Sidebar épurée et simplifiée. TopBar avec search à gauche + bouton Importer + menu profil V2. Shell complet (sidebar/topbar/content) avec collapse fluide.',
      'PAGES PUBLIQUES REFONDUES — Login, Landing, Demande-accès, Reset-password, Verify-email, Accepter-invitation, CGU, Confidentialité, Mentions légales : tout passé en design V2 crème + brand jaune avec glassmorphism cards, Instrument Serif sur titres, boutons V2 (radius 10, plus de border noir épais).',
      'GÉOLOCALISATION CANDIDATS PAR RAYON — Filtre ville + slider km (10/25/50/100). 5556 candidats géocodés (95%). Lookup local CP CH/FR + Nominatim fallback. RPC PostgreSQL Haversine. Badge orange "12 km" sur card si filtre actif.',
      'NORMALISATION LOCALISATIONS CP VILLE PAYS — Format strict "CP Ville, Pays" via datasets geonames officiels (4228 villes CH + 34270 FR). 4942/5777 fiches normalisées en 4 min (90%).',
      'VUE CARTE CLIENTS (LEAFLET) — 4 modes : grille / liste / carte / split. Markers 1 par client avec popup HTML, clustering markercluster, géocodage rue précise via Nominatim (875/1025 = 85% rue précise, fallback centroïde NPA). 1219/1219 clients géocodés. Click card mode split = focus marker.',
      'PROSPECTION EMAIL IA EN LOT — Génération email personnalisé par client via Claude. Multi-sélection clients + métiers ciblés.',
      'ZEFIX RC SUISSE — Vérification automatique entreprises suisses (1145 entreprises vérifiées). 4 colonnes DB zefix_uid/status/name/verified_at. Modale "Ajouter client" 3 onglets (Zefix RC / Recherche IA / Manuel). Section fiche client avec badge statut + alertes liquidation/radiée.',
      'LOGOS ENTREPRISES AUTOMATIQUES — Cascade logo.dev → Google Favicons → initiales colorées. Intégré sur cards clients + header fiche + ClientPickerModal mailing + ProspectionModal.',
      'SECTEURS D\'ACTIVITÉ CLIENTS (23 SECTEURS) — Taxonomie éditable en DB (`secteurs_activite_config`, page admin `/parametres/secteurs-activite`). 1174/1221 clients enrichis (96.2%). Filtre multi-select dans /clients + pills sur cards + extraction auto des notes.',
      'PHOTOS CV AMÉLIORÉES — F1bis Vision crop scans A4 (banc test 22/22 100%, témoin 60/100). FlateDecode + DOCX grandes photos via Vision Haiku. 662 photos rétro-extraites en 22 min.',
      'AUTRES — ContactsEditor éditable mode card avec Pencil, pagination améliorée /clients (per_page 20/50/100/1000/Tous), garde-fou created_at ≤ last_import_at + colonne générée derniere_activite GREATEST, bandeau "Actualisé" pending-validation, mailing refondu individual/grouped, historique team partagé + warning 7j, templates 3 canaux harmonisés, cron cleanup 30j (préserve cv_importe/candidat_importe), badges vu/non-vu DB strict per-user, et tout le reste de v1.9.107 → v1.9.126.',
      '0 LOGIQUE MÉTIER TOUCHÉE PAR LE DESIGN — Les routes API, lib/supabase, middleware, lib/candidat-matching, lib/cv-photo, lib/normalize-localisation, lib/geocode-localisation sont strictement IDENTIQUES à la prod. Vérification : `git diff main..design-v2 -- <fichiers sensibles>` = 0 ligne.',
    ],
  },
  {
    version: '1.9.126',
    date: '2026-04-30',
    label: 'Tri missions actifs : nouvelle priorité "Fin bientôt" (0-7j) entre Début bientôt et Actif',
    features: [
      'TRI MISSIONS REVU — Avant : les missions qui finissaient aujourd\'hui ou dans 1-2 jours étaient noyées dans la priorité "Actif normal" et descendaient sous les missions en cours classiques. Cas signalé par João : Ted Coubard et Samuel Chereau finissaient aujourd\'hui mais étaient en bas de la liste, sous Ismael (qui démarre dans 4j). Fix : nouvelle priorité 4 "Fin bientôt" (date_fin entre aujourd\'hui et dans 7 jours) placée APRÈS "Début bientôt" (priorité 3) et AVANT "Actif normal" (priorité 5). Sub-tri spécifique par `date_fin ASC` → fin aujourd\'hui en premier, puis demain, puis 2j... jusqu\'à 7j max. Au-delà de 7j → priorité 5 (Actif normal). Ordre final : Arrêt > Vacances > Absence > Début bientôt > Fin bientôt > Actif normal > (Fin de Mission terminée — uniquement dans l\'onglet dédié).',
    ],
  },
  {
    version: '1.9.125',
    date: '2026-04-30',
    label: 'Dashboard graphique candidatures + cron preserve historique imports',
    features: [
      'FIX GRAPHIQUE CANDIDATURES REÇUES — Sur `/dashboard`, le graphique se sourçait sur `activites` (events `cv_importe` / `candidat_importe`). Or le cron `cleanup-old-data` (rétention 30j) supprime ces events au-delà de 30 jours → graphique quasi vide après quelques semaines (cas João : 489 candidats créés en mars + 382 en avril mais graphique affichait juste "1" pour avril). Fix : changement de source vers `candidats.created_at` (immuable depuis v1.9.90, jamais nettoyée). Sémantique : 1 candidat créé = 1 candidature reçue. Fenêtre 12 mois glissants. Limite 20000 lignes (largement au-dessus du volume actuel ~6000).',
      'CRON CLEANUP PRESERVE HISTORIQUE IMPORTS — `/api/cron/cleanup-old-data` exclut désormais les types `cv_importe` et `candidat_importe` du nettoyage 30j (audit + traçabilité longue durée). Les autres types (statut_change, candidat_modifie, candidat_supprime, etc.) restent à 30 jours pour ne pas saturer la table.',
    ],
  },
  {
    version: '1.9.124',
    date: '2026-04-30',
    label: 'Activité — selectAll multi-pages + retrait badge sidebar + déplacé en section Compte',
    features: [
      'FIX SELECTALL MULTI-PAGES — Sur `/activites`, le bouton "Tout sélectionner" cochait uniquement les activités de la **page courante** (typiquement 20). Cliquer "Supprimer" en effaçait donc 20 sur 78. Pour vraiment tout vider, il fallait utiliser le bouton "Vider l\'onglet" (peu visible). Fix : quand `total > activites.length` ET la page entière est cochée, un bandeau Gmail-style apparaît avec un bouton "Sélectionner toutes les X activités". Si activé, le DELETE bascule en mode `{ types }` (server-side, équivalent Vider l\'onglet) et un bandeau orange "Toutes les X activités sont sélectionnées" reste affiché jusqu\'à désélection.',
      'BADGE SIDEBAR ACTIVITÉ RETIRÉ — `/activites` supprimé de `BADGE_SECTION_MAP` (sidebar.tsx). Plus de pastille rouge. Justification : la page sert à consulter une trace ponctuellement, pas à être averti en temps réel.',
      'ACTIVITÉ DÉPLACÉ EN SECTION COMPTE — Lien "Activite" retiré de `NAV_ITEMS` (menu principal) et ajouté dans `FOOTER_ITEMS` après "Administration". Logique : ce n\'est pas une action quotidienne, c\'est un outil de contrôle/audit ponctuel, plus à sa place avec Outils/Admin/Paramètres.',
    ],
  },
  {
    version: '1.9.123',
    date: '2026-04-30',
    label: 'Fix CVCustomizer fetch fiche complète (experiences/formations vides depuis /messages)',
    features: [
      'CAUSE RÉELLE — Le fix v1.9.122 (`saved.experiences=[] → fallback candidat.experiences`) ne suffisait pas. Cause profonde : `LIST_COLUMNS` de `/api/candidats` (utilisé par `useCandidats` côté `/messages`) n\'inclut pas `experiences` ni `formations_details` (champs JSON lourds, exclus volontairement de la liste). L\'objet `cvCandidat` passé au `CVCustomizer` arrivait donc avec `experiences = undefined` → fallback `(candidat.experiences || []).map()` retournait `[]` → aperçu sans expériences ni formations même quand la sauvegarde était propre.',
      'FIX — Au montage de `CVCustomizer`, fetch la fiche complète via `/api/candidats/[id]` (qui retourne tous les champs) et utiliser ces données pour peupler les states. Skip le fetch si le candidat passé contient déjà ces champs (ex: ouverture depuis la fiche). Coût : 1 roundtrip réseau par ouverture, négligeable. Avantage : pas besoin d\'alourdir le payload de la liste candidats avec ces gros champs JSON pour 100-200 candidats fetch en bloc.',
    ],
  },
  {
    version: '1.9.122',
    date: '2026-04-30',
    label: 'Secteurs activité éditables (DB) + Calorifugeur + fixes CVCustomizer/Zefix/sélection multi-pages/detectChanges dates',
    features: [
      'FIX FAUX-POSITIF "MODIFIÉ" SUR DATES — Cliquer "Modifier" puis "Sauvegarder" sur une fiche candidat sans rien toucher générait quand même une activité `candidat_modifie` qui disait "1 champ(s) modifié(s): Date de modification" avec `old=03/10/2021, new=03/10/2021`. Cause double : (a) le client envoyait systématiquement `last_import_at` dans le PATCH dès que présent dans editData ; (b) le serveur comparait les dates via `String()` au lieu de timestamps → `"2021-10-03 12:00:00+00"` (Postgres) ≠ `"2021-10-03T12:00:00.000Z"` (ISO) bien que représentant la même date. Fix client : `saveEdit()` n\'envoie `last_import_at` que si la date a vraiment changé (comme `created_at`). Fix serveur : `detectChanges` compare `created_at`, `last_import_at`, `date_naissance` par `getTime()` au lieu de string. Conséquence : modifier numéro/email/etc. logge correctement l\'activité mais ne touche plus `last_import_at` ni `updated_at` inutilement. Activité parasite Franco Di Gregorio supprimée en DB.',
      'PANNEAU INFOS — "MODIFIÉ LE" UTILISE last_import_at — Avant : le panneau Informations à droite affichait `candidat.updated_at`, un timestamp DB système qui bouge à chaque UPDATE de la ligne (cron extract-cv-text, sync OneDrive, batch silencieux), peu importe le champ touché. Cas reproduit : Franco Di Gregorio créé en 2021, jamais re-importé, mais "Modifié le: 30 avril 2026" parce qu\'un cron a touché un champ aujourd\'hui. Fix : afficher `last_import_at` (sens métier = même date que la "Date modif" mode édition + tri liste candidats + cards). Cohérent partout.',
      'FIX SÉLECTION MULTI-PAGES — Quand on sélectionnait des candidats sur plusieurs pages dans `/candidats` (ex: 18 cochés sur 2-3 pages), le modal "Envoyer un message" / "WhatsApp" / la toolbar bulk Pipeline n\'affichaient que les candidats de la **page courante**. Cause : `sorted.filter(c => selectedIds.has(c.id))` filtrait `sorted` qui contient seulement la page courante (pagination serveur 20/page). Fix : nouveau cache `selectedDataRef` (`useRef<Map<id, Candidat>>`) qui se peuple à chaque cochage avec la donnée complète du candidat. Helper `getAllSelectedCandidats()` lit depuis le cache (fallback sur `sorted` si miss). Modaux Message + WhatsApp + toolbar bulk migrés. Plus de perte de sélection en changeant de page.',
      'NOUVEAU — Page `/parametres/secteurs-activite` (admin uniquement) pour éditer la taxonomie des secteurs clients : ajout, renommage, suppression, choix du métier représentatif (utilisé pour la couleur de pastille). Avant v1.9.122 : taxonomie fermée hardcodée dans `lib/secteurs-extractor.ts` (25 valeurs). Maintenant : table DB `secteurs_activite_config` (id, nom, ordre, metier_representatif). Fallback gracieux sur la constante hardcodée si table indispo.',
      'CALORIFUGEUR AJOUTÉ — Nouveau secteur seed dans la migration v1.9.122 (ordre 7, métier représentatif "Chauffagiste" pour la couleur). Demandé par João suite au cas IPSA Isolations.',
      'PROPAGATION AUTO RENAME — Renommer un secteur depuis `/parametres/secteurs-activite` met à jour automatiquement tous les clients qui l\'utilisent (`UPDATE clients SET secteurs_activite = ARRAY_REPLACE(...)` via RPC `rename_secteur_activite`). Le client reste lié au secteur, seul le nom change. Recherche, filtres, prospection, mailing voient le nouveau nom instantanément. Suppression : confirmation si secteur utilisé, RPC `remove_secteur_from_clients` retire le nom de tous les clients concernés.',
      'API CRUD — `/api/secteurs-activite` (GET liste authentifié, POST création admin) + `/[id]` (PATCH, DELETE admin avec check usage et `?force=true`). Hook `useSecteursActiviteConfig` (React Query, staleTime 5 min, invalide après mutations).',
      'PROPAGATION SERVEUR — `lib/secteurs-config-server.ts` cache module-level TTL 60s pour la liste DB côté API. `extractSecteursFromClient` et `sanitizeSecteurs` acceptent désormais une `validList` optionnelle. `/api/clients` POST/PATCH utilisent la liste DB. Auto-extraction depuis notes/NOGA reste basée sur les règles hardcodées (couvrent les 25 secteurs originaux) — les nouveaux secteurs DB se mappent manuellement via l\'UI.',
      'PROPAGATION CLIENT — `clients/page.tsx`, `clients/[id]/page.tsx`, `ProspectionModal`, `ClientPickerModal` (mailing) consomment désormais le hook au lieu de la constante. Filtres, dropdowns, pills, badges → tous synchronisés.',
      'FIX CVCUSTOMIZER — Sur `/messages` personnaliser CV : si la sauvegarde précédente avait `experiences: []` ou `formations: []` vides (race condition / corruption ancienne), on retombait dessus au lieu de relire les valeurs candidat → aperçu vide. Fix : exiger `length > 0` pour utiliser la sauvegarde, sinon fallback `candidat.experiences` / `candidat.formations_details`. Si l\'utilisateur veut vraiment 0 exp dans le mailing, il décoche "Inclure expériences" (toggle préservé). Cas reproduit : Anthony Thiery (12/18 customizations DB avaient `formations: []` vides à tort).',
      'FIX ZEFIX NOTES — Quand on ajoute un client via "Recherche IA Zefix" dans `/clients`, le code écrivait `notes: "UID: CHE-... | Source: zefix+ia"` dans les notes du client → polluait les vraies notes métier. L\'UID était déjà persisté dans la colonne `zefix_uid` (v1.9.117). Fix : retirer la ligne `notes` du POST, envoyer plutôt `zefix_uid + zefix_name + zefix_verified_at` directement aux colonnes dédiées. Backfill DB : 4 clients existants (Expert Isol SA, Rolex SA, Radio Chablais, S.R.D Société Romande de Démontage Sàrl) → notes nettoyées (NULL).',
    ],
  },
  {
    version: '1.9.121',
    date: '2026-04-30',
    label: '4 fixes UX : dropdown secteur z-index + tri rayon "Plus proche" + boutons contact lisibles + Sentry Leaflet zoom',
    features: [
      'FIX DROPDOWN SECTEUR — Sur `/clients` en vue carte ou split, le dropdown "Secteur" des filtres avancés s\'affichait derrière la map Leaflet (z-index 50 < panes Leaflet 400-1000). Passé à z-index 9999 (backdrop 9998) pour passer au-dessus.',
      'TRI LISTE CANDIDATS AVEC RAYON — Avant : quand on filtrait par ville+rayon, le tri "Plus récent" était silencieusement ignoré et la liste forçait un tri par distance ASC. Maintenant : le tri respecte le sélecteur (Plus récent reste le défaut), et une nouvelle option "📍 Plus proche" apparaît dans le sélecteur uniquement quand un filtre rayon est actif. Auto-reset de l\'option si on retire le rayon. API : la branche rayon de `/api/candidats` re-trie les IDs filtrés sur `derniere_activite` / `prenom+nom` / `titre_poste` (par batches de 200) selon le critère choisi avant pagination, en gardant `distance_km` attaché pour l\'affichage du badge orange.',
      'BOUTONS CONTACT LISIBLES — Sur la fiche client, le mode édition d\'un contact avait des boutons icônes ✓/✕ minuscules (14px) en `position: absolute` top-right avec couleur `--muted` sur fond similaire → quasi-invisibles sur le screenshot Seb. Remplacés par 2 vrais boutons texte en bas de la card : "Annuler" (gris bordure) + "Sauvegarder" (jaune brand). Cohérent avec `CardEditModal` du reste de la fiche.',
      'FIX SENTRY LEAFLET ZOOM — `TypeError: Cannot read properties of undefined (reading \'_leaflet_pos\')` remonté en prod (Sentry JAVASCRIPT-NEXTJS-8). Cause : `cluster.zoomToShowLayer(marker, callback)` lance une animation ~250ms ; si le composant se démonte avant la fin (changement de mode grid/list, navigation), le marker est retiré du cluster mais Leaflet appelle quand même le callback → crash. Fix : flag `cancelled` dans le cleanup useEffect + try/catch autour de `openPopup()`. Plus de crash silencieux côté user.',
    ],
  },
  {
    version: '1.9.120',
    date: '2026-04-30',
    label: 'Tri liste candidats robuste (GREATEST des 2 dates) + garde-fou édition date d\'ajout',
    features: [
      'FIX BUG TRI LISTE — Cause racine : le tri serveur utilisait `last_import_at DESC` strict, mais l\'affichage de la date utilisait `MAX(created_at, last_import_at)`. Si un consultant éditait manuellement la "Date d\'ajout" via le mode édition de la fiche pour la rendre plus récente que `last_import_at`, le candidat affichait la nouvelle date dans la liste mais restait classé à sa position chronologique de l\'ancienne `last_import_at` (souvent au fond de la liste, invisible sauf via le filtre Non vus). Cas reproduit : Mario Correia Rodrigues, fiche éditée hier avec date d\'ajout au 29/04 alors que `last_import_at = 20/01` → affichait "29 avr." mais classé au 20 janvier.',
      'NOUVELLE COLONNE GÉNÉRÉE — `candidats.derniere_activite TIMESTAMPTZ GENERATED ALWAYS AS (GREATEST(created_at, last_import_at)) STORED` + index `idx_candidats_derniere_activite DESC NULLS LAST`. Recalculée automatiquement par Postgres à chaque INSERT/UPDATE sur les 2 colonnes sources, 0 maintenance applicative. `GREATEST` ignore les NULL (renvoie l\'autre valeur si l\'une est NULL).',
      'TRI ALIGNÉ AFFICHAGE — `app/(dashboard)/api/candidats/route.ts` : 7 occurrences `.order(\'last_import_at\', ...)` remplacées par `.order(\'derniere_activite\', ...)` dans les 3 branches (search avec filtres, search sans filtre, query sans search, fallback batch). Le tri serveur match désormais l\'affichage UI exactement → plus jamais d\'incohérence quel que soit ce qui touche les 2 dates.',
      'GARDE-FOU CÔTÉ SERVEUR — `app/(dashboard)/api/candidats/[id]/route.ts` : le PATCH refuse désormais `created_at > last_import_at` (impossible logiquement : un candidat ne peut pas avoir été créé après avoir été modifié). Renvoie 400 avec message `"La date d\'ajout ne peut pas être plus récente que la date de modification. Vérifie les deux dates avant de sauvegarder."`. Garde la cohérence quel que soit l\'appelant (UI, script, postman).',
      'GARDE-FOU CÔTÉ CLIENT — `app/(dashboard)/candidats/[id]/page.tsx` `saveEdit()` : même validation avant le PATCH, avec toast d\'erreur clair. Évite le roundtrip serveur et donne un feedback immédiat.',
      'TRAÇABILITÉ MODIFS DATES — `created_at` et `last_import_at` ajoutés à `FIELD_LABELS` du PATCH route → toute modification manuelle de ces 2 dates est désormais loggée dans `activites` (type `candidat_modifie`). Avant : `created_at` était dans `ALLOWED_COLS` mais pas dans `FIELD_LABELS` → modifications silencieuses. Format des dates dans le journal : `jj/mm/aaaa` (helper `truncate` étendu pour formater les dates en FR).',
      'FIX MARIO RÉTROACTIF — `UPDATE candidats SET last_import_at = created_at WHERE id = \'4851b492-f18b-4fc4-ae13-566756d32c20\'`. Cas isolé (1 / 5828 candidats avait l\'incohérence). Impossible de se reproduire désormais grâce aux 2 garde-fous.',
    ],
  },
  {
    version: '1.9.119',
    date: '2026-04-29',
    label: 'Carte clients : géocodage rue précise + fitBounds percentile + click card recentre + fix split view',
    features: [
      'GÉOCODAGE RUE PRÉCISE — Avant : tous les clients d\'une même ville étaient superposés sur le centroïde NPA (à Monthey, 65 clients sur le même point GPS exact). Maintenant : Nominatim géocode l\'adresse complète (rue + numéro + NPA + ville) → chaque client se positionne sur sa vraie rue. Nouvelle fonction `geocodeAddress(adresse, npa, ville, pays)` dans `lib/geocode-localisation.ts` (séparée de `geocodeLocalisation` qui reste utilisée par les candidats). Fallback automatique sur centroïde NPA si Nominatim échoue.',
      'PIPELINE NON-BLOQUANT — `POST /api/clients` et `PATCH /api/clients/[id]` utilisent `after()` de `next/server` pour le fire-and-forget : la response est renvoyée immédiatement avec les coords centroïde NPA (lookup local synchrone ~1ms), puis Nominatim géocode l\'adresse précise en background et UPDATE les coords quand prêt (1-3s). L\'utilisateur ne ressent aucun délai dans la modale "Ajouter un client" ni dans l\'édition fiche. PATCH déclenche le re-géocodage si `adresse` OU `npa` OU `ville` change.',
      'BATCH RUE PRÉCISE — Nouveau script `scripts/batch/geocode-clients-addresses.ts` (DRY-RUN par défaut, `--apply` pour persister). Run sur 1025 clients avec adresse non vide : **875 / 1025 (85.4%) géocodés à la rue précise** via Nominatim, 150 (14.6%) inchangés (Nominatim KO sur l\'adresse exacte → garde centroïde NPA), **0 régression**. Durée ~19 min à 1 req/sec. Vérification Monthey : 63 clients → 45 coords distinctes maintenant (vs 1 seule avant).',
      'FITBOUNDS PERCENTILE 5-95 — Avant : 1 seul client en Suisse alémanique (Bekon Koralle AG à Dagmersellen LU) tirait le viewport jusqu\'à Bern/Mulhouse, alors que les 1218 autres clients sont en Suisse romande. Maintenant : `ClusterLayer` calcule lat/lng séparément aux quantiles 5% et 95%, et fait `fitBounds` sur ces percentiles → ignore les outliers géographiques. Tous les markers restent rendus dans le cluster (juste le viewport initial est serré). Si <20 points (filtre serré) → bounds full pour ne pas couper.',
      'CLICK CARD MODE SPLIT = FOCUS CARTE — Avant : click sur une card en mode split ouvrait directement la fiche client (frustrant pour explorer la carte). Maintenant : en mode split, click card → la carte zoome sur le marker du client (`cluster.zoomToShowLayer` Leaflet markercluster) et ouvre son popup automatiquement. Border jaune sur la card sélectionnée pour signaler le focus actif. Bouton dédié **"Voir la fiche →"** ajouté en bas de chaque card en mode split (uniquement) avec `stopPropagation` pour ouvrir la vraie fiche client. Les modes grid / list / map gardent leur comportement (click card = fiche).',
      'FIX SPLIT VIEW — Cards de la liste compressées en mode split (11 cards horizontales écrasées dans 40% de largeur, illisibles). `flexDirection: \'column\'` étendu au mode split (était limité à `list`) → cards empilées verticalement et lisibles dans la colonne 40%.',
      'NOUVELLE PROP `focusedClientId` — `<ClientsMap />` accepte un `focusedClientId?: string | null`. Effet React séparé qui appelle `cluster.zoomToShowLayer(marker, () => marker.openPopup())` quand cet id change. Map<id, Marker> stockée via `useRef` pour lookup O(1).',
    ],
  },
  {
    version: '1.9.118',
    date: '2026-04-29',
    label: 'Vue carte interactive /clients (Leaflet + clustering + split view) + fix édition nom entreprise',
    features: [
      'NOUVEAU — Vue carte interactive sur `/clients` avec 4 modes via toggle (📐 Grille / 📋 Liste / 🗺️ Carte / 🔀 Split). Préférence sauvée dans `sessionStorage`. Carte uses Leaflet + OpenStreetMap (gratuit, 0 clé API, attribution OSM). Lazy loaded via `dynamic(() => import("@/components/ClientsMap"), { ssr: false })` — Leaflet ne supporte pas SSR. Mode split = grille 40% liste / 60% carte sticky height calc(100vh - 240px), filtres et pagination conservés à gauche, carte met à jour automatiquement.',
      'CLUSTERING — `leaflet.markercluster` (ajouté en dépendance) regroupe les markers proches au zoom-out, indispensable pour ~1200 points. Config : `chunkedLoading` (évite blocage UI au mount), `maxClusterRadius:50`, `spiderfyOnMaxZoom`, `removeOutsideVisibleBounds`, `showCoverageOnHover:false`. Auto-fit bounds au load (`map.fitBounds(...)` avec padding 40px et maxZoom 11) → carte se centre automatiquement sur les filtres actifs.',
      'POPUP MARKER — HTML statique (Leaflet ne render pas du JSX) avec : nom entreprise + badge statut Zefix coloré (Actif RC / Liquidation / Radié) + ville `📍 NPA Ville, Canton` + IDE monospace + 3 pills secteurs maximum + bouton "Voir la fiche →" jaune (lien `<a href>` natif full page reload, suffisant car changement de fiche = changement de page).',
      'DB MIGRATION — 2 colonnes ajoutées à `clients` : `latitude FLOAT` + `longitude FLOAT` + index partiel `idx_clients_geo WHERE latitude IS NOT NULL` (perf des queries spatiales futures). Migration additive, 0 réécriture des 1219 lignes existantes.',
      'BATCH GÉOCODAGE — Script `scripts/batch/geocode-clients.ts` (DRY-RUN par défaut, `--apply` pour persister). Utilise `lib/geocode-localisation.ts` existant (lookup local CP CH/FR via `scripts/data/cp_geo.json` 23780 entrées + fallback Nominatim 1 req/s timeout 3s). Run sur 1219 clients actifs : **1219 / 1219 géocodés (100 %), 0 fallback Nominatim, 0 erreur, durée < 5 sec** — tous les NPA suisses étaient dans le lookup local.',
      'PIPELINE AUTO — `POST /api/clients` géocode automatiquement à la création depuis `npa + ville` (sauf si `latitude/longitude` fournis explicitement). `PATCH /api/clients/[id]` recalcule si `npa` ou `ville` change (et reset à null si nouvelle adresse non géocodable, pour éviter d\'afficher l\'ancienne position au mauvais endroit). Override manuel possible via `latitude/longitude` dans le body PATCH.',
      'FETCH CARTE OPTIMISÉ — La liste paginée garde son `useClients` existant (page + perPage). Un 2e appel `useClients({ ..., per_page: 5000 }, { enabled: showMap })` charge tous les clients filtrés pour la carte uniquement quand le mode l\'exige (map ou split). Économie : pas de fetch 5000 lignes en mode grille/liste. Hook `useClients` étendu avec param `options.enabled` (défaut true).',
      'FIX BUG ÉDITION NOM ENTREPRISE — Sur `/clients/[id]`, le header card n\'avait aucun bouton "Modifier" pour `nom_entreprise` ni `site_web`. Oubli de la refonte v1.9.116 (CardEditModal) qui n\'avait migré que Contact / Adresse / Notes. Ajouté bouton ✏️ Pencil dans la barre d\'actions header (à gauche d\'Activity et Trash2) qui ouvre une modale `CardEditModal` éditant les 2 champs ensemble. Type `editingCard` étendu avec `\'header\'`.',
    ],
  },
  {
    version: '1.9.117',
    date: '2026-04-29',
    label: 'Intégration Zefix RC suisse (vérification entreprises + import direct + audit batch 1221)',
    features: [
      'NOUVEAU — Recherche Zefix intégrée dans la modale "Ajouter un client". 3 onglets dans l\'ordre : `Zefix RC` (par défaut, gratuit, instantané, données officielles RC suisse) → `Recherche IA` (Claude + web_search, plus lent mais récupère adresse/tel/site web) → `Saisie manuelle`. Les deux sources sont complémentaires : Zefix fournit la vérité juridique (IDE officiel + statut actif/liquidation/radié + nom RC), l\'IA complète avec les coordonnées de contact.',
      'API — Découverte de l\'endpoint `POST https://www.zefix.admin.ch/ZefixREST/api/v1/firm/search.json` qui fonctionne SANS authentification (utilisé par le site public zefix.ch). Le `ZefixPublicREST` documenté dans Swagger demande HTTP Basic, lui ; on évite donc l\'inscription / délai d\'attente / secret en env vars. Endpoint `/legalForm` aussi public.',
      'FIX recherche Zefix — Retry intelligent automatique : si le nom complet ("Gerhard et Molliat SA") renvoie 404, on retente sans suffixes commerciaux (`SA / S.A. / Sàrl / S.à.r.l. / AG / GmbH / Ltd / SAS / EURL / SARL / SNC`). Zefix ne match pas "SA" ↔ "S.A." en string search. Sur le banc DRY-RUN 50 clients : taux de match passe de 64% (32/50) à 80% (40/50) grâce à ce retry.',
      'DB MIGRATION — 4 colonnes ajoutées à `clients` : `zefix_uid TEXT` (CHE-XXX.XXX.XXX), `zefix_status TEXT` (EXISTIEREND/AUFGELOEST/GELOESCHT), `zefix_name TEXT` (raison sociale officielle RC), `zefix_verified_at TIMESTAMPTZ`. Index unique partiel `idx_clients_zefix_uid WHERE zefix_uid IS NOT NULL` pour empêcher les doublons d\'IDE. Migration additive, 0 réécriture des 1221 lignes existantes.',
      'ROUTES API — `POST /api/clients/zefix/search` (proxy ZefixREST + flag `already_in_talentflow` calculé par fuzzy match nom ≥88% ou match exact UID dans les 1221 clients en DB) et `POST /api/clients/zefix/verify` (cherche, choisit best fuzzy ≥75% + bonus ville, persiste les 4 colonnes `zefix_*`, log activité `client_modifie`). Le statut client (`statut: actif/desactive`) n\'est JAMAIS modifié par ces routes — l\'utilisateur décide.',
      'FICHE CLIENT — Nouvelle section "Registre du commerce" sur `/clients/[id]` avant Meta info. Affiche IDE, raison sociale RC, statut (badge coloré : vert actif / orange liquidation / rouge radié), date de vérification. Bouton "Vérifier sur Zefix" (ou "Re-vérifier"). Bandeau d\'alerte rouge si `GELOESCHT` ("Entreprise radiée — désactiver ?"), orange si `AUFGELOEST` ("En liquidation"). Lien "Voir l\'extrait du registre cantonal" via `cantonalExcerptWeb`. Si pas de match auto (similarity <75%), affiche les 5 candidats trouvés pour diagnostic.',
      'AUDIT BATCH 1221 — Script `scripts/batch/zefix-audit-clients.ts` (DRY-RUN par défaut, `--apply` pour persister). Rate limiting 300ms entre requêtes (respectueux API publique), durée ~6 min sur 1221 clients. Skip auto si déjà vérifié dans les 30 derniers jours. UPDATE DB seulement les 4 champs `zefix_*` jamais le statut client. CSV `~/Desktop/zefix-audit-clients.csv` avec 6 actions : ✅ OK_ACTIF / ⚠️ EN_LIQUIDATION / ❌ RADIE / 🔄 NOM_DIFFERENT / ❓ NOT_FOUND / ⏭ ALREADY_VERIFIED. João examine ensuite manuellement les radiations détectées.',
      'LIB ZEFIX — `lib/zefix.ts` source unique : `searchZefix()` avec retry, `nameSimilarity()` (Levenshtein + bonus containment + normalisation suffixes), `interpretStatus()` (mapping EXISTIEREND/AUFGELOEST/GELOESCHT → label/booléens FR), `toSearchItem()` adapter API. Réutilisée par 2 routes API + 1 script batch. Aucune dépendance externe (pas de package fuzzy, pas d\'auth client).',
    ],
  },
  {
    version: '1.9.116',
    date: '2026-04-29',
    label: 'Refonte UI fiche client (modal édition unique par card, civilité éditable, fix auto-secteurs)',
    features: [
      'LOGO FICHE — `ClientLogo` rend désormais les initiales colorées en couche de fond TOUJOURS visibles, l\'image (logo.dev / Google Favicons) se superpose dessus quand elle charge. Avant : si l\'image était lente, bloquée par adblock ou en timeout réseau, on restait sur un skeleton vide en attendant `onError`. Maintenant on voit toujours quelque chose (initiales si pas de logo dispo).',
      'LOGO BACK-BUTTON — Fix bug "logos disparaissent au retour de fiche client" : quand une image est déjà en cache HTTP, le browser la sert synchroniquement au mount → l\'event `onLoad` ne fire pas (image déjà `complete` avant que React attache le handler) → state `loaded` reste à false → opacity 0 → image invisible. Fix avec `imgRef` + check `complete && naturalWidth > 0` dans un `useEffect` post-render qui force `setLoaded(true)` si l\'image est déjà chargée. Comportement attendu : retour à la liste depuis fiche → logos restent visibles.',
      'FICHE CLIENT — Édition refactorée en modal global par card. Avant : 1 bouton "Modifier" par champ (Email, Téléphone, Site web, Adresse, NPA, Ville, Canton, Notes) → UI bruitée. Après : 1 bouton "Modifier" en haut de chaque card (Contact / Adresse / Notes) ouvre une modale `CardEditModal` qui édite TOUS les champs de la card en une fois, avec un seul "Sauvegarder". Cohérent avec le pattern ContactsEditor.',
      'FICHE CLIENT — Email / téléphone / site web cliquables directement sur la fiche. Email → `mailto:` ouvre le client mail. Téléphone → `tel:` (mobile). Site web → ouvre l\'URL dans un nouvel onglet (préfixe `https://` auto si schéma manquant). Affichage souligné bleu pour signaler le lien actif.',
      'CONTACTS — Civilité (Madame / Monsieur / aucune) désormais éditable via dropdown dans le mode édition de chaque contact. Avant : "Monsieur" hardcodé par le parsing CV → toutes les femmes affichées comme "Monsieur". Maintenant choix manuel propre, valeur vide possible (n\'affiche rien dans le rendu).',
      'BUG FIX SECTEURS — `PATCH /api/clients/[id]` ne re-extrait plus automatiquement `secteurs_activite` depuis les notes si le client a déjà des secteurs en place. Avant : modifier ou vider les notes → secteurs vidés → l\'utilisateur perdait son enrichissement (manuel ou batch). Maintenant : extraction auto seulement quand `secteurs_activite` est vide/null. L\'édition manuelle des secteurs reste prioritaire et persistante.',
      'BUG FIX PAGING — Page restaurée depuis sessionStorage était écrasée à 1 au mount par le `useEffect [search]` du debounce qui appelait `setPage(1)` même au premier run. Fix avec ref `isFirstSearchRun` qui skip le reset au mount initial. Ouvrir une fiche depuis la page 5 et revenir conserve désormais la page 5 (cohérent avec /candidats). Tous les autres filtres (secteurs, ville, NPA, canton, contacts, dates, perPage, viewMode, search, statut) étaient déjà persistés correctement.',
    ],
  },
  {
    version: '1.9.115',
    date: '2026-04-29',
    label: 'Logos entreprises automatiques (logo.dev + fallback Google Favicons + initiales colorées)',
    features: [
      'NOUVEAU COMPOSANT — `components/ClientLogo.tsx` affiche le logo de chaque client à partir de son `site_web`. Source en cascade avec fallback gracieux : (1) logo.dev (`https://img.logo.dev/{domain}?token=...&size=128`) si la variable `NEXT_PUBLIC_LOGO_DEV_TOKEN` est définie — vrais logos haute qualité, free tier 1000 logos/mois ; (2) Google Favicons (`https://www.google.com/s2/favicons?domain={domain}&sz=128`) sinon ou si logo.dev échoue — gratuit illimité, qualité variable selon le site ; (3) initiales colorées sur palette stable (12 couleurs, hash du nom → index) si pas de site_web ou si tout a échoué. `<img>` natif (pas Next/Image) : lazy loading, skeleton pulse pendant chargement, cascade `onError` automatique. Trois tailles : sm 32px (cards liste), md 48px, lg 64px (header fiche). Helpers internes : `extractDomain` (strip protocol/www/path), `getInitials` (strip suffixes SA/Sàrl/AG/GmbH/Ltd, 2 lettres max), `hashCode` pour palette stable.',
      'INTÉGRATION — Logo affiché à 4 endroits : (a) cards de la liste `/clients` (taille sm 32px, à gauche du nom + secteurs), (b) header fiche `/clients/[id]` (taille lg 64px, à côté du nom entreprise), (c) `ClientPickerModal` du mailing dans `/messages` (taille sm), (d) `ProspectionModal` du picker prospection (taille sm). Suppression des anciens avatars "première lettre" remplacés par le logo réel. Pas de stockage DB, pas d\'upload, tout côté client (zéro requête serveur).',
      'CONFIG — Côté Vercel + `.env.local`, ajouter `NEXT_PUBLIC_LOGO_DEV_TOKEN=tok_xxx` (signup gratuit 2 min sur logo.dev) pour activer logo.dev. Sans token, le composant fonctionne immédiatement en mode dégradé Google Favicons. Les anciens stages "clearbit" sont retirés (Clearbit Logo API a été sunset par HubSpot en 2024, DNS dead).',
    ],
  },
  {
    version: '1.9.114',
    date: '2026-04-29',
    label: 'Refactor secteurs_activite + pack /clients (recherche, filtres, contacts, NPA, mailing, prospection)',
    features: [
      'REFACTOR — La colonne `clients.metiers_recherches` (v1.9.113) est remplacée par `clients.secteurs_activite TEXT[]` avec une taxonomie fermée de 25 secteurs ordonnée par catégorie : Maçonnerie (Gros Œuvre) → Électricité, Peinture, Plâtrerie, Sanitaire, Chauffage, Ventilation, Menuiserie, Charpente, Ferblanterie, Couverture, Étanchéité, Carrelage, Paysagisme (Second Œuvre) → Serrurerie, Soudure, Tuyauterie, Industrie (Technique) → Architecture, Ingénierie → Logistique → Manutention → Nettoyage → Restauration, Autres. Lib unique `lib/secteurs-extractor.ts` (priorité notes, fallback NOGA Zefix). Batch one-shot `scripts/batch/extract-secteurs-clients.ts --apply` enrichit 1174/1221 clients (96.2%). Pipeline auto : `POST/PATCH /api/clients` recalcule `secteurs_activite` à chaque modif des notes (sauf édition manuelle explicite). Index GIN `idx_clients_secteurs`.',
      'UI /clients — Le secteur libre Zefix et la liste secteurs sont fusionnés en UN seul dropdown multi-select dans les filtres avancés (popover avec checkboxes, pastille couleur par catégorie, tri par fréquence avec count). Pills colorées sur chaque card (max 2 + "+X") et sur la fiche header (max 3 + "+X"). Couleurs dérivées du même mapping que /parametres/metiers via `useMetierCategories` + `SECTEUR_REPRESENTATIVE_METIER` (résolution dynamique secteur→métier représentatif → couleur catégorie). Architecture désormais en bleu clair, Logistique conservée en vert.',
      'FICHE CLIENT — Réorganisation sections : Header + secteurs colorés → Info cards (Contact + Adresse) → ContactsEditor → Notes → Secteurs d\'activité (au fond, avant meta). Le carré "ACTIVITÉ" qui n\'affichait que le secteur NOGA libre a été supprimé (info redondante avec les pills du header). Bouton historique d\'activité (icône horloge) conservé.',
      'CONTACTS JSONB — Refonte de l\'éditeur sur la fiche client : mode display par défaut (avatar + nom/prénom + fonction + email/téléphone, bouton crayon pour entrer en édition + corbeille pour supprimer), mode édition par card avec 5 inputs + Check/Cancel. Bouton "+ Ajouter une personne" toujours visible. Persistance via `useUpdateClient` (PATCH `/api/clients/[id]`). La modale "Nouveau client" inclut désormais une mini-section Contacts (add/remove inline) optionnelle.',
      'BUG NPA — Taper "1000" dans le filtre NPA matche désormais TOUS les CPs de Lausanne (1000-1018), pas seulement la valeur littérale. Lookup CP→ville via les datasets geonames officiels chargés au boot (`lib/cp-to-ville.ts`, fallback ILIKE NPA si CP inconnu). Match préfixe (`Lausanne%`) pour exclure Romanel-sur-Lausanne / Bussigny-près-Lausanne qui sont d\'autres communes. Même comportement pour Genève, Berne, Fribourg, et toutes les villes multi-CPs.',
      'RECHERCHE — Tiebreaker dans le RPC `search_clients_filtered` pour les succursales (même nom d\'entreprise, lieux différents : Riedo Clima Düdingen vs Le Mont, Echenard Bex vs Monthey, Menétrey 3 sites…). Après le score CASE inchangé (100/50/30/10/1), tri secondaire par `jsonb_array_length(contacts) DESC` puis présence de notes DESC puis nom_entreprise ASC. La fiche la plus renseignée d\'une entreprise multi-sites remonte toujours en 1ère position. Côté front, quand une recherche est active, le tri "récent" par `created_at` est désactivé pour respecter l\'ordre de pertinence du serveur (sinon Karlen & Cie créé récemment passait devant Riedo Clima sur la query "riedo clima").',
      'FILTRES /clients — Tous les filtres avancés sont désormais branchés à des paramètres API dédiés (avant : ville/NPA bricolés via search libre, contacts uniquement state UI). `?secteurs=A,B,C` (CSV → `.overlaps()` OR), `?ville=`, `?npa=`, `?contacts=avec|sans`, `?created_after=`, `?created_before=`. Header pagination aligné sur le style de /candidats : per_page 20/50/100/1000/Tous + total + Page X/Y. Endpoint `GET /api/clients/secteurs-stats` (agrégat trié desc, cache 5min) alimente le tri par fréquence dans le dropdown.',
      'MAILING — Le picker clients du mailing (`ClientPickerModal`) remplace son ancien select secteur (libre NOGA) par le même dropdown multi-select secteurs_activite + canton + ville utilisé dans /clients. Filtres combinables, résultats triés par `nom_entreprise` ASC, n\'affiche que les clients avec email. Recherche libre conservée (parser booléen partagé `parseBooleanSearch`).',
      'PROSPECTION — La modale `ProspectionModal` (`✉️ Prospection email` lancée depuis /clients) utilise désormais le même multi-select secteurs_activite que /clients filtres avancés. Avant : ancien input secteur libre incohérent avec la taxonomie 25 valeurs. Cohérence totale entre filtres /clients, picker mailing et picker prospection.',
      'NETTOYAGE — Batch one-shot `scripts/batch/clean-notes-metiers-only.ts --apply` vide 980 / 1191 notes contenant uniquement des mots-clés métier (info redondante avec `secteurs_activite`). Garde-fous stricts : conserve si présence de chiffres (téléphone, CHF, %, années), d\'emails (`@`), d\'URL (`http`), de dates ou de mots-clés non-métier (admin, ouvrier, sàrl, plus de N stopwords). Les notes contenant du texte libre informatif restent intactes.',
      'RAPPORT QUALITÉ — Script `scripts/batch/report-contacts-incomplets.ts` génère `~/Desktop/contacts-incomplets.csv` (181 contacts / 147 clients) ayant un nom mais aucun email NI téléphone NI mobile. Format Excel-friendly (BOM UTF-8, séparateur `;`) avec colonnes Entreprise/Ville/Canton/NPA/Tél entreprise/Email entreprise/Prénom/Nom/Titre/Fonction + URL fiche cliquable.',
    ],
  },
  {
    version: '1.9.113',
    date: '2026-04-28',
    label: 'Métiers recherchés clients — taxonomie standardisée + extraction auto + filtre/pills colorés',
    features: [
      'NOUVELLE COLONNE — `clients.metiers_recherches TEXT[]` (index GIN) + taxonomie fermée 28 métiers terrain (Électricien, Peintre, Plâtrier, Carreleur, Menuisier, Sanitaire, Chauffagiste, Ferblantier, Couvreur, Maçon, Charpentier, Serrurier, Soudeur, Métallier, Étancheur, Plaquiste, Paysagiste, Grutier, Manœuvre, Tuyauteur, Sprinkler, Automaticien, Architecte, Ingénieur, Cuisinier, Nettoyage, Logistique, Autres). Source distincte du `secteur` Zefix (NOGA officiel) qui reste intact. Lib `lib/metiers-extractor.ts` = source unique de vérité.',
      'EXTRACTION AUTO — Batch one-shot `scripts/batch/extract-metiers-clients.ts --apply` enrichit 1165/1221 clients (95.4%) à partir des notes (priorité) ou du secteur Zefix (fallback). Top 10 : Sanitaire 217, Chauffagiste 214, Électricien 164, Peintre 144, Menuisier 142, Maçon 134, Plâtrier 126, Ferblantier 110, Carreleur 104, Couvreur 100. Pipeline auto : `PATCH /api/clients/[id]` recalcule `metiers_recherches` à chaque modif des notes (sauf si l\'utilisateur les a édités manuellement, qui a priorité). `POST /api/clients` aussi : auto-extrait à la création si non fourni.',
      'UI /clients — Pills colorées par catégorie sous le secteur sur chaque card (max 3 + "+X"). 9 catégories visuelles : électricité (bleu), finition (jaune : peintre/plâtrier/plaquiste/carreleur), gros œuvre (gris : maçon/manœuvre/grutier), bois (brun : menuisier/charpentier), toiture (orange : couvreur/ferblantier/étancheur), fluides (cyan : sanitaire/chauffagiste/tuyauteur/sprinkler), métal (violet : serrurier/métallier/soudeur), bureau (indigo : architecte/ingénieur), paysage (vert), autre (neutre).',
      'FILTRE MULTI-SELECT — Section "Métiers recherchés" dans les filtres avancés /clients : pills toggleables triées par fréquence d\'usage en DB (les plus utilisés en premier), count visible à droite de chaque pill. OR logique côté API (`.overlaps(metiers_recherches, metiers)`) — un client matche s\'il a au moins un des métiers cochés. Combinable avec tous les autres filtres (canton, secteur, ville…). Persistance sessionStorage `clients_metiers`. Endpoint dédié `GET /api/clients/metiers-stats` (agrégat 1221 clients, cache 5min).',
      'FICHE CLIENT — Section "Métiers recherchés" entre Secteur et Notes, multi-select éditable (clic pill = toggle, save instantané via `useUpdateClient`). Mêmes couleurs catégorie que les cards. Édition manuelle a priorité sur l\'auto-extraction (l\'API ne re-écrase pas si `metiers_recherches` est fourni explicitement).',
      'CRÉATION CLIENT — Champ "Métiers recherchés" optionnel dans la modale de saisie manuelle. Si laissé vide, l\'API extrait automatiquement depuis les notes/secteur à la création.',
    ],
  },
  {
    version: '1.9.112',
    date: '2026-04-28',
    label: 'Prospection email en lot depuis /clients (génération IA Claude Haiku 4.5 + envoi Outlook)',
    features: [
      'NOUVELLE FEATURE — Bouton "✉️ Prospection email" dans le header de /clients ouvre une modale 3 étapes pour générer N emails de prospection personnalisés en une seule opération. Étape 1 : sélection multi-clients (filtre secteur + canton + recherche texte, picker dédié, n\'affiche que les clients avec email) + textarea contexte additionnel (ex: "On a actuellement plusieurs maçons disponibles en Valais"). Étape 2 : génération séquentielle avec barre de progression i/N, statut par client (pending/generating/done/error), bouton "Annuler" qui stoppe proprement via AbortController. Étape 3 : liste des emails générés avec objet et corps éditables, bouton "Copier" individuel, "Tout copier (CSV)" (format `email;objet;corps`) et "Tout envoyer via Outlook" avec confirmation explicite. Limite recommandée 100 clients/batch, warning si dépassée.',
      'PROMPT IA SPÉCIALISÉ — System prompt dédié L-AGENCE SA / Monthey / bâtiment / second œuvre. Modèle `claude-haiku-4-5-20251001` (rapide + économique : ~$0.0012/email, ~2.3s par appel). Personnalisation par contact connu (`Bonjour {prénom},` si le 1er contact a un prénom, sinon `Madame, Monsieur,`). Contraintes strictes : max 8 lignes, vouvoiement, ne propose QUE les métiers cohérents avec les notes ou le secteur (interdit explicitement de proposer un peintre si notes=maçonnerie), termine par UNE seule question ouverte, jamais de formules génériques. Coût ~$0.12 / 100 emails.',
      'ROUTE API — `POST /api/clients/prospection/generate` body `{ clientId, contexte? }` retourne `{ objet, corps, destinataire, nom_entreprise }`. Format de réponse strict `OBJET: ...\\n---\\n[corps]` parsé côté serveur. Auth via `requireAuth()`. Appelée en boucle côté client (1 appel par client) avec délai 300ms entre appels pour rate-limiting léger. Erreurs n\'interrompent pas le batch — chaque client échoué est noté avec son message d\'erreur, le suivant continue.',
      'ENVOI VIA OUTLOOK — Réutilise `/api/microsoft/send` existant (Microsoft Graph par compte user OAuth, signature dynamique auto, log auto dans `emails_envoyes`). Aucun ajout de dépendance Resend. La modale boucle en mode `individual` avec délai 200ms entre envois (anti-throttling Graph). Si l\'utilisateur n\'a pas connecté Outlook : message clair "Outlook non connecté — voir /integrations". Confirmation `window.confirm` obligatoire avant l\'envoi groupé : "Envoyer X emails via votre compte Outlook ?".',
      'TRACKING DB — `/api/microsoft/send` accepte désormais `body.client_id` (priorité sur le matching legacy). Quand fourni, il est inséré dans `emails_envoyes.client_id` (UUID FK vers `clients`, nullable, ON DELETE SET NULL) avec `client_nom` enrichi automatiquement depuis `clients.nom_entreprise`. Permet de retrouver l\'historique de prospection sur chaque fiche client. Migration `add_client_id_to_emails_envoyes` appliquée (colonne pré-existante détectée + index partiel `idx_emails_envoyes_client_id` créé pour les requêtes par client).',
    ],
  },
  {
    version: '1.9.111',
    date: '2026-04-28',
    label: 'Fix Sentry /api/cv/print + 7 fixes UI/UX (badges, modale supprimer, autocomplete, WhatsApp, profil)',
    features: [
      'PERF — `/api/cv/print` ne buffer plus les PDFs en RAM avant de les renvoyer. Le body est désormais streamé directement (`new NextResponse(res.body)`), donc Vercel n\'alloue plus 1-5 MB par requête (CVs scannés A4 pleine page). Effet collatéral : l\'alerte Sentry "Large HTTP payload" qui se déclenchait au seuil ~500 KB sur les gros CVs disparaît. Aucun changement fonctionnel pour le navigateur — exactement les mêmes octets, juste en transfer-encoding chunked.',
      'UI — Badge distance "12 km" sur les cards candidat utilise désormais les tokens `--info-soft` / `--info` (bleu). Avant : couleur orange (`--primary`) identique au badge âge → confusion visuelle. Maintenant clairement distinct.',
      'UI — Badge âge harmonisé : dans la liste "À traiter" l\'âge s\'affichait en texte gris (sans pill), alors qu\'en mode "Actif" il était en pill orange. Désormais pill orange partout (cohérence visuelle).',
      'UI — Section "Résumé IA" masquée dans la fiche candidat. Données conservées en DB, pipeline d\'extraction inchangé. Réactivation triviale (toggle `{false && (…)}`).',
      'UI — Bandeau "Nouveau / Actualisé / Réactivé" sur les cards reste désormais affiché jusqu\'à ce que l\'utilisateur ouvre la fiche (cohérent avec le badge rouge "non vu", aligné sur `viewedSet`). Avant : disparaissait au bout de 10 min même sans ouverture (TTL incohérent avec le badge non-vu).',
      'UI — Modale "Supprimer définitivement" : bouton désactivé utilise désormais `--destructive-soft` (rouge pâle) + `--destructive` (texte rouge) au lieu de `--muted` qui rendait un bleu/navy bizarre en light mode. Reste clairement dans la palette destructive même quand inactif.',
      'UI — Icône appareil photo dans /parametres/profil : passe de `--foreground` (invisible en dark mode car bg blanc + icône blanche) à `--primary` (orange brand) avec bordure `--card`. Visible dans les deux modes.',
      'UX — Autocomplete email mailing : les emails déjà ajoutés en chips s\'affichent désormais dans la dropdown avec un tag "Déjà ajouté" et opacity 0.5 (au lieu d\'être cachés). Permet de comprendre que l\'autocomplete fonctionne quand le seul match est déjà sélectionné (cas typique : 1 contact unique chez un client).',
      'UX — Modale "WhatsApp en masse" : les variables `[MÉTIER]` / `[LIEU]` du template se substituent désormais en temps réel quand l\'utilisateur tape dans les inputs Métier/Lieu (avant : seule l\'application initiale du template substituait, les éditions ultérieures restaient figées). Mêmes hooks que SMS désormais — fix par unification du `useEffect` SMS+WhatsApp.',
    ],
  },
  {
    version: '1.9.110',
    date: '2026-04-28',
    label: 'Géolocalisation par rayon — filtre ville + slider km (autocomplete CH/FR)',
    features: [
      'NOUVEAU FILTRE — Dans les filtres avancés de la liste candidats : champ "VILLE & RAYON" avec autocomplete sur 23780 villes officielles (3362 CH + 20418 FR via geonames-postal-code). Tape "1870" ou "Mon..." → suggestions live (top 10, CH avant FR, exact match prioritaire). Sélectionne une ville → choix du rayon (10/25/50/100 km presets ou valeur libre 1-500 km, défaut 25 km). Liste filtrée et triée par distance ASC, avec badge orange "12 km" sur chaque card.',
      'GÉOCODAGE BATCH — 5556 / 5828 candidats existants géocodés (95.3% de la base) en un seul batch idempotent : 5248 via dataset local CP→lat/lng (90.9%, 0 appel réseau), 315 via Nominatim OSM (5.5%, fallback villes étrangères/ambiguës), 7 rejetés hors Europe (faux positifs Nominatim US/CA), 208 non géocodables (formats trop dégradés), 0 erreur SQL. Garde-fou `WHERE latitude IS NULL` rend le script ré-exécutable sans risque.',
      'PIPELINE IMPORT AUTO — Tout nouveau CV (cv/parse manuel + onedrive/sync cron) est désormais géocodé instantanément à l\'INSERT via `lib/geocode-localisation.ts` (lookup local CP → 0 appel réseau pour 95% des cas, fallback Nominatim async timeout 3s sinon). UPDATE coords `lib/merge-candidat.ts` recalcule lat/lng dès qu\'une localisation change (replaced ou filledEmpty). Validation Europe (35-72°N, -10 à +40°E) rejette les FP géographiques.',
      'INFRASTRUCTURE DB — Migration `candidats` ADD COLUMN latitude/longitude FLOAT + index partiel `idx_candidats_geo` (WHERE latitude IS NOT NULL AND longitude IS NOT NULL). Fonctions PostgreSQL `haversine_km(lat1,lng1,lat2,lng2)` IMMUTABLE PARALLEL SAFE + `candidats_dans_rayon(p_lat, p_lng, p_rayon_km, p_ids[])` STABLE PARALLEL SAFE retournant `(id, distance_km)` triés ASC NULLS LAST. Candidats sans coords toujours affichés en queue (jamais exclus).',
      'API — Nouveau endpoint `GET /api/villes/suggestions?q=...` (autocomplete instantané, pas de DB, pas de réseau, ~1ms). Route `/api/candidats` étendue : params `lat`, `lng`, `rayon_km` → branche RPC `candidats_dans_rayon` avec pré-filtrage par IDs respectant tous les filtres existants (search, métier, langue, genre, permis, CFC, déjà engagé, statut, import_status). Réponse enrichie avec `distance_km` par candidat. Compatible boolean search (ET) + pagination + tri stable.',
    ],
  },
  {
    version: '1.9.109',
    date: '2026-04-28',
    label: 'Normalisation localisations — passe 2 (overrides hameaux + saint↔st + recherche web)',
    features: [
      'PASSE 2 SUR 423 FICHES NON-NORMALISÉES — Sur les 423 fiches restées sans CP après v1.9.108, 285 corrections supplémentaires appliquées (67%). Méthodes combinées : 209 via script auto enrichi (saint↔st bidirectionnel partout dans la clé, ste↔sainte, segment fallback non-générique, R1bis fuzzy crosscheck FR↔CH, fuzzy d=2 avec garde-fou préfixe-3 chars) + 76 via recherche Nominatim/OSM batch. 138 fiches restent intentionnellement intactes (adresses voirie pures, cantons/régions, pays seul, abréviations sans ville exploitable).',
      'OVERRIDES PERSISTANTS — Nouveau fichier `scripts/data/cp_overrides.json` (44 hameaux/villages absents geonames officiels : Aproz, Avanchets, Vilette, Lavey-les-Bains, Les Évouettes, Villars-sous-Mont, Collombey-Muraz, Les Monts-de-Corsier, Orsières, Les Valettes, Saxonne, Martigny-Combe, Bourg-en-Lavaux, Cheseaux-sur-Lausanne, Le Rosex, Les Écots, Les Vérines, Mayens-de-la-Zour, Muraz, Cergy, Malo-les-Bains/Dunkerque, Fillière, Saint-Gingolph, Valpaços…). Source unique partagée par `lib/normalize-localisation.ts` (pipeline import) et `scripts/batch/*` (batches rétroactifs). Toute future correction validée par João s\'ajoute ici une seule fois et bénéficie automatiquement aux 3 routes d\'import.',
      'PIPELINE IMPORT BÉNÉFICIE AUTO — `lib/normalize-localisation.ts` lit désormais `cp_overrides.json` à l\'init. Tout nouveau CV mentionnant "Châtel-Saint-Denis" (au lieu de "Châtel-St-Denis"), "Conflans-Ste-Honorine", "Le Rosex", "Mayens de la Zour", "Saxonne", "Bourg-en-Lavaux"… est désormais reconnu et enrichi du bon CP sans intervention manuelle. Substitutions saint↔st, ste↔sainte, suffixes canton (VS/VD/GE…) toutes effectuées en cascade dans `lookupCP`.',
      'GARDE-FOUS ANTI-FP — Plusieurs faux positifs identifiés et bloqués lors de la recherche : (a) inclusion via tirets restreinte aux variantes bilingues `/` (Bienne/Biel uniquement, plus de Ravoire→La-Ravoire FR), (b) fuzzy d=2 exige préfixe 3 chars identiques (élimine Malo→Vals, Illarsaz→Villariaz, Rosemont→Rougemont, Morginis→Mougins), (c) VILLE_BLACKLIST étendue (cantons CH, régions FR, pays seul → jamais matchés comme villes), (d) segment fallback exclut mots de voirie (rue, chemin, avenue), villes-pivot (Sion, Lausanne) et noms génériques (Champs, Gare, Pont).',
      'BATCH RÉTROACTIF — Script `scripts/batch/apply-corrections-finales.ts` exécuté en 8s pour 285 UPDATE WHERE id=X AND localisation=ancienne (idempotence garantie). 0 erreur, 0 skip. CSVs intermédiaires conservés sur Desktop pour audit (localisation-corrections-completes.csv = 423 cas, localisation-117-web.csv = recherche Nominatim, localisation-corrections-finales.csv = 285 appliqués). État final DB : ~5040 / 5777 fiches au format strict CH/FR (~87% du total).',
    ],
  },
  {
    version: '1.9.108',
    date: '2026-04-27',
    label: 'Normalisation localisations — format strict "CP Ville, Pays" via datasets officiels',
    features: [
      'NORMALISATION GLOBALE — 4942 fiches candidats normalisées d\'un seul coup (85% du total). Format cible strict : "1870 Monthey, Suisse" / "74500 Évian-les-Bains, France" / "Lisbonne, Portugal". Avant : 76% des fiches au format "Monthey, Suisse" (sans CP), 200+ avec rue, 60+ avec sigles canton (VS/VD), 250 sans virgule. Désormais homogène pour les filtres, le matching géographique et les futures features de géolocalisation/distance.',
      'PIPELINE IMPORT CÂBLÉ — La fonction `normalizeLocalisation` de `lib/normalize-candidat.ts` (appelée par `cv/parse` et `onedrive/sync` via `normalizeCandidat`) délègue désormais à `lib/normalize-localisation.ts`. Tout nouveau CV importé est automatiquement enrichi du CP officiel sans appel IA. Idempotent : "1870 Monthey, Suisse" reste inchangé en re-passe.',
      'ZÉRO HALLUCINATION — Sources CP officielles : geonames-postal-code (4228 villes Suisse, 34270 villes France), datasets versionnés dans le repo (`scripts/data/cp_suisse.json`, `cp_france.json`). Si la ville est absente du dataset → format "Ville, Pays" sans CP (pas d\'invention). Si parsing impossible → valeur originale conservée (zéro perte de données).',
      'FIXES PARSER — Bug regex `\\b` JS sur lettres accentuées corrigé (matchait "ch" dans "Châtel" via lookaround Unicode `\\p{L}`). Suffix canton dans label canonique strippé ("Ollon VD" → "Ollon"). Extraction CP+ville depuis segments voirie ("Rue du Léman 29A 1907 Saxon" → "1907 Saxon, Suisse"). Strip parenthèses ("Erde (Conthey)" → "1976 Erde"). Alias "Française" reconnu comme France.',
      'BATCH ONE-SHOT — Script `scripts/batch/normalize-localisation.ts` exécuté en 0.7s pour 5777 fiches (zero IA, zero coût API). Garde-fou UPDATE conditionnel `WHERE id=... AND localisation = <ancienne>` empêche d\'écraser une fiche modifiée entre fetch et update. Rapport JSON détaillé sauvegardé.',
    ],
  },
  {
    version: '1.9.107',
    date: '2026-04-27',
    label: '3 cas résiduels extraction photos (Session 3) — DOCX + FlateDecode + uc<40 vision-face',
    features: [
      'EXTRACTION PHOTOS — Les 3 cas non couverts par v1.9.105 (F1bis Vision crop) sont désormais réglés. (1) DOCX avec photos téléphone haute résolution (4032×3024+) : ces photos étaient skippées en silence pour "trop grandes". Désormais capturées et envoyées à Vision Haiku pour localiser et cropper le visage (cas Soraia Fialho dos Santos). (2) Scans A4 PDF compressés en FlateDecode (raw RGB+zlib) au lieu de DCTDecode (JPEG natif) : F1bis ne capturait que DCTDecode, FlateDecode passait sous le radar (cas Amélie Gorin). Désormais, les scans FlateDecode pleine page sont décompressés, ré-encodés en JPEG via sharp, puis envoyés à Vision. (3) Photos avec très peu de couleurs (uniqueColors 35-39, scan basse qualité) confirmées par Vision Haiku mais rejetées par le veto "motif décoratif" : on assouplit ce veto uniquement quand la source provient de Vision face crop (uc≥35 acceptable, sinon veto maintenu).',
      'FIX BONUS — Garde-fou "face cover ratio" remplace le check `crop < orig*0.4` (calibré pour scans portrait, faux-rejette les photos paysage). Désormais : si le visage détecté occupe > 50% de la dimension max (paysage ou portrait), reject (probable photo passport déjà cropée, faux positif). Sinon accept. scoreHeadshot reste filet de sécurité final (uniqueColors, skinRatio, ratio).',
      'NORMALISATION — La source des candidats issus de Vision face crop est désormais préfixée `vision-face:` (ex: `vision-face:pdf-lib:DCTDecode:p1:I0:full-page-scan` ou `vision-face:docx:word/media/image1.jpg`). Permet à scoreHeadshot d\'identifier les crops Vision pour appliquer le veto uc<40 assoupli. Logs F5 mis à jour en conséquence.',
      'LOGS DIAGNOSTIC — Logs F5-DOCX ajoutés (start, file=X skip reason=Y, accept, done) + F5-DOCX-S1bis (trigger, try, success/done). Permettent de diagnostiquer rapidement les futures fails DOCX dans Vercel logs.',
      'VALIDATION — Banc test 22 fixtures connues comme échouant : 19/22 → 22/22 (+3, 100%). Témoin 100 candidats avec photo OK en DB : 58/100 → 60/100 (+2, zéro régression). Coût Vision API estimé inchangé (Vision Haiku appels uniquement quand Strategy 1+2 échouent).',
    ],
  },
  {
    version: '1.9.106',
    date: '2026-04-25',
    label: 'Bandeau Actualisé pending-validation + stop retry orphelins OneDrive',
    features: [
      'INTÉGRATIONS — Bug corrigé : valider un candidat en attente (bouton "Mettre à jour" sur un fichier en pending_validation depuis Intégrations) n\'écrivait pas le bandeau bleu "Actualisé le X" sur sa fiche, et le candidat ne remontait pas en haut de la liste. 2 colonnes (onedrive_change_type + onedrive_change_at) oubliées dans le payload. Désormais cohérent avec les autres chemins d\'update (import manuel, sync OneDrive auto, "Définir comme CV principal"). Cas backfill : Jessica Micaela Ramos Nunes corrigée en base.',
      'ONEDRIVE SYNC — Bug corrigé : les non-CVs dont le candidat n\'existe pas en base (diplômes/certificats orphelins comme "Hakan Kisakaya") étaient retentés à chaque création de nouveau candidat. Coût Vision IA + Microsoft Graph gaspillé en boucle quand la résolution dépend d\'une action humaine. Désormais : erreur définitive marquée `traite=true` directement, plus de retry coûteux. Re-rattachement futur : importer le CV du candidat puis ré-importer le non-CV via "Importer candidat" (ou remettre manuellement `traite=false` en base pour relancer un retry).',
      'RÈGLE PRÉSERVÉE — Les erreurs transitoires (timeout réseau, échec téléchargement OneDrive, exception inconnue) restent `traite=false` et continuent à être retentées au cycle suivant. Seuls les "candidat introuvable" sont marqués définitifs.',
    ],
  },
  {
    version: '1.9.105',
    date: '2026-04-25',
    label: 'Extraction photos pour scans A4 (F1bis Vision crop)',
    features: [
      'EXTRACTION PHOTOS — Bug majeur corrigé : 60% des CVs avec photo en prod (badge initiales au lieu du portrait). Cause racine identifiée via logs F5 ajoutés au moteur photo : les CVs scannés au format A4 (1 image JPEG pleine page ~2400×3400) étaient rejetés en silence par le veto "image trop grande" dans Strategy 1, sans jamais arriver à Vision IA. Désormais, ces scans sont capturés et envoyés à Claude Haiku Vision qui localise le portrait et le crop proprement.',
      'FIX CHIRURGICAL — Helper "tryVisionFaceCrop" extrait pour mutualiser la logique Vision face crop avec Strategy 3 existante (DRY). Nouveau pipeline F1bis activé uniquement quand Strategy 1 + Strategy 2 retournent 0 candidat ET qu\'au moins 1 scan pleine page DCTDecode portrait (ratio 1.3-1.55, ≥1500px) a été détecté. Strategy 3 inchangée (zéro risque sur le path existant).',
      'LOGS DIAGNOSTIC — Logs structurés "[F5-S1]" / "[F5-S2]" / "[F5-S3]" / "[F5-S1bis]" / "[F5-Score]" / "[F5-Final]" conservés en prod. Permettent de diagnostiquer rapidement tout futur cas d\'échec d\'extraction photo dans les Vercel logs (XObjects rencontrés, filtres PDF, raisons de rejet, étapes activées par strategy).',
      'VALIDATION — Banc test 22 fixtures connues comme échouant : 2/22 → 19/22 (+17, 86%). Témoin 100 candidats avec photo OK en DB : 40/100 → 58/100 (+18, zéro régression). Validation visuelle 6/6 cas représentatifs (Diana Antunes, Catarina Almeida, Mariana Marques en N&B, David Frey, João Filipe Da Silva Correia, Mihaela Avadani) — toutes les photos extraites sont des vrais visages bien cadrés, sans pollution texte/logo.',
      'CAS RÉSIDUELS (Session 3) — 3 cas non couverts par F1bis : DOCX (extractPhotoFromDOCX hors scope), FlateDecode (F1bis = DCTDecode uniquement, à étendre Session 3), veto uniqueColors<40 sur photo très peu colorée (cas frontière scoreHeadshot, à assouplir Session 3 pour les sources "vision-face*"). Coût Vision API estimé : +$0.30/mois (négligeable).',
    ],
  },
  {
    version: '1.9.104',
    date: '2026-04-24',
    label: 'Option B — protection homonymes sans date de naissance',
    features: [
      'ONEDRIVE SYNC — Correction d\'un risque de fusion silencieuse détecté pendant les tests workflow. Quand 2 candidats partageaient un nom exact et un même téléphone (ou même email) mais n\'avaient pas de date de naissance des 2 côtés (cas des couples, familles, indépendants partageant un numéro fixe d\'entreprise), le sync auto OneDrive pouvait écraser les données du premier avec celles du second sans demander validation.',
      'RÈGLE AJOUTÉE — Désormais, un match nom exact + tel ou email partagé sans aucune date de naissance identifiable tombe en "à valider" dans Intégrations (au lieu d\'un écrasement automatique). Le consultant tranche manuellement : soit fusionner (même personne), soit créer une 2e fiche (homonymes distincts).',
      'GARDE-FOU — Si les 2 candidats ont à la fois le MÊME email ET le MÊME téléphone, c\'est considéré comme un vrai update (même personne) et le match reste silencieux — pas de "à valider" inutile. Protège les mises à jour légitimes.',
      'IMPACT — Comportement inchangé si une date de naissance est présente au moins d\'un côté (la règle absolue DDN sépare déjà les homonymes). Simulation sur 5825 candidats en base + 30 derniers jours d\'imports : 0 régression observée, volume estimé < 5 "à valider" supplémentaires par jour.',
      'IMPORT MANUEL — Le même cas passe par la modale de confirmation "Candidat potentiellement en doublon" existante (comportement inchangé côté UI).',
    ],
  },
  {
    version: '1.9.103',
    date: '2026-04-24',
    label: '"Définir comme CV principal" met maintenant à jour la date + bandeau Actualisé',
    features: [
      'FICHE CANDIDAT — Bug corrigé : quand tu promeus un document archivé en "CV principal" depuis la fiche (menu Documents → "→ CV principal"), le candidat ne remontait pas dans la liste et la fiche continuait d\'afficher "Ajouté le X" en vert au lieu de "Actualisé le X" en bleu. Désormais : la promotion d\'un CV met à jour la date de dernière activité, affiche le bandeau bleu "Actualisé", et fait remonter le candidat en tête de la liste triée.',
      'RÈGLE MÉTIER CONFIRMÉE — L\'attachement d\'un document non-CV (certificat, attestation, lettre de motivation) à un candidat existant NE change PAS la date et NE fait PAS remonter le candidat. C\'est volontaire : seuls les vrais changements de CV bougent la date + le badge rouge. Comportement inchangé.',
      'BACKFILL — 1 candidat en prod (Jean-Luc Gaussen) dont l\'incohérence avait déclenché la découverte du bug : date de dernière activité alignée, bandeau fiche corrigé.',
    ],
  },
  {
    version: '1.9.102',
    date: '2026-04-24',
    label: 'Classifier IA-first — fix régression v1.9.101 sur certificats et lettres de motivation',
    features: [
      'IMPORT — Correction d\'un sur-classement en CV introduit par la v1.9.101 : les certificats de travail, attestations et lettres de motivation qui mentionnent un poste (l\'IA en faisait "1 expérience") passaient à tort la règle CV-markers et étaient classés comme CVs. Cas réels corrigés : certificat d\'apprentissage Manor, lettre de motivation "Ouvrière d\'usine", certificat de travail COSMOTEC. Désormais respectés comme non-CV.',
      'RÈGLE NOUVELLE — Quand l\'IA identifie explicitement le document comme certificat / attestation / lettre_motivation / contrat / diplôme / bulletin_salaire / permis / référence / formation, on respecte sans condition (priorité maximale). Les CV-markers ne peuvent plus override cette décision. Si l\'IA hallucine exceptionnellement sur un vrai CV, le consultant peut le re-importer en forçant.',
      'RÈGLE AFFINÉE — CV-markers durcis en tie-breaker : exige désormais au moins 2 expériences + (3 compétences ou formation), OU 1 seule expérience mais avec 5+ compétences + titre de poste cohérent (cas des indépendants avec email info@ de leur propre société, comme Caryl Dubrit ou Nicolas Kilchenmann).',
      'RÈGLE AJOUTÉE — Filet de sécurité "patterns en-tête 0-500 chars" : détecte les vrais certificats/attestations/lettres même si l\'IA dit "cv" par erreur (ex. "Certificat de travail" ou "Je soussigné" en début de document).',
      'WARNING NOUVEAU — Détection "nom/prénom à vérifier" quand l\'en-tête du CV contient plusieurs mots en MAJUSCULES (ex. "Mr ZAHMOUL Chaouwki" — convention FR "Mr NOM Prénom" vs ordre international "Prénom NOM"). Le warning est stocké dans les métadonnées d\'extraction ; l\'affichage visuel sur la fiche candidat arrivera en v1.9.103. Limitation : le warning ne s\'active que pour les CVs avec texte natif (DOCX ou PDF bien formé), pas sur les scans traités par Vision IA.',
      'VALIDATION — Simulation 100 CVs réels + 20 non-CVs synthétiques + 5 cas Loïc Arluna + 3 nouveaux cas réels (Manor/Sandra/Marjorie) + 1 cas Zahmoul : 100% pass sur 3 runs consécutifs. Test end-to-end sur 5 fichiers réels : 4/5 PASS (Zahmoul partiel à cause de la limitation scan Vision). Aucune régression par rapport au fix v1.9.101 sur Loïc Arluna.',
    ],
  },
  {
    version: '1.9.101',
    date: '2026-04-24',
    label: 'Classifier CV/non-CV durci — CV-markers prioritaires sur patterns parasites',
    features: [
      'IMPORT CV — Correction d\'un bug où certains CVs légitimes étaient rejetés à tort comme "non-CV" et leur candidat n\'était jamais créé. Cas concret : Loïc Arluna, dont le CV mentionnait "résiliation de mon contrat de travail" dans une expérience pro, était classé "contrat" (non-CV) → aucune fiche créée → tous ses autres documents (certificat Sabeco, lettre motivation, attestations) cascadaient en erreur OneDrive.',
      'RÈGLE NOUVELLE — Les signaux positifs d\'un vrai CV (expériences ≥1, compétences ≥2, formation, titre de poste) ont désormais priorité absolue sur les patterns parasites ("contrat de travail", "permis de séjour", "lettre de motivation mentionnée", etc.) qui peuvent apparaître naturellement dans un CV. Un document avec de vraies expériences pro est un CV, quoi que dise le texte.',
      'AUTRES CAS CORRIGÉS — Les mentions "permis de travail / permis de séjour" dans un CV (fréquent en Suisse) ne font plus rejeter le candidat. Idem pour "lettre de motivation jointe" mentionnée dans le CV. Idem pour les indépendants qui utilisent l\'email info@ de leur propre société comme contact (cas Caryl Dubrit).',
      'NON-CVs PROTÉGÉS — Les vrais certificats, attestations, lettres de motivation, bulletins de salaire, permis et contrats restent correctement classés comme non-CV tant qu\'ils n\'ont pas d\'expériences/compétences extraites. Les 5 fichiers Loïc Arluna en erreur en prod seront automatiquement retraités par le prochain sync OneDrive.',
      'VALIDATION — Simulation sur 100 CVs aléatoires de la base : 87-96/100 classés CV avec l\'ancien classifier, 100/100 avec le nouveau. 20 non-CVs de contrôle : 20/20 toujours correctement rejetés. 0 régression observée.',
    ],
  },
  {
    version: '1.9.100',
    date: '2026-04-23',
    label: 'Modal "Doublon import" lisible en dark mode',
    features: [
      'IMPORT MANUEL — Le modal "Candidat potentiellement en doublon" qui s\'affichait avec du texte gris-sur-gris illisible en dark mode est maintenant correctement contrasté. Le titre, le nom du candidat existant et la case "Appliquer à tous" sont enfin lisibles dans les 2 thèmes.',
    ],
  },
  {
    version: '1.9.99',
    date: '2026-04-23',
    label: 'Croix Date modif → repositionne à la vraie date chronologique (plus de candidat perdu en bas de liste)',
    features: [
      'FICHE CANDIDAT — La croix rouge "Date modif" remet maintenant la date de modification à égalité avec la date d\'ajout (au lieu de la mettre à vide). Effet : le bandeau "Actualisé/Réactivé" disparaît ET le candidat reprend sa vraie position chronologique dans la liste (avant : il disparaissait en bas de la dernière page parce que le tri rejetait les valeurs vides en fin de liste — Imrane Ezzitouni perdu en page 150 au lieu de page 2).',
    ],
  },
  {
    version: '1.9.98',
    date: '2026-04-23',
    label: 'Fix badge "Actualisé" sur CV archivé + auto-close UploadCV + croix X + Intégrations allégé',
    features: [
      'BADGE ACTUALISÉ — Quand le sync OneDrive trouve un CV plus ancien que celui déjà en base et l\'archive dans l\'historique du candidat, la fiche affiche désormais "Actualisé le X" en bleu (avant : aucun bandeau, le candidat restait marqué "Nouveau" indéfiniment). Cas Imrane Ezzitouni résolu.',
      'IMPORT — La petite barre "Import terminé" en bas à droite a maintenant une croix ✕ pour la fermer en un clic. Avant : il fallait obligatoirement la dérouler pour pouvoir la fermer.',
      'IMPORT — Si l\'import est terminé sans rien traiter (0 traités), la barre minimisée se ferme automatiquement après 5 secondes (bruit visuel évité, surtout après une session OneDrive avec 0 nouveau fichier).',
      'INTÉGRATIONS — Suppression du texte "mis à jour il y a Xs" à côté de "Dernier sync". Information redondante et qui changeait toutes les secondes pour rien.',
    ],
  },
  {
    version: '1.9.97',
    date: '2026-04-23',
    label: 'Bandeau Réactivé/Actualisé visible dès 1er clic + cohérence badge OneDrive (TTL 10 min)',
    features: [
      'FICHE CANDIDAT — Le bandeau "Réactivé / Actualisé le X" s\'affiche désormais immédiatement à la première ouverture de la fiche, sans avoir à sortir et revenir. Avant : la fiche servait un cache (staleTime 2 min) qui ne contenait pas encore la dernière info du sync OneDrive. Désormais le cache est invalidé au mount + un canal realtime invalide aussi la fiche individuelle dès qu\'un sync touche le candidat.',
      'BADGE OneDrive — Cohérence avec le badge import manuel : reste visible 10 minutes même après ouverture de la fiche (avant : disparaissait dès ouverture, incohérent avec le manuel). Après 10 minutes, masqué automatiquement. Pratique pour repérer dans la liste les candidats touchés par un sync récent même si tu as déjà vérifié la fiche.',
    ],
  },
  {
    version: '1.9.96',
    date: '2026-04-23',
    label: 'Traçabilité suppressions + confirmation forte + fix bandeau Réactivé/Actualisé',
    features: [
      'SUPPRESSION CANDIDAT — Confirmation forte obligatoire désormais : tu dois taper le mot SUPPRIMER en majuscules pour activer le bouton de suppression définitive. Évite les clics accidentels (cas Mariana Antunes — disparition silencieuse). Vaut pour la fiche individuelle ET la suppression en masse depuis la liste.',
      'TRAÇABILITÉ — Toute suppression de candidat est désormais enregistrée dans Activités avec le nom, l\'email, le téléphone, le SHA256 du CV, l\'URL du CV et la source (bouton fiche / suppression en masse / remplacement / race condition d\'import). Permet de retracer et restaurer un candidat supprimé par erreur. Avant : suppression en aveugle, aucune trace, aucune possibilité de retrouver le candidat.',
      'FICHE CANDIDAT — Le bandeau "Réactivé le X" en jaune s\'affiche maintenant correctement après un sync OneDrive (avant : affichait "Actualisé" en bleu à tort à cause du badge OneDrive effacé à l\'ouverture). Le badge OneDrive en DB n\'est plus effacé ; il est masqué côté liste si tu as déjà ouvert la fiche (cohérent avec la sémantique per-user v1.9.95).',
      'BANDEAU FICHE — Distinction "Réactivé" vs "Actualisé" même quand l\'info OneDrive originale est manquante : si le candidat a au moins 1 CV archivé dans son historique → "Actualisé" (bleu) ; sinon → "Réactivé" (jaune). Corrige rétroactivement l\'affichage des candidats déjà ouverts.',
    ],
  },
  {
    version: '1.9.95',
    date: '2026-04-23',
    label: 'Règle absolue : badge rouge = changement de CV uniquement (sémantique per-user stricte)',
    features: [
      'BADGE ROUGE — Le badge rouge ne réapparaît plus quand un autre consultant modifie une note, un statut, un rating, un tag ou le pipeline d\'un candidat. Avant (v1.9.94) : toute modification déclenchait le réarmement du badge chez tout le monde — fuite des actions privées d\'un consultant à l\'autre. Désormais : le badge réapparaît UNIQUEMENT lorsqu\'un nouveau CV est importé, réactivé ou actualisé (changement de last_import_at).',
      'NON VU — L\'action "Marquer comme non vu" est désormais strictement personnelle. Avant : ça réarmait le badge chez tout le monde. Désormais : seul ton badge réapparaît, les autres consultants gardent leur état "vu/non-vu" inchangé.',
      'TECH — REPLICA IDENTITY FULL activé sur la table candidats côté Supabase pour permettre au handler realtime de comparer last_import_at avant/après update. Coût négligeable.',
    ],
  },
  {
    version: '1.9.94',
    date: '2026-04-23',
    label: 'Badge rouge instant aussi pour sync OneDrive (manuel + cron)',
    features: [
      'BADGE ROUGE — Apparition VRAIMENT instantanée pour les candidats réactivés / actualisés par OneDrive (sync manuel "Synchroniser tout" depuis Intégrations OU cron auto pendant que TalentFlow est ouvert). Avant : 1-3 secondes de latence. Cause : le pont Supabase realtime n\'était écouté que sur la page Candidats — quand le sync tournait pendant que tu étais sur Intégrations, les changements étaient ignorés et le badge n\'apparaissait qu\'au retour sur la liste.',
      'BONUS — Les modifications faites par un autre consultant (Sébastien) se reflètent désormais instantanément chez toi sur toutes les pages dashboard (pas juste Candidats).',
    ],
  },
  {
    version: '1.9.93',
    date: '2026-04-23',
    label: 'Croix Date modif → null en DB + badge instant après import (manuel)',
    features: [
      'FICHE CANDIDAT — La croix rouge "Date modif" efface maintenant complètement la date en base (NULL). Effet : le bandeau "Actualisé/Réactivé le X" disparaît, ET le candidat redescend dans la liste à sa vraie position chronologique (basée uniquement sur la date d\'ajout). Avant : la croix alignait juste la date sur celle d\'ajout côté UI, mais ne sauvegardait rien en DB → la liste continuait d\'afficher le candidat en haut.',
      'BADGE ROUGE — Apparition VRAIMENT instantanée après un import manuel sur les candidats réactivés / actualisés (avant : il fallait un hard refresh ou attendre le focus de la fenêtre). Le viewedSet local est maintenant nettoyé dès que l\'upload se termine, sans attendre le refresh DB ni le canal realtime. Idem pour les imports validés via la modale de confirmation.',
    ],
  },
  {
    version: '1.9.92',
    date: '2026-04-23',
    label: 'Croix Date modif efface totalement + badge réactivé/actualisé vraiment instant',
    features: [
      'FICHE CANDIDAT — La croix rouge à côté de "Date modif" efface maintenant totalement la date de modification ET le bandeau "Actualisé/Réactivé le X" disparaît vraiment de la fiche. Avant : le bandeau restait affiché car il lisait un autre signal en parallèle (badge OneDrive).',
      'BADGE ROUGE — Apparition désormais INSTANT pour les candidats réactivés/actualisés (avant : 200-500ms de retard). Cause : le viewedSet local mettait du temps à se synchroniser avec la DB. Fix : on retire immédiatement l\'ID du candidat du viewedSet local dès que le serveur signale un changement, sans attendre le refresh DB.',
    ],
  },
  {
    version: '1.9.91',
    date: '2026-04-23',
    label: 'Badges rouges instantanés + date modif éditable pré-remplie',
    features: [
      'BADGE ROUGE — Apparition instantanée après un import (manuel ou cron OneDrive). Avant le badge mettait jusqu\'à 1 minute à apparaître (apparaissait seulement au prochain focus de la fenêtre). Désormais l\'événement de changement rafraîchit aussi la liste des candidats déjà vus côté serveur.',
      'FICHE CANDIDAT — En mode édition, le champ "Date modif" est maintenant pré-rempli avec la date actuelle de dernière modification. Avant : champ vide, impossible de savoir quelle date était stockée ou de la supprimer.',
    ],
  },
  {
    version: '1.9.90',
    date: '2026-04-23',
    label: 'created_at immuable + tri liste basé sur last_import_at + date modif éditable',
    features: [
      'FICHE CANDIDAT — La date "Ajouté le X" est maintenant la vraie date de 1er import du candidat (immuable). Une seconde ligne "Actualisé le Y" (ou "Réactivé le Y") s\'affiche si le candidat a été mis à jour plus tard. Avant : "Ajouté le X" était écrasé à chaque mise à jour, on perdait la vraie date d\'origine.',
      'LISTE CANDIDATS — La date affichée à droite de chaque candidat est maintenant la plus récente entre "Ajouté" et "Actualisé/Réactivé". Tri identique pour toi (candidat récemment updaté remonte en haut).',
      'FICHE CANDIDAT — En mode édition : tu peux maintenant modifier la date de modification aussi, ou cliquer la croix rouge pour la réinitialiser (alors seule la date d\'ajout reste affichée).',
      'BACKFILL — 31 candidats avaient leur date d\'ajout écrasée par un import récent (ex. Ismael Jarmoun "ajouté 23 avril" alors qu\'il était en base depuis le 26 mars). Corrigés automatiquement vers leur vraie date d\'origine grâce aux documents archivés et à l\'historique des activités.',
      'MATCHING IA — La pénalité "ancienneté du profil" se base maintenant sur la dernière activité du candidat (dernier import) au lieu de sa date de création. Un candidat réactivé récemment reste pertinent même s\'il est en base depuis longtemps.',
      'DASHBOARD — Le graphe "Imports par jour" se base désormais sur l\'historique des activités (immuable) plutôt que sur la date de création des candidats (qui pouvait être modifiée). Stats plus fiables.',
      'BADGE ROUGE — Le garde-fou "pas de badge sur candidat ancien" regarde maintenant la date du dernier import au lieu de la date de création. Un candidat réactivé aujourd\'hui (même s\'il est en base depuis 2 ans) affiche bien son badge rouge.',
    ],
  },
  {
    version: '1.9.89',
    date: '2026-04-23',
    label: 'Fiche candidat — fix bandeau "Ajouté le X" sur candidats actualisés',
    features: [
      'FICHE CANDIDAT — Un candidat existant qui vient d\'être actualisé via OneDrive (ou manuellement) pouvait afficher à tort "Ajouté le 23 avril" en vert au lieu de "Actualisé le 23 avril" en bleu. Cause : après ouverture de la fiche, le badge bleu est effacé de la DB, et la détection de remplacement se basait sur un écart temporel trop fragile (< 1 min entre import et création). Nouveau test plus robuste basé sur la présence de documents archivés.',
    ],
  },
  {
    version: '1.9.88',
    date: '2026-04-23',
    label: 'Mailing — email visible aperçu + retirer destinataire + filtre liste',
    features: [
      'MAILING — L\'aperçu affiche maintenant l\'email exact du destinataire (✉️ contact@entreprise.ch) en plus du nom de l\'entreprise. Plus aucune ambiguïté quand 2 contacts portent le même prénom.',
      'MAILING — Bouton 🗑 Retirer dans le bandeau aperçu pour supprimer le destinataire courant en 1 clic (sans avoir à le chercher dans la liste).',
      'MAILING — Barre de recherche au-dessus de la liste des destinataires (apparaît automatiquement à partir de 8 emails). Tape un mot et seuls les emails matchant restent visibles — pratique pour retirer 1-2 destinataires d\'une campagne de 50.',
    ],
  },
  {
    version: '1.9.87',
    date: '2026-04-23',
    label: 'Mailing — fix bouton "Éditer" qui effaçait les personnalisations',
    features: [
      'MAILING — Bug : en mode envoi individuel, après avoir personnalisé le mail d\'un destinataire, cliquer à nouveau sur "✏️ Éditer" effaçait toutes les modifications. Désormais le bouton est remplacé par un badge statique "✓ Personnalisé" qui confirme que c\'est enregistré. Pour annuler, utilise le bouton rouge "Réinitialiser" à gauche.',
      'MAILING — Rappel : tes modifications dans l\'éditeur per-destinataire sont enregistrées en temps réel à chaque frappe (pas besoin de cliquer sur "Enregistrer").',
    ],
  },
  {
    version: '1.9.86',
    date: '2026-04-23',
    label: 'Dark mode — fix lisibilité Doublons + Administration',
    features: [
      'DOUBLONS — Plusieurs blocs apparaissaient comme des rectangles gris pleins en dark mode (texte gris sur fond gris) : "Analyse IA", expériences mini-profil, pills compétences, badge "X ignorés". Correction : tous ces fonds passent à var(--secondary) (qui s\'adapte au thème) — texte enfin lisible.',
      'DOUBLONS — Modal Fusion : la card "Profil principal" (vert clair), le surlignage des champs différents (orange) et la sélection radio (bleu) restaient en pastel vif en dark mode. Désormais en alpha transparent qui fonctionne dans les 2 modes.',
      'ADMINISTRATION — Le header du tableau utilisateurs (Utilisateur / Rôle / Entreprise / etc.) s\'affichait avec texte gris sur fond gris en dark mode → invisible. Corrigé.',
    ],
  },
  {
    version: '1.9.85',
    date: '2026-04-23',
    label: 'Performance — recherche 39% plus rapide + payload liste allégée',
    features: [
      'RECHERCHE CANDIDATS — La barre de recherche est 39% plus rapide : le scan de cv_texte_brut (8 MB) a été retiré de la recherche serveur (déjà couvert par l\'index FTS). Les résultats sont identiques, mais la requête passe de ~1050ms à ~650ms.',
      'RECHERCHE CANDIDATS — 3 nouveaux index fonctionnels sur nom / prénom / métier (unaccent+trigram). Pour les noms peu fréquents (noms exotiques, métiers spécifiques), PostgreSQL utilise maintenant ces index au lieu d\'un scan complet.',
      'LISTE CANDIDATS — Les colonnes "expériences" et "formations" ne sont plus chargées dans la liste (elles n\'y étaient jamais affichées). Économie d\'environ 5.8 MB par chargement complet de la liste.',
      'COMMANDES — Fix : le rechargement des candidats liés (après fermeture du modal) ne se déclenchait pas systématiquement au chargement de la page. Désormais uniquement après ouverture + fermeture réelle du modal.',
    ],
  },
  {
    version: '1.9.84',
    date: '2026-04-23',
    label: 'Cloche notifications unifiée TopBar (pipeline + entretiens)',
    features: [
      'NOTIFICATIONS — Nouvelle cloche 🔔 dans la barre du haut (à côté de "Importer candidat") qui rassemble tous tes rappels actifs : pipeline + entretiens. Le badge rouge affiche le nombre d\'alertes en cours.',
      'NOTIFICATIONS — 2 boutons par alerte : ✓ Valider (clôture définitive, va dans Pipeline → Rappels → Historique) ou ✕ Fermer (cache pour aujourd\'hui, revient automatiquement demain matin).',
      'NOTIFICATIONS — Plus de double notification : la popup en bas à droite est remplacée par cette cloche centralisée.',
    ],
  },
  {
    version: '1.9.83',
    date: '2026-04-22',
    label: '6 fixes : édition templates + matching IA + dark mode tags + date commandes',
    features: [
      'TEMPLATES — Tu peux maintenant modifier un template existant (bouton ✏️ crayon à côté de la corbeille). Avant il fallait supprimer et recréer.',
      'MATCHING IA — Le dropdown de templates n\'affiche plus de doublons ni templates fantômes : il charge uniquement les types réels (iMessage + WhatsApp).',
      'MATCHING IA — "Vider les résultats" désélectionne automatiquement les candidats qui étaient cochés.',
      'MATCHING IA — Bug corrigé : quand tu cliquais "Arrêter" pendant une analyse, les candidats réapparaissaient quelques secondes plus tard (promesses en vol). Désormais l\'arrêt est propre et définitif.',
      'COMMANDES — Les tags de compétences sont maintenant lisibles en dark mode (amber clair au lieu de brun foncé).',
      'COMMANDES — Chaque card affiche maintenant "Créée le X" sous le titre pour savoir quand la commande a été ajoutée.',
    ],
  },
  {
    version: '1.9.82',
    date: '2026-04-22',
    label: 'Matching IA — nouveau modal de contact + filtre 80km + fix dark mode',
    features: [
      'MATCHING IA — Nouveau modal "Contacter" unifié avec choix de template (iMessage / SMS / WhatsApp), substitution automatique {prenom} / {nom} / {metier}, et 3 onglets : "Par candidat" (boutons individuels), "iMessage groupé" (copie des numéros), "WhatsApp groupé" (un chat à la fois, anti-blocage navigateur). Plus de "Bonjour {prenom}" générique : c\'est ton template qui s\'applique.',
      'MATCHING IA — Le modal "Contacter" ne reste plus bloqué en haut de la page (bug "sticky top"). Il est maintenant rendu en portal donc s\'affiche toujours centré sur l\'écran.',
      'MATCHING IA — Historique des envois iMessage / WhatsApp depuis ce modal désormais enregistré dans Envois → Historique (comme depuis la liste candidats).',
      'MATCHING IA — Filtre automatique 80 km : les candidats dont la localisation est à plus de 80 km du lieu de la mission ne sont plus proposés. Si la ville n\'est pas reconnue (petite commune), le candidat est inclus quand même (pas d\'exclusion à l\'aveugle).',
      'MATCHING IA — Dark mode : les cartes top 3 (🥇🥈🥉) et la barre "N candidats sélectionnés" avaient des fonds pastel clair qui rendaient le texte illisible. Désormais les couleurs s\'adaptent correctement au thème sombre.',
    ],
  },
  {
    version: '1.9.81',
    date: '2026-04-22',
    label: 'Mailing : avertissement si aucune PJ + fix historique iMessage/WhatsApp/SMS',
    features: [
      'MAILING — Si tu cliques "Envoyer" avec des candidats attachés mais aucune pièce jointe cochée (ni CV ni document), une confirmation t\'avertit : "Aucune pièce jointe sélectionnée. Envoyer quand même ?". Évite les mails "je te propose ce profil" sans le CV joint.',
      'HISTORIQUE iMessage / WhatsApp / SMS — Les envois en masse depuis la liste candidats n\'étaient pas enregistrés (0 ligne en DB) à cause d\'un champ sujet NOT NULL côté base. Désormais chaque envoi iMessage/WhatsApp/SMS apparaît dans l\'Historique avec un libellé "iMessage" / "WhatsApp" / "SMS".',
    ],
  },
  {
    version: '1.9.80',
    date: '2026-04-22',
    label: 'OneDrive — fix cause racine "incohérence interne" sur candidats supprimés',
    features: [
      'ONEDRIVE — Les fichiers dont le candidat a été supprimé ou fusionné après import n\'apparaissent plus à tort dans la liste des erreurs "incohérence interne". La cause était la clé étrangère qui met candidat_id à NULL quand tu supprimes un candidat, ce qui trompait le détecteur d\'orphelins. Désormais ces fichiers sont annotés "Candidat supprimé ou fusionné après import — aucune action automatique" et ne sont plus retentés en boucle.',
    ],
  },
  {
    version: '1.9.79',
    date: '2026-04-22',
    label: '3 fixes post-v1.9.78 : bandeau MS, popover docs, suppression envois équipe',
    features: [
      'ENVOIS — Correction du flash du bandeau "Compte Outlook non connecté" qui apparaissait brièvement à chaque ouverture de la page avant de disparaître. Désormais il ne s\'affiche que si tu es vraiment déconnecté.',
      'MAILING — Le bouton "Docs" sur chaque candidat affichait "Aucun document additionnel" même quand le candidat en avait. Fix : lecture correcte de la réponse serveur.',
      'HISTORIQUE ENVOIS — Tu peux maintenant supprimer n\'importe quel envoi de l\'équipe (le tien ou celui de Sébastien). Avant, la croix ❌ n\'apparaissait que sur tes propres envois. Cohérent avec le partage team déjà en place pour la lecture.',
    ],
  },
  {
    version: '1.9.78',
    date: '2026-04-22',
    label: 'Mailing docs additionnels + retour intelligent + UX historique et connexion Outlook',
    features: [
      'MAILING — Tu peux maintenant joindre à un mail n\'importe quel document non-CV du candidat (certificats, permis, diplômes, lettres, etc.) en plus du CV original ou personnalisé. Bouton "Docs" sur chaque ligne candidat → popover avec cases à cocher.',
      'MAILING — Limite Microsoft 35 MB respectée : si la somme des pièces jointes dépasse 30 MB, l\'envoi est bloqué côté serveur avec un message clair. Aucun mail ne part si les PJ sont trop lourdes.',
      'HISTORIQUE ENVOIS — Les docs joints apparaissent comme badges dans chaque envoi (ex. "1 CERTIFICAT", "2 PERMIS") en plus du badge "CV PERSONNALISÉ" existant.',
      'FICHE CANDIDAT — Bouton "Retour" intelligent : quel que soit l\'endroit d\'où tu arrives (historique, matching, secrétariat, n\'importe quelle page), il te ramène à la page précédente (comme le bouton retour du navigateur).',
      'HISTORIQUE ENVOIS — Suppression individuelle : la croix ❌ est maintenant visible sur tous tes envois, y compris les anciens (avant la session team share). Avant, seul "Vider tout" fonctionnait sur ces envois legacy.',
      'ENVOIS — Le bandeau vert "Connecté via Microsoft 365" est supprimé quand tout va bien (bruit visuel). En cas de déconnexion Outlook, le bandeau jaune reste avec un bouton direct "Mon profil →" pour se reconnecter.',
    ],
  },
  {
    version: '1.9.77',
    date: '2026-04-22',
    label: 'Fiche candidat — fix bandeau "Actualisé" affiché sur nouveaux imports',
    features: [
      'FICHE CANDIDAT — Un nouveau candidat fraîchement importé (manuel ou OneDrive) affichait à tort "Actualisé le X" en bleu sur sa fiche, alors que dans la liste le badge "Nouveau" vert était correct. Désormais la fiche et la liste sont cohérentes : "Ajouté le X" en vert pour un nouveau, "Actualisé le X" en bleu uniquement pour un vrai update (avec CV archivé dans l\'historique de la fiche).',
    ],
  },
  {
    version: '1.9.76',
    date: '2026-04-22',
    label: 'Déconnexion = reset session + nettoyage /integrations',
    features: [
      'DÉCONNEXION — Quand tu te déconnectes (manuellement ou automatiquement après 2h d\'inactivité), la recherche et les filtres de la liste candidats sont désormais effacés. À la reconnexion, tu repars sur une liste vierge (sauf si tu quittes juste un onglet sans te déconnecter).',
      'INTÉGRATIONS — Suppression du bloc "Configuration" en bas de la page (Claude AI / Supabase / URL). Info peu utile au quotidien, épure la page.',
    ],
  },
  {
    version: '1.9.75',
    date: '2026-04-22',
    label: 'Session de corrections : OneDrive, recherche mailing, import manuel, ML, 4 bugs UX',
    features: [
      'ONEDRIVE — Les fichiers en attente de validation manuelle (match incertain) ne restent plus bloqués en erreur à chaque cycle. Si tu valides ou déplaces un fichier manuellement, la ligne disparaît proprement de la liste des erreurs.',
      'MESSAGES D\'ERREUR ONEDRIVE — réécrits en français clair (plus de jargon technique). Exemples :\n• "Remis en file — re-sync auto (orphelin détecté)" → "Remis en file — incohérence interne (fichier marqué traité mais sans candidat associé). Nouvelle tentative automatique."\n• "Fichier pré-enregistré mais jamais traité (bloqué par dédup ou abandon silencieux)" → "Fichier reçu mais pas encore traité après 24h (probablement bloqué par une erreur silencieuse ou un doublon)"\n• "Réactivé (safety)" → "Réactivé (même CV que l\'existant)"\n• "Doublon détecté (race)" → "Doublon détecté (import simultané)"',
      'ONEDRIVE — Prévention automatique : les fichiers "introuvables dans OneDrive" depuis plus de 7 jours sont abandonnés automatiquement. Plus de pollution permanente de la liste des erreurs.',
      'RECHERCHE MAILING — Quand tu cherches un candidat dans Envois → Mailing, la recherche trouve maintenant tous les candidats de la base. Avant, seuls 500 étaient chargés (sur 6300+), donc un candidat récent ou ancien était invisible. Recherche flexible (nom, prénom, email, métier, téléphone) sans accent ni majuscule.',
      'IMPORT MANUEL — Le badge coloré 🟢 Nouveau / 🟡 Réactivé / 🔵 Actualisé ne disparaît plus après 10 minutes. Il reste visible jusqu\'à ce que tu ouvres la fiche du candidat (même comportement que l\'import OneDrive).',
      'IMPORT — Quand tu importes plusieurs fichiers en même temps, si un upload échoue à cause du réseau (Failed to fetch), le système retente automatiquement 3 fois (avec pauses de 0.5s / 1s / 2s). Plus besoin de recharger manuellement.',
      'IMPORT — Les noms de fichiers étaient invisibles dans la fenêtre d\'import en mode sombre (fond clair fixé en dur, texte clair = blanc sur blanc). Désormais les couleurs s\'adaptent automatiquement au thème.',
      'FICHE CANDIDAT — Le bandeau "Ajouté le X" s\'affiche maintenant TOUJOURS en vert (avant : gris sur certains candidats sans historique OneDrive). Les variantes "Réactivé" (orange) et "Actualisé" (bleu) gardent leurs couleurs.',
      'ML — Quand tu valides un match incertain dans /integrations, l\'ID du consultant qui a décidé (toi ou Seb) est maintenant correctement enregistré (avant : toujours "null" à cause d\'un bug technique). Le dataset ML peut maintenant apprendre qui a décidé quoi.',
    ],
  },
  {
    version: '1.9.74',
    date: '2026-04-22',
    label: 'Corrections 2 bugs v1.9.73 : note popover dernier candidat + "Tout effacer" nettoie vraiment tout',
    features: [
      'NOTES POPOVER — correction finale : le popover s\'ouvre maintenant TOUJOURS sous le bouton, même pour le dernier candidat en bas de liste. Fini le saut en haut. Si peu de place, le popover se cale contre le bas du viewport (contenu scrollable).',
      'TOUT EFFACER — le bouton nettoie désormais TOUT complètement (recherche, filtres, "Non vu", sélection, position scroll). Plus de résidu quand on revient depuis un autre onglet.',
      'FIX technique : le filtre "Non vu" persistait dans sessionStorage via une clé séparée (candidats_filter_nonvu) non liée à "Tout effacer". Maintenant synchronisé en useEffect + removeItem explicite dans resetAllFilters.',
    ],
  },
  {
    version: '1.9.73',
    date: '2026-04-22',
    label: 'Corrections 5 bugs v1.9.72 : note popover, date fiche avec variantes, commandes candidats visibles, âge en pill, MetierPicker partagé',
    features: [
      'NOTES POPOVER — correction plus agressive : s\'ouvre maintenant TOUJOURS sous le bouton, sauf si vraiment moins de 150px en bas. Hauteur limitée à l\'espace disponible pour ne jamais déborder.',
      'DATE FICHE CANDIDAT — selon l\'historique du dernier import :\n• Nouveau candidat → "Ajouté le X" (vert)\n• Ré-importé même CV → "Réactivé le Y" (orange)\n• CV actualisé → "Actualisé le Y" (bleu)',
      'COMMANDES — bug de propriété corrigé : Supabase retourne le candidat joint sous `candidats` (nom de la table), pas `candidat`. Les photos, noms et métiers s\'affichent maintenant correctement sur chaque card commande.',
      'ÂGE LISTE CANDIDATS — affiché maintenant dans une pill orange soft avec bordure, bien visible (remplace le gris terne précédent).',
      'AJOUTER AU PIPELINE (depuis liste candidats) — utilise désormais le même MetierPicker que la page Pipeline : barre de recherche + liste groupée par catégories (Manutentionnaire / Gros Oeuvre / etc.) avec headers colorés. Plus cohérent.',
    ],
  },
  {
    version: '1.9.72',
    date: '2026-04-22',
    label: 'Fixes rapides v1.9.71 : popover notes, persistance filtres, commandes introuvables, candidats liés visibles',
    features: [
      'NOTES POPOVER — le modal d\'ajout de note s\'ouvre maintenant sous le bouton par défaut. Il ne remonte en haut que si vraiment pas la place en bas. Fini le bug où le popover s\'affichait près du header.',
      'PERSISTANCE FILTRES LISTE CANDIDATS — correction du vrai bug : le clic sur "Candidats" dans la sidebar effaçait la recherche + filtres. Désormais ils restent jusqu\'à "Tout effacer" ou déconnexion.',
      'LIER À COMMANDE (depuis liste candidats) — le modal affichait "Aucune commande ouverte" parce qu\'il interrogeait une API inexistante et filtrait un mauvais statut. Désormais il utilise le hook useOffres et filtre correctement statut=active.',
      'LIER À COMMANDE — la barre de recherche a été remplacée par une liste déroulante simple (dropdown) avec "Client — Titre — Ville" pour chaque commande. Plus rapide, plus clair.',
      'PAGE COMMANDES — chaque card affiche désormais les candidats liés (photo + nom + métier, max 3 + "autres"). Le bouton passe de "Candidats" à "Gérer (N)" quand il y a des liens.',
    ],
  },
  {
    version: '1.9.71',
    date: '2026-04-21',
    label: 'UX liste candidats + fiche + envoi CV rapide + lier candidats aux commandes + fixes CV personnalisé',
    features: [
      'LISTE CANDIDATS — l\'âge du candidat s\'affiche désormais aussi dans l\'onglet Actif, juste après la localisation (cohérent avec À traiter). Plus de pill séparée à droite.',
      'FICHE CANDIDAT — date d\'ajout affichée au-dessus de la photo ("Ajouté le 15 mars 2026") pour voir d\'un coup d\'œil quand le candidat est arrivé.',
      'BOUTON ENVOYER (fiche candidat) — nouveau bouton "mail" à côté de l\'œil dans le viewer CV : clic → ouvre /messages avec le candidat pré-sélectionné et son CV original attaché. Un seul clic pour envoyer.',
      'BOUTON ENVOYER (CV personnalisé) — même bouton à côté de Télécharger PDF : redirige vers /messages avec le candidat présélectionné ; clic sur "Personnaliser" dans la ligne pour ré-attacher le CV customisé.',
      'LIER CANDIDAT À COMMANDE — nouveau bouton "Lier à commande" dans la barre d\'actions bulk de la liste candidats (sélectionne plusieurs candidats → les lier d\'un coup à une commande ouverte).',
      'PAGE COMMANDES — bouton "Candidats" sur chaque card : ouvre un modal avec les candidats liés et leur statut (À envoyer / Envoyé avec date), plus une recherche flexible (accents/casse insensibles + ET/OU/SAUF) pour en ajouter.',
      'PERSISTANCE RECHERCHE LISTE CANDIDATS — quand tu changes d\'onglet et reviens sur /candidats, ta recherche, tes filtres, ta pagination et ta sélection sont conservés jusqu\'à "Tout effacer" ou déconnexion. Plus besoin de tout retaper.',
      'CV PERSONNALISÉ — les formations ont maintenant la même structure que les expériences : titre du diplôme, école, date début, date fin (ou "En cours"), description. Plus facile de modifier, ajouter, supprimer ou réordonner. Rétrocompat complète avec l\'ancien format (année simple).',
      'CV PERSONNALISÉ — le modal est plus large (1500px au lieu de 1100) pour voir confortablement les champs et l\'aperçu côte à côte.',
    ],
  },
  {
    version: '1.9.70',
    date: '2026-04-21',
    label: 'Historique d\'envois partagé team + mailing refondu (À/CC, aperçu blanc, auto-complete, perso par destinataire) + signature Seb',
    features: [
      'HISTORIQUE TEAM PARTAGÉ — tous les envois email/WhatsApp/iMessage/SMS sont désormais visibles par toute l\'équipe, avec un badge « Vous » ou « Prénom » qui indique qui a envoyé. Chacun peut seulement supprimer ses propres envois.',
      'AVERTISSEMENT 7 JOURS — avant d\'envoyer un email/WhatsApp/iMessage, TalentFlow vérifie si un candidat sélectionné a déjà été contacté par toi ou un collègue dans les 7 derniers jours. Si oui, un encart orange liste les candidats concernés avec « il y a X jours par Y via Z ». Non bloquant : boutons « Fermer » et « Continuer malgré tout ».',
      'MODE D\'ENVOI — nouveau toggle dans /messages → Mailing : « Envoi individuel personnalisé » (défaut, 1 mail par destinataire) OU « Envoi groupé À + CC » (1 seul mail avec destinataires visibles + copies CC). Le champ CC n\'apparaît qu\'après avoir ajouté au moins 1 destinataire.',
      'APERÇU MAIL FOND BLANC — le preview du mail affiche désormais toujours fond blanc + texte noir, même en mode sombre TalentFlow. Plus fidèle à ce que le destinataire voit dans Outlook.',
      'FLÈCHES ← → + PERSONNALISATION PAR DESTINATAIRE — en mode individuel avec plusieurs destinataires, navigue entre les aperçus avec les flèches. Bouton « Personnaliser ce mail » pour modifier sujet/corps d\'un destinataire spécifique sans toucher aux autres. Badge « ✏️ Personnalisé » visible.',
      'AUTO-COMPLÉTION EMAILS (type Outlook) — quand tu tapes dans le champ destinataires, un menu propose les emails connus : contacts clients (base TalentFlow), membres de l\'équipe, et destinataires récents (30 derniers jours). Navigation ↑↓ + Entrée, tri par type.',
      'RECHERCHE CLIENTS MAILING — le « Choisir clients » trouve désormais tous les clients (limite 500 → 2000), supporte la recherche avancée ET/OU/SAUF + parenthèses, insensible aux accents et à la casse. Tooltip ⓘ avec exemples.',
      'TEMPLATES REFONTE — nouveau modal Nouveau template avec 3 canaux en radio-cards (Email / iMessage / WhatsApp). Sujet uniquement pour email. Variables cliquables (insertion au curseur) groupées par usage (communes 3 canaux / email uniquement). Bouton « Copier vers WhatsApp » ou « Copier vers iMessage » sur chaque template.',
      'TEMPLATES WHATSAPP — la modal WhatsApp bulk dans /candidats charge désormais les templates dédiés (type=whatsapp), séparés des templates iMessage.',
      'ACTIVITÉS — badges compteurs sur chaque onglet (Tous / Candidats / Imports / Clients). Les filtres recherche + date sont respectés dans les compteurs.',
      'NETTOYAGE AUTO 30 JOURS — tous les envois (emails_envoyes) et événements d\'activité (activites) de plus de 30 jours sont supprimés automatiquement chaque nuit à 03:15. Garantit une base légère et pas d\'accumulation.',
      'SIGNATURE SEB — signature email officielle ajoutée pour Sébastien D\'Agostino (même template que João, photo dédiée, LinkedIn personnel, numéro +41 79 219 16 88). À lui de se déconnecter/reconnecter 1 fois pour l\'activer.',
      'FIX APERÇU CV — les CV dans la fiche candidat s\'affichaient trop grands à l\'ouverture (zoom 100% pixel). Désormais calés sur la largeur de la page par défaut (zoom page-width).',
    ],
  },
  {
    version: '1.9.67',
    date: '2026-04-21',
    label: 'WhatsApp bulk depuis liste candidats + cleanup /messages (onglets WhatsApp/SMS retirés)',
    features: [
      'NOUVEAU — Bouton "💬 WhatsApp" dans la barre d\'actions bulk de /candidats (à côté du bouton Message). Ouvre un modal dédié vert #25D366.',
      'MODAL WhatsApp bulk — templates SMS partagés (variables [MÉTIER]/[LIEU] globales + {prenom}/{nom} per-candidat), textarea + aperçu personnalisé pour le 1er candidat, liste des destinataires avec 1 bouton "Ouvrir" par candidat + bouton "Suivant (Nom)" pour passage rapide.',
      'SÉQUENTIEL user-driven — pas de boucle window.open() (anti-popup-blocker). Chaque clic = 1 chat WhatsApp ouvert. Badge "✓ Ouvert" + compteur X/N avec barre progression verte.',
      'LOG /api/messages/log canal:"whatsapp" — fire-and-forget au 1er clic uniquement (campagne_id partagé, 1 row par destinataire). Apparaît dans /messages Historique.',
      'LIB /phone-format.ts — fonction toWaPhone() factorisée (DRY). Imports candidats/[id]/page.tsx + messages/page.tsx nettoyés.',
      'CLEANUP /messages — onglets "WhatsApp" et "SMS / iMessage" SUPPRIMÉS de la page Envois (dead UI, tout le bulk se fait désormais depuis /candidats). 254 lignes de code mort retirées (WhatsAppTab + SmsTab fonctions).',
      'TAB /messages désormais : Mailing, Templates, Historique (l\'historique conserve le filtre multi-canal email/iMessage/WhatsApp/SMS).',
    ],
  },
  {
    version: '1.9.66',
    date: '2026-04-20',
    label: 'Historique messages unifié + UX liste/matching + recherche booléenne parenthèses',
    features: [
      'HISTORIQUE UNIFIÉ — /messages onglet Historique inclut désormais email, iMessage, WhatsApp, SMS. Filtre par canal en haut (tabs). Badge canal + icône sur chaque card.',
      'MIGRATION DB — colonne emails_envoyes.canal (CHECK IN email/imessage/whatsapp/sms, default email). Index sur canal + (user_id, created_at). Rows existantes = "email".',
      'API /api/messages/log — endpoint POST pour logger iMessage/WhatsApp/SMS avant ouverture de l\'app native. Fire-and-forget côté client, statut "tentative".',
      'LIEN WhatsApp fiche candidat + BOUTON "Ouvrir WhatsApp"/Messages dans /messages et CandidatsList — log avant navigation.',
      'FIX rapport d\'heures — calcul semaine ISO 8601 (avant: off-by-one, W16 pour 20-26.04.2026 alors que ISO = W17).',
      'LISTE CANDIDATS — étoiles interactives + bouton "Ajouter note" désormais disponibles dans TOUS les onglets (avant: à-traiter uniquement). Badge âge conservé en mode Actif.',
      'LISTE CANDIDATS — popover notes portalisé (createPortal) avec calcul dynamique top/bottom selon l\'espace dispo → fin du clipping quand la carte est proche du haut du viewport.',
      'MATCHING IA — résultats terminés préservés au retour depuis fiche candidat. L\'auto-reset au mount ne fire plus sur phase "done". Seuls les boutons "Nouvelle analyse" / "Vider les résultats" réinitialisent. selectedOffre restauré depuis matching.offreId.',
      'MATCHING IA + HISTORIQUE — aperçu CV au survol sur chaque card (pill "CV" avec Eye), même pattern que liste candidats (createPortal + panelW/panelH dynamique 480-1100 × 360-900). FIELDS preselect + MatchResult.candidat + MatchHistoryItem.results enrichis avec cv_url/cv_nom_fichier.',
      'RECHERCHE BOOLÉENNE — parser recursive descent avec support des PARENTHÈSES. Nouvel exemple dans popover: "(magasinier OU logisticien) ET bâtiment". Précédence OU (basse) < ET/SAUF (haute). AND implicite entre mots adjacents. Fetch-all client-side si parenthèses détectées.',
      'TOOLTIP "Recherche avancée" — 4 blocs pastel (--success-soft / --info-soft / --destructive-soft / --primary-soft) au lieu de var(--muted) gris illisible. Code exemples avec fond --card + bordure → lisibles light + dark.',
      'INTÉGRATIONS — modal sync OneDrive + pill 📎 historique : fond var(--muted) → var(--secondary) + texte var(--foreground) (gris-sur-gris illisible en light mode).',
    ],
  },
  {
    version: '1.9.65',
    date: '2026-04-20',
    label: 'Pack UX massif — 20+ bugs (mailing, dark mode, modals, pipeline, historique, dev localhost)',
    features: [
      'RÈGLE MÉTIER — email / téléphone / localisation désormais ÉCRASÉS sur UPDATE (manuel + OneDrive). DDN et genre restent IMMUABLES.',
      'BADGES COLORÉS 3 types sur liste candidats : 🟢 Nouveau / 🟡 Réactivé / 🔵 Actualisé — source manuelle (localStorage 10min) + OneDrive (DB persistant jusqu\'à ouverture fiche).',
      'MAILING — refonte liste candidats : 1 ligne compacte par candidat (nom · métier · 3 actions). Hover "CV original" → preview iframe portalisée. Bouton "CV original" dans CVCustomizer à côté de Réinitialiser.',
      'MAILING — distances clients quasi-instantanées : localStorage cache persistant, géocoding batch parallèle sur clients visibles seulement, delays Nominatim divisés par 3. Input "Distance depuis..." tokens sémantiques.',
      'MAILING — historique envois : campagne_id partagé → 1 card par envoi (au lieu de N destinataires). DELETE /api/emails/history via service role (bypass RLS bloquante sur legacy NULL). Vider tout + supprimer par ligne. Couleurs badge + chips rénovées.',
      'MODAL SMS/iMessage — maxWidth 500→720, photos destinataires (Image.src={c.photo_url} avec fallback initiales). Tokens sémantiques partout (textarea numéros, bouton Copier, dropdown templates, inputs Métier/Lieu) → lisible dark + light.',
      'LISTE CANDIDATS — FILTRE MÉTIERS MULTI-SELECT : dropdown checkboxes (avant: radio single). "Sanitaire" + "Aide sanitaire" cochés → liste OR côté serveur (.overlaps sur tags). Footer "N sélectionnés — Appliquer".',
      'LISTE CANDIDATS — recherche instant narrow-down client-side pendant debounce 150ms serveur. Prefetch automatique page suivante → clic "suivante" instantané.',
      'MATCHING IA — bouton "Rechercher les meilleurs candidats" dark mode : var(--foreground)/white → var(--primary)/var(--primary-foreground). Contraste propre.',
      'DOCUMENTS — card CV : bg var(--muted) → var(--primary-soft) brand. "Autre" → var(--secondary). Dropdown "Déplacer vers..." flip haut si dépasse viewport + maxHeight + scroll interne.',
      'FICHE CANDIDAT — placeholder photo light mode : var(--muted) = var(--muted-foreground) (invisible) → var(--secondary) + var(--foreground) + border.',
      'PIPELINE + LISTE CANDIDATS — hover CV : createPortal(..., document.body) pour échapper au containing block (Framer Motion transform). Hauteur 360 → max(360, min(900, 80vh)) dynamique. Largeur max 820 → 1100 pour grands écrans. Positionnement centré sur la card via rect.height. Hover preview enter/leave timers (pas de disparition quand on entre dans le popup).',
      'MODALS — Nouvelle commande / Modifier commande : sm:max-w-3xl + max-h-[90vh] + textareas 160/120px. Modal clients 640→820px. Modal missions 520→900px.',
      'BOUTONS JAUNE BRAND — .neo-btn-yellow color: var(--ink) (clair en dark) → var(--primary-foreground) (toujours sombre). 6 fichiers : color:white sur bg:primary → color:primary-foreground.',
      '/ACTIVITES — onglets Messages, Entretiens, Notes, Pipeline, Système supprimés. Restent : Tous, Candidats, Imports, Clients.',
      'DEV LOCALHOST — /admin refondu : purge cookies sb-* + magiclink → fin HTTP 431. NODE_OPTIONS=--max-http-header-size=65536 dans npm run dev. Suppression ALLOW_DEV_BYPASS.',
      'PDF — logo L-AGENCE officiel dans "Rapport de travail" — aligné sur le CV brandé.',
      'FIX IMPORT CV — archivage [Ancien] uniforme (cv/parse + onedrive/sync), textMatch sans guard hash/size (dup Luce), created_at dans SELECT update, await invalidateQueries avant dispatch, normalisation genre dans merge-candidat.',
      'CHANGELOG condensé : CHANGELOG.md 575→285 lignes + lib/version.ts 1715→130 lignes. Historique regroupé par phases thématiques au lieu de 90 entrées patch.',
    ],
  },
  {
    version: '1.9.40 → 1.9.64',
    date: '2026-04-19',
    label: 'Refonte dashboard + dark mode complet + polish badges',
    features: [
      'DASHBOARD — Header riche + 3 badges cliquables (À traiter / Rappels / Alertes), KPIs dynamiques (4 pour João avec ETP Missions), pipeline par consultant segmenté par métier, chart imports BarChart, widgets Activité récente + Top 10 villes, panel Mes rappels 2 onglets, questionnaire phrases 1er login (4 styles), avatar animé WavingAvatar, semaine ISO.',
      'DARK MODE — :root = LIGHT / .dark = DARK (2 jeux OKLCH distincts), nouveaux tokens --success / --warning / --info / --destructive / --*-foreground / --*-soft. classList.add(\'dark\') active Tailwind dark:*. ~350 hex hardcodés remplacés par var(--token) sur 27+ fichiers.',
      'TOPBAR — Bouton "Importer candidat" global sur toutes les pages dashboard, suppression split isOnCandidats + bouton sync Microsoft retiré. /parametres redirect direct vers /parametres/profil, sous-page /parametres/metiers, fusion Mon profil sidebar.',
      'BADGES per-user STRICTS — last_import_at TIMESTAMPTZ (remplace has_update bool global), hasBadge() DB source de vérité (fin UNION localStorage), debounce sidebar 500ms → 50ms, boutons Marquer vu / Non vu conditionnels.',
      'SHA256 CV — cv_sha256 + cv_size_bytes + index partiel. contenuIdentique = hashMatch || sizeMatch || textMatch (filename matching banni). Backfill one-shot ~10min + cron hebdo check-sha256-integrity.',
      'MATCHING — Pending Validation OneDrive (score 8-10 → validation manuelle), table decisions_matching (dataset ML futur), détection doublons déterministe (RPC 4 catégories SQL), merge intelligent (lib/merge-candidat.ts : IMMUABLES / MERGE / ÉCRASÉS), seuil strictExact 5 → 8 (fin écrasement homonymes).',
      'CLASSIFICATION — lib/document-classification.ts source unique CV/non-CV, filename matching BANNI définitivement. Fix extraction photo uniqueColors < 40, IA noms composés portugais/espagnols préservés.',
      'OBSERVABILITÉ — admin_detect_anomalies() v2 + résolution collaborative (anomalies_resolved), AlertsBanner 3 boutons + historique 50, banc DRY-RUN OneDrive mode live Graph.',
      'DIVERS — Historique envois email par campagne per-user, alerte doublon renforcée (per-user + 30j), veille offres suspendue, Speed Insights, ETP Missions unifié (lib/missions-etp.ts), fix 3 bugs critiques imports, 6 modals via createPortal.',
    ],
  },
  {
    version: '1.9.10 → 1.9.39',
    date: '2026-04-18',
    label: 'Matching hardening + veille offres + observabilité',
    features: [
      'VEILLE OFFRES — Scraping Apify jobs.ch / jobup.ch / Indeed CH (27 requêtes × 3 sources), Suisse romande uniquement, détection agences (60+ mots-clés), modération 3 onglets + badge sidebar, cron 6h.',
      'CDC VIEWER — Upload dans bucket cvs/cdc/, colonne offres.cdc_url, modal portalisé (PDF/image via iframe, DOCX via Office Web Viewer).',
      'MATCHING IA — Déterminisme (tiebreaker candidat.id), combobox offres, cv_texte_brut 1500 → 2500 chars, bonus localisation +6 ville / +4 canton (26 cantons), pénalité ancienneté, normalisation compétences. Logo L-AGENCE PNG dans cv-generator.ts.',
      'SIGNATURE EMAIL — Outlook personnalisable user_metadata.signature_html, bucket public-assets, preset dynamique par prénom consultant, templates SMS en masse avec variables [MÉTIER]/[LIEU], WhatsApp fiche candidat avec signature.',
      'MATCHING REFONTE identité-first — 5 étapes (présélection → reject DDN → scoring → filtre → tiebreak), scoring pondéré (DDN=+10, tel9=+8, email=+8, nom_exact=+5, nom_subset=+3, ville=+3). Fail-safe DDN immutable, wordsOverlapExact, collision tel9 seule insuffisante. Modale confirmation sur match détecté + cache 5min.',
      'ANOMALIES — admin_detect_anomalies() 3 familles, AlertsBanner /integrations, route DRY-RUN /api/onedrive/sync-test, TestFolderRunner.',
      'CLEANUP — Fix RLS pipeline_rappels (policy SELECT filtrée user_id), refetchOnWindowFocus, suppression cv/bulk + sharepoint/import (854 lignes orphelines), /api/cv/parse = route unifiée d\'import, lib/document-classification.ts + lib/normalize-candidat.ts.',
      'FIXES — Timer inactivité (4 chemins login), 3 bugs imports (non-CVs fantômes, memeTexte 500 → 2000, attachmentMode cv/parse), extraction photo rigoureuse, prompt IA enrichi noms composés.',
    ],
  },
  {
    version: '1.8.13 → 1.9.9',
    date: '2026-04-15',
    label: 'Audit sécurité + logique import CV finalisée + cv_texte_brut',
    features: [
      'AUDIT DB — 8 fixes : index dupliqué, auth.uid() → (select auth.uid()) sur 8 policies, search_path = public sur 7 fonctions, tables fantômes supprimées, 3 index FK ajoutés, vues SECURITY INVOKER.',
      'SÉCURITÉ — requireAuth() sur 51 routes API (middleware exclut /api/*), SMTP AES-256-GCM (lib/smtp-crypto.ts), RLS sur 33 tables, Sentry, timer inactivité 2h, 14 <img> → <Image> Next.js.',
      'IMPORT CV FINAL — Logique Skip / Réactivé / Update / Archive déterministe, has_update → last_import_at per-user, normFn noms fichiers (Storage encode espaces en underscores), fix [Ancien]/[Archive] promotion, DEFAULT \'nouveau\' supprimé sur statut_pipeline + 21 fantômes nettoyés.',
      'CV_TEXTE_BRUT + VISION IA — Colonne alimentée par 3 pipelines (manuel, masse, OneDrive). Vision Claude Haiku fallback PDFs scannés + JPG/PNG via URL (pas de limite taille). Marqueurs [scan-non-lisible] / [pdf-chiffre]. Cron */5min extract-cv-text batch 20 + card Outils.',
      'MISSIONS — Colonnes vacances et arrets JSONB, badges colorés par priorité (arrêt orange, vacances bleu, absence jaune, début bientôt, fin mission), ETP prorata déduit absences/vacances/arrêts.',
    ],
  },
  {
    version: '1.5.0 → 1.8.12',
    date: '2026-04-12',
    label: 'Module Secrétariat + détection doublons + missions',
    features: [
      'SECRÉTARIAT — Dashboard séparé (rôle Secrétaire), 6 tables (candidats, accidents, ALFA, paiements, loyers, notifications), import Excel batch (430 + 113 + 180 + 76 + 2 lignes), historique modifications, notifications auto+manuelles avec badge sidebar, WhatsApp + lien fiche candidat partout.',
      'DOUBLONS — Détection instantanée sans IA : email score 100, téléphone normalisé +41 score 95, nom+prénom score 85. Historique DB (doublons_historique), fusion guidée champ par champ.',
      'MISSIONS — CRUD complet + stats marge brute/coefficient + bilan mensuel, jours fériés cantonaux (Easter algo, lib/jours-feries.ts), import Notion flexible, sync Quadrigis avec validation manuelle (missions_pending). Sidebar adminOnly.',
      'NAVIGATION — Pipeline consultant obligatoire (erreur 400), ?from=pipeline|missions|secretariat sur fiche candidat, scroll sur .d-content (PAS window), recherche client Zefix → Claude web_search.',
    ],
  },
  {
    version: '1.0.0 → 1.4.0',
    date: '2026-04-07',
    label: 'Fondations TalentFlow',
    features: [
      'STACK — Next.js 16 (App Router) + React 19 + TypeScript 5 + Tailwind 4, Supabase (PostgreSQL + RLS) + Auth OTP 2FA, déploiement Vercel Pro région dub1.',
      'CORE — Candidats (6000+), clients (1200+), pipeline 3 colonnes, entretiens, missions, import masse ZIP/PDF/Word avec OCR fallback Vision IA.',
      'PARSING CV — Multi-modèle (Claude Anthropic, Google Gemini, Groq).',
      'INTÉGRATIONS — Microsoft 365 OAuth (Outlook multi-compte), emails/SMS/WhatsApp (Resend + SMTP fallback + WhatsApp Business API), France Travail (formulaire Word pré-rempli).',
      'FEATURES — Matching IA candidats ↔ offres + historique, timeline activité, doublons guidés, normalisation affichage (Prénom Nom, email lowercase, ville capitalisée).',
    ],
  },
]
