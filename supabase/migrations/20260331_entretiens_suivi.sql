-- Migration: Entretiens → Suivi Candidat
-- Ajoute les champs nécessaires pour le suivi des entretiens fixes
-- Date: 2026-03-31

ALTER TABLE entretiens
  ADD COLUMN IF NOT EXISTS candidat_nom_manuel TEXT,
  ADD COLUMN IF NOT EXISTS entreprise_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entreprise_nom TEXT,
  ADD COLUMN IF NOT EXISTS poste TEXT,
  ADD COLUMN IF NOT EXISTS rappel_date DATE,
  ADD COLUMN IF NOT EXISTS rappel_vu BOOLEAN DEFAULT FALSE;

-- Index pour recherche rapide des rappels actifs
CREATE INDEX IF NOT EXISTS idx_entretiens_rappel
  ON entretiens (rappel_date, rappel_vu)
  WHERE rappel_date IS NOT NULL AND rappel_vu = FALSE;
