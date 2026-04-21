-- v1.9.71 — Table pivot offres_candidats : lier candidats à des commandes ouvertes
-- Indépendant du pipeline. Statut simple (a_envoyer / envoye) avec date d'envoi optionnelle.
-- Appliqué sur Supabase prod le 21/04/2026 via MCP apply_migration.

CREATE TABLE IF NOT EXISTS offres_candidats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offre_id uuid NOT NULL REFERENCES offres(id) ON DELETE CASCADE,
  candidat_id uuid NOT NULL REFERENCES candidats(id) ON DELETE CASCADE,
  statut text NOT NULL DEFAULT 'a_envoyer' CHECK (statut IN ('a_envoyer', 'envoye')),
  date_envoi date NULL,
  user_id uuid NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (offre_id, candidat_id)
);

CREATE INDEX IF NOT EXISTS idx_offres_candidats_offre ON offres_candidats(offre_id);
CREATE INDEX IF NOT EXISTS idx_offres_candidats_candidat ON offres_candidats(candidat_id);
CREATE INDEX IF NOT EXISTS idx_offres_candidats_statut ON offres_candidats(statut);

ALTER TABLE offres_candidats ENABLE ROW LEVEL SECURITY;

CREATE POLICY offres_candidats_select_team ON offres_candidats
  FOR SELECT TO authenticated USING (true);

CREATE POLICY offres_candidats_insert_auth ON offres_candidats
  FOR INSERT TO authenticated WITH CHECK (user_id IS NULL OR (SELECT auth.uid()) = user_id);

CREATE POLICY offres_candidats_update_auth ON offres_candidats
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY offres_candidats_delete_auth ON offres_candidats
  FOR DELETE TO authenticated USING (true);

COMMENT ON TABLE offres_candidats IS
  'Pivot v1.9.71 : candidats proposés à une commande. Statut a_envoyer/envoye, indépendant du pipeline.';
