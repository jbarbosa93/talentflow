-- Migration: ajout colonnes pipeline_consultant et pipeline_metier sur candidats
-- Run in Supabase SQL Editor

ALTER TABLE candidats
  ADD COLUMN IF NOT EXISTS pipeline_consultant text,
  ADD COLUMN IF NOT EXISTS pipeline_metier text;
