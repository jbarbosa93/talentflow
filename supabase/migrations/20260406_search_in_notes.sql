-- ── Mise à jour search_candidats_filtered : inclure notes_candidat ─────────────
-- La version précédente ne cherchait pas dans les notes de la table notes_candidat.
-- Cette version y ajoute une recherche ILIKE sur notes_candidat.contenu.

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
  tsq tsquery;
  like_query text;
BEGIN
  like_query := '%' || search_query || '%';

  -- Tenter de construire la tsquery en français, fallback simple
  BEGIN
    tsq := plainto_tsquery('french', search_query);
  EXCEPTION WHEN others THEN
    BEGIN
      tsq := plainto_tsquery('simple', search_query);
    EXCEPTION WHEN others THEN
      tsq := NULL;
    END;
  END;

  RETURN QUERY
  SELECT DISTINCT c.id
  FROM candidats c
  WHERE (
    -- Full-text search vectoriel sur les colonnes indexées
    (tsq IS NOT NULL AND c.fts @@ tsq)
    -- Fallback ILIKE sur les champs principaux
    OR c.nom ILIKE like_query
    OR c.prenom ILIKE like_query
    OR c.email ILIKE like_query
    OR c.localisation ILIKE like_query
    OR c.titre_poste ILIKE like_query
    OR c.formation ILIKE like_query
    OR c.cv_texte_brut ILIKE like_query
    -- Nom complet dans les deux sens
    OR (c.nom || ' ' || coalesce(c.prenom, '')) ILIKE like_query
    OR (coalesce(c.prenom, '') || ' ' || c.nom) ILIKE like_query
    -- Recherche dans les notes de la table notes_candidat
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
