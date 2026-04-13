-- v1.8.22 — Colonne has_update pour signaler un changement CV sans toucher import_status
ALTER TABLE candidats ADD COLUMN IF NOT EXISTS has_update boolean DEFAULT false;
