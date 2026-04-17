-- Table cv_customizations : personnalisations de CV par consultant
-- Un consultant peut customiser le CV d'un candidat sans modifier la fiche candidat
-- Chaque consultant voit uniquement ses propres customisations (RLS)

CREATE TABLE IF NOT EXISTS cv_customizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidat_id UUID NOT NULL REFERENCES candidats(id) ON DELETE CASCADE,
  consultant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(candidat_id, consultant_id)
);

CREATE INDEX IF NOT EXISTS idx_cv_customizations_candidat ON cv_customizations(candidat_id);
CREATE INDEX IF NOT EXISTS idx_cv_customizations_consultant ON cv_customizations(consultant_id);

ALTER TABLE cv_customizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cv_customizations_select" ON cv_customizations
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = consultant_id);

CREATE POLICY "cv_customizations_insert" ON cv_customizations
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = consultant_id);

CREATE POLICY "cv_customizations_update" ON cv_customizations
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = consultant_id)
  WITH CHECK ((select auth.uid()) = consultant_id);

CREATE POLICY "cv_customizations_delete" ON cv_customizations
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = consultant_id);
