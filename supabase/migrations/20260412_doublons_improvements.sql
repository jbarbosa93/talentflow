-- Migration: doublons improvements
-- - Table doublons_historique (remplace localStorage)
-- - RPC find_similar_candidates (pg_trgm fuzzy matching)

-- 1. pg_trgm déjà activée

-- 2. Table historique doublons
CREATE TABLE IF NOT EXISTS doublons_historique (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  candidat_a_id uuid NOT NULL,
  candidat_b_id uuid NOT NULL,
  candidat_a_nom text NOT NULL DEFAULT '',
  candidat_b_nom text NOT NULL DEFAULT '',
  action text NOT NULL CHECK (action IN ('merged', 'dismissed')),
  score integer,
  raisons text[],
  merged_keep_id uuid,
  user_id uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE doublons_historique ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_select_doublons_historique" ON doublons_historique FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_doublons_historique" ON doublons_historique FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_delete_doublons_historique" ON doublons_historique FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_doublons_historique_pair ON doublons_historique (candidat_a_id, candidat_b_id);

-- 3. RPC find_similar_candidates
CREATE OR REPLACE FUNCTION find_similar_candidates(threshold integer DEFAULT 20)
RETURNS TABLE (
  id_a uuid,
  id_b uuid,
  nom_a text,
  prenom_a text,
  nom_b text,
  prenom_b text,
  email_a text,
  email_b text,
  telephone_a text,
  telephone_b text,
  match_type text,
  sim_score double precision
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY

  -- Exact email matches
  SELECT
    c1.id AS id_a, c2.id AS id_b,
    c1.nom AS nom_a, c1.prenom AS prenom_a,
    c2.nom AS nom_b, c2.prenom AS prenom_b,
    c1.email AS email_a, c2.email AS email_b,
    c1.telephone AS telephone_a, c2.telephone AS telephone_b,
    'email'::text AS match_type,
    1.0::double precision AS sim_score
  FROM candidats c1
  JOIN candidats c2 ON c1.id < c2.id
    AND lower(trim(c1.email)) = lower(trim(c2.email))
  WHERE c1.email IS NOT NULL AND c1.email != ''
    AND c2.email IS NOT NULL AND c2.email != ''

  UNION ALL

  -- Exact phone matches (normalized)
  SELECT
    c1.id, c2.id,
    c1.nom, c1.prenom,
    c2.nom, c2.prenom,
    c1.email, c2.email,
    c1.telephone, c2.telephone,
    'telephone'::text,
    1.0::double precision
  FROM candidats c1
  JOIN candidats c2 ON c1.id < c2.id
    AND regexp_replace(c1.telephone, '[\s\-\.\(\)]', '', 'g') = regexp_replace(c2.telephone, '[\s\-\.\(\)]', '', 'g')
  WHERE c1.telephone IS NOT NULL AND length(c1.telephone) > 5
    AND c2.telephone IS NOT NULL AND length(c2.telephone) > 5
    AND NOT EXISTS (
      SELECT 1 FROM candidats cx JOIN candidats cy ON cx.id < cy.id
        AND lower(trim(cx.email)) = lower(trim(cy.email))
      WHERE cx.id = c1.id AND cy.id = c2.id
        AND cx.email IS NOT NULL AND cx.email != ''
    )

  UNION ALL

  -- Fuzzy name matches via pg_trgm
  SELECT
    c1.id, c2.id,
    c1.nom, c1.prenom,
    c2.nom, c2.prenom,
    c1.email, c2.email,
    c1.telephone, c2.telephone,
    'nom'::text,
    greatest(
      similarity(lower(c1.nom || ' ' || coalesce(c1.prenom, '')), lower(c2.nom || ' ' || coalesce(c2.prenom, ''))),
      similarity(lower(c1.nom), lower(c2.nom))
    )::double precision
  FROM candidats c1
  JOIN candidats c2 ON c1.id < c2.id
    AND greatest(
      similarity(lower(c1.nom || ' ' || coalesce(c1.prenom, '')), lower(c2.nom || ' ' || coalesce(c2.prenom, ''))),
      similarity(lower(c1.nom), lower(c2.nom))
    ) >= (threshold::double precision / 100.0)
  WHERE c1.nom IS NOT NULL AND length(c1.nom) >= 2
    AND c2.nom IS NOT NULL AND length(c2.nom) >= 2
    AND NOT EXISTS (
      SELECT 1 FROM candidats cx JOIN candidats cy ON cx.id < cy.id
        AND lower(trim(cx.email)) = lower(trim(cy.email))
      WHERE cx.id = c1.id AND cy.id = c2.id
        AND cx.email IS NOT NULL AND cx.email != ''
    )
    AND NOT EXISTS (
      SELECT 1 FROM candidats cx JOIN candidats cy ON cx.id < cy.id
        AND regexp_replace(cx.telephone, '[\s\-\.\(\)]', '', 'g') = regexp_replace(cy.telephone, '[\s\-\.\(\)]', '', 'g')
      WHERE cx.id = c1.id AND cy.id = c2.id
        AND cx.telephone IS NOT NULL AND length(cx.telephone) > 5
    )

  ORDER BY sim_score DESC
  LIMIT 500;
END;
$$;
