-- Add Commandes (client orders) fields to offres table
ALTER TABLE offres ADD COLUMN IF NOT EXISTS client_nom TEXT;
ALTER TABLE offres ADD COLUMN IF NOT EXISTS nb_postes INTEGER DEFAULT 1;
ALTER TABLE offres ADD COLUMN IF NOT EXISTS date_debut DATE;
ALTER TABLE offres ADD COLUMN IF NOT EXISTS duree_mission TEXT;
