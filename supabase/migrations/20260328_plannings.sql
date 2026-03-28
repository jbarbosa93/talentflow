-- Migration: table plannings
-- Planning hebdomadaire des candidats (remplace Notion)

CREATE TABLE IF NOT EXISTS plannings (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  candidat_id  UUID        REFERENCES candidats(id) ON DELETE SET NULL,
  client_nom   TEXT,
  metier       TEXT,
  pourcentage  NUMERIC     NOT NULL DEFAULT 1,
  remarques    TEXT,
  statut       TEXT        NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'inactif')),
  semaine      INT         NOT NULL,
  annee        INT         NOT NULL,
  user_id      UUID        NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_plannings_statut    ON plannings(statut);
CREATE INDEX IF NOT EXISTS idx_plannings_user_id   ON plannings(user_id);
CREATE INDEX IF NOT EXISTS idx_plannings_semaine   ON plannings(semaine, annee);

-- RLS
ALTER TABLE plannings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plannings_select_own"
  ON plannings FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "plannings_insert_own"
  ON plannings FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "plannings_update_own"
  ON plannings FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "plannings_delete_own"
  ON plannings FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "plannings_service_role"
  ON plannings FOR ALL TO service_role
  USING (true) WITH CHECK (true);
