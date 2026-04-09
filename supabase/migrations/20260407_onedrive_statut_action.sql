-- Migration: ajouter statut_action et ancien_nom_fichier à onedrive_fichiers
-- statut_action : distingue proprement créé / mis à jour / réactivé / document / erreur / abandonné
-- ancien_nom_fichier : pour afficher "ancien CV → nouveau CV" dans l'historique

ALTER TABLE onedrive_fichiers
ADD COLUMN IF NOT EXISTS statut_action TEXT,
ADD COLUMN IF NOT EXISTS ancien_nom_fichier TEXT;
