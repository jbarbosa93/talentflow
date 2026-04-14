-- Supprime le trigger vestige qui synchronisait pipeline.etape → candidats.statut_pipeline
-- Ce trigger causait des ajouts automatiques non désirés dans le pipeline
-- La table historique_pipeline (0 lignes, jamais lue) n'est plus alimentée
DROP TRIGGER IF EXISTS trg_sync_candidat_statut ON pipeline;
