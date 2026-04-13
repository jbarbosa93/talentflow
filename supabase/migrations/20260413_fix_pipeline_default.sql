-- Fix v1.8.31 : statut_pipeline avait DEFAULT 'nouveau'::pipeline_etape
-- Causait l'ajout automatique de candidats dans la pipeline sans action manuelle
-- 21 candidats fantômes nettoyés (pipeline_consultant IS NULL = jamais ajoutés manuellement)

ALTER TABLE candidats ALTER COLUMN statut_pipeline SET DEFAULT NULL;

UPDATE candidats
SET statut_pipeline = NULL
WHERE statut_pipeline IS NOT NULL
AND pipeline_consultant IS NULL;
