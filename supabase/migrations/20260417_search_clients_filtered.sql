-- 20260417_search_clients_filtered.sql
-- RPC de recherche clients avec unaccent sur tous les champs pertinents
-- (nom_entreprise, email, telephone, notes, secteur, ville, canton, adresse, npa, site_web, contacts jsonb)
-- Signature simple : chaîner .eq/.ilike/.range/count côté API

CREATE OR REPLACE FUNCTION search_clients_filtered(search_query TEXT)
RETURNS SETOF clients
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM clients
  WHERE
    unaccent(lower(COALESCE(nom_entreprise, '')))     ILIKE '%' || unaccent(lower(search_query)) || '%'
    OR unaccent(lower(COALESCE(email, '')))           ILIKE '%' || unaccent(lower(search_query)) || '%'
    OR unaccent(lower(COALESCE(telephone, '')))       ILIKE '%' || unaccent(lower(search_query)) || '%'
    OR unaccent(lower(COALESCE(notes, '')))           ILIKE '%' || unaccent(lower(search_query)) || '%'
    OR unaccent(lower(COALESCE(secteur, '')))         ILIKE '%' || unaccent(lower(search_query)) || '%'
    OR unaccent(lower(COALESCE(ville, '')))           ILIKE '%' || unaccent(lower(search_query)) || '%'
    OR unaccent(lower(COALESCE(canton, '')))          ILIKE '%' || unaccent(lower(search_query)) || '%'
    OR unaccent(lower(COALESCE(adresse, '')))         ILIKE '%' || unaccent(lower(search_query)) || '%'
    OR unaccent(lower(COALESCE(npa, '')))             ILIKE '%' || unaccent(lower(search_query)) || '%'
    OR unaccent(lower(COALESCE(site_web, '')))        ILIKE '%' || unaccent(lower(search_query)) || '%'
    OR unaccent(lower(COALESCE(contacts::text, ''))) ILIKE '%' || unaccent(lower(search_query)) || '%'
  ORDER BY nom_entreprise ASC;
END;
$$;
