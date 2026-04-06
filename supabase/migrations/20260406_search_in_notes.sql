-- ── Mise à jour search_candidats_filtered : inclure notes_candidat ─────────────
-- Recherche ILIKE sur tous les champs principaux + notes_candidat.contenu
-- Note: ne pas référencer c.fts (colonne non créée en base)

CREATE OR REPLACE FUNCTION search_candidats_filtered(
  search_query text,
  filter_import_status text DEFAULT NULL,
  filter_statut text DEFAULT NULL,
  result_limit int DEFAULT 100
)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  like_query text;
BEGIN
  like_query := '%' || search_query || '%';

  RETURN QUERY
  SELECT DISTINCT c.id
  FROM candidats c
  WHERE (
    c.nom ILIKE like_query
    OR c.prenom ILIKE like_query
    OR c.email ILIKE like_query
    OR c.localisation ILIKE like_query
    OR c.titre_poste ILIKE like_query
    OR c.formation ILIKE like_query
    OR c.cv_texte_brut ILIKE like_query
    OR (c.nom || ' ' || coalesce(c.prenom, '')) ILIKE like_query
    OR (coalesce(c.prenom, '') || ' ' || c.nom) ILIKE like_query
    OR EXISTS (
      SELECT 1
      FROM notes_candidat n
      WHERE n.candidat_id = c.id
        AND n.contenu ILIKE like_query
    )
  )
  AND (filter_import_status IS NULL OR c.import_status::text = filter_import_status)
  AND (filter_statut IS NULL OR c.statut_pipeline::text = filter_statut)
  LIMIT result_limit;
END;
$$;
