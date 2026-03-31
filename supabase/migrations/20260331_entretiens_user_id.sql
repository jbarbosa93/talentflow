-- Migration: Entretiens — isolation par utilisateur
-- Ajoute user_id pour que chaque utilisateur ne voie que ses propres suivis
-- Date: 2026-03-31

ALTER TABLE entretiens
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Index pour filtrage rapide par utilisateur
CREATE INDEX IF NOT EXISTS idx_entretiens_user_id
  ON entretiens (user_id);
