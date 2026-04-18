-- v1.9.24 — Drop colonne zombie has_update + index date_naissance

-- Bug 1 : has_update est une colonne zombie depuis v1.9.16 (remplacée par last_import_at).
-- Tous les consommateurs dans le code ont été supprimés (cv/parse, onedrive/sync, candidats routes).
ALTER TABLE candidats DROP COLUMN IF EXISTS has_update;

-- Bug 2 : index manquant sur date_naissance (utilisé par matching DDN exact + signal fort).
-- Filtre partiel : exclut les NULL pour réduire la taille de l'index.
CREATE INDEX IF NOT EXISTS idx_candidats_date_naissance
  ON candidats(date_naissance)
  WHERE date_naissance IS NOT NULL;
