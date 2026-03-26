-- Migration : convertir statut_pipeline de enum pipeline_etape à text
-- Permet les étapes personnalisées dans le pipeline
-- À exécuter dans Supabase Dashboard SQL Editor
ALTER TABLE candidats ALTER COLUMN statut_pipeline TYPE text USING statut_pipeline::text;
