// TalentFlow Version Configuration
// Convention: MAJOR.MINOR.PATCH (semver)
//
// Le CHANGELOG in-app est volontairement condensé par PHASES (1 entrée par thème majeur),
// pas par patch. Les détails ligne-à-ligne vivent dans CHANGELOG.md (racine du repo).

export const APP_VERSION = '1.9.95'
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
