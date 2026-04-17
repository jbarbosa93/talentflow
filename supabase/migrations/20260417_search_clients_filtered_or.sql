-- 20260417_search_clients_filtered_or.sql
-- Recherche booléenne OR sur les mots : "peintre plâtrier" → clients contenant peintre OU plâtrier
-- Split par \s+, unaccent+lower chaque mot, EXISTS/unnest pour OR multi-mots × 11 champs

CREATE OR REPLACE FUNCTION search_clients_filtered(search_query TEXT)
RETURNS SETOF clients
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  words TEXT[];
BEGIN
  words := ARRAY(
    SELECT unaccent(lower(x))
    FROM regexp_split_to_table(trim(coalesce(search_query, '')), '\s+') AS x
    WHERE length(trim(x)) > 0
  );

  IF array_length(words, 1) IS NULL THEN
    RETURN QUERY SELECT * FROM clients ORDER BY nom_entreprise ASC;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT * FROM clients c
  WHERE EXISTS (
    SELECT 1 FROM unnest(words) AS w
    WHERE
      unaccent(lower(COALESCE(c.nom_entreprise, '')))    ILIKE '%' || w || '%'
      OR unaccent(lower(COALESCE(c.email, '')))           ILIKE '%' || w || '%'
      OR unaccent(lower(COALESCE(c.telephone, '')))       ILIKE '%' || w || '%'
      OR unaccent(lower(COALESCE(c.notes, '')))           ILIKE '%' || w || '%'
      OR unaccent(lower(COALESCE(c.secteur, '')))         ILIKE '%' || w || '%'
      OR unaccent(lower(COALESCE(c.ville, '')))           ILIKE '%' || w || '%'
      OR unaccent(lower(COALESCE(c.canton, '')))          ILIKE '%' || w || '%'
      OR unaccent(lower(COALESCE(c.adresse, '')))         ILIKE '%' || w || '%'
      OR unaccent(lower(COALESCE(c.npa, '')))             ILIKE '%' || w || '%'
      OR unaccent(lower(COALESCE(c.site_web, '')))        ILIKE '%' || w || '%'
      OR unaccent(lower(COALESCE(c.contacts::text, '')))  ILIKE '%' || w || '%'
  )
  ORDER BY c.nom_entreprise ASC;
END;
$$;
