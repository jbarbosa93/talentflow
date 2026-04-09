-- ── search_candidats_filtered v3 ─────────────────────────────────────────────
-- Prérequis : migration 20260401_candidats_indexes.sql appliquée (colonne fts + index GIN)
-- Prérequis : extension unaccent activée (disponible sur Supabase par défaut)
-- Fix 1 : result_offset manquant (pagination page 2+ retournait toujours page 1)
-- Fix 2 : multi-mots AND — chaque mot doit apparaître dans au moins un champ
-- Fix 4 : fts @@ plainto_tsquery (GIN index) + ILIKE sur tous les champs texte
-- Fix    : retourne total_count (attendu par route.ts depuis l'origine, jamais fourni)
-- Fix    : unaccent — macon trouve maçon, electricien trouve électricien
-- Fix    : champs couverts : nom, prénom, email, téléphone, titre, localisation, formation,
--          compétences, tags, expériences (JSON), formations (JSON), cv_texte_brut, resume_ia, notes

CREATE OR REPLACE FUNCTION search_candidats_filtered(
  search_query         text,
  filter_import_status text DEFAULT NULL,
  filter_statut        text DEFAULT NULL,
  result_limit         int  DEFAULT 100,
  result_offset        int  DEFAULT 0
)
RETURNS TABLE(id uuid, total_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  words     text[];
  per_word  text[];
  w         text;
  cond      text;
  all_conds text;
  sql_q     text;
BEGIN
  -- Découper en mots individuels (trim + filtre vides)
  SELECT array_agg(ww) INTO words
  FROM unnest(regexp_split_to_array(trim(search_query), '\s+')) AS ww
  WHERE length(trim(ww)) > 0;

  IF words IS NULL OR array_length(words, 1) = 0 THEN RETURN; END IF;

  -- Pour chaque mot : OR entre tous les champs (FTS GIN + ILIKE unaccent)
  -- AND entre les mots → chaque mot doit apparaître dans au moins un champ
  per_word := ARRAY[]::text[];
  FOREACH w IN ARRAY words LOOP
    cond := format(
      '(c.fts @@ plainto_tsquery(''french'', unaccent(%L))'
      ' OR unaccent(c.nom)                                  ILIKE unaccent(%L)'
      ' OR unaccent(c.prenom)                               ILIKE unaccent(%L)'
      ' OR unaccent(c.email)                                ILIKE unaccent(%L)'
      ' OR unaccent(c.telephone)                            ILIKE unaccent(%L)'
      ' OR unaccent(c.titre_poste)                          ILIKE unaccent(%L)'
      ' OR unaccent(c.localisation)                         ILIKE unaccent(%L)'
      ' OR unaccent(c.formation)                            ILIKE unaccent(%L)'
      ' OR unaccent(array_to_string(c.competences, '' ''))  ILIKE unaccent(%L)'
      ' OR unaccent(array_to_string(c.tags, '' ''))         ILIKE unaccent(%L)'
      ' OR unaccent(c.experiences::text)                    ILIKE unaccent(%L)'
      ' OR unaccent(c.formations_details::text)             ILIKE unaccent(%L)'
      ' OR unaccent(c.cv_texte_brut)                        ILIKE unaccent(%L)'
      ' OR unaccent(c.resume_ia)                            ILIKE unaccent(%L)'
      ' OR EXISTS (SELECT 1 FROM notes_candidat nc WHERE nc.candidat_id = c.id AND unaccent(nc.contenu) ILIKE unaccent(%L)))',
      w,
      '%'||w||'%', '%'||w||'%', '%'||w||'%', '%'||w||'%',
      '%'||w||'%', '%'||w||'%', '%'||w||'%', '%'||w||'%',
      '%'||w||'%', '%'||w||'%', '%'||w||'%', '%'||w||'%',
      '%'||w||'%', '%'||w||'%'
    );
    per_word := array_append(per_word, cond);
  END LOOP;

  -- AND entre tous les mots
  all_conds := '(' || array_to_string(per_word, ' AND ') || ')';

  -- Requête finale : conditions par mot + raccourci nom complet en OR
  sql_q := format(
    'SELECT c.id, COUNT(*) OVER()::bigint AS total_count'
    ' FROM candidats c'
    ' WHERE ('
    '   %s'
    '   OR unaccent(c.nom || '' '' || coalesce(c.prenom,'''')) ILIKE unaccent(%L)'
    '   OR unaccent(coalesce(c.prenom,'''') || '' '' || c.nom) ILIKE unaccent(%L)'
    ' )'
    ' AND ($1 IS NULL OR c.import_status::text = $1)'
    ' AND ($2 IS NULL OR c.statut_pipeline::text = $2)'
    ' ORDER BY c.created_at DESC'
    ' LIMIT $3 OFFSET $4',
    all_conds,
    '%'||search_query||'%',
    '%'||search_query||'%'
  );

  RETURN QUERY EXECUTE sql_q
  USING filter_import_status, filter_statut, result_limit, result_offset;
END;
$$;
