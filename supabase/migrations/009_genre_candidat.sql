-- Migration: ajout du champ genre sur la table candidats
ALTER TABLE candidats ADD COLUMN IF NOT EXISTS genre TEXT CHECK (genre IN ('homme', 'femme'));
