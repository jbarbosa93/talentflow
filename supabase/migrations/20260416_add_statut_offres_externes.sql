-- Ajout colonne statut pour modération des offres externes
ALTER TABLE offres_externes ADD COLUMN statut TEXT DEFAULT 'a_traiter';
CREATE INDEX idx_offres_ext_statut ON offres_externes(statut);
UPDATE offres_externes SET statut = 'a_traiter' WHERE statut IS NULL;
