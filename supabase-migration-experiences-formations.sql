-- Migration : ajout des expériences professionnelles et formations structurées
-- À exécuter dans Supabase > SQL Editor

ALTER TABLE candidats
  ADD COLUMN IF NOT EXISTS experiences       jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS formations_details jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN candidats.experiences        IS 'Expériences professionnelles extraites du CV [{ poste, entreprise, periode, description }]';
COMMENT ON COLUMN candidats.formations_details IS 'Formations et diplômes extraits du CV [{ diplome, etablissement, annee }]';
