-- Migration: table pipeline_rappels avec RLS
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS pipeline_rappels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidat_id uuid NOT NULL REFERENCES candidats(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rappel_at   timestamptz NOT NULL,
  note        text,
  done        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pipeline_rappels ENABLE ROW LEVEL SECURITY;

-- Tous les utilisateurs authentifiés peuvent lire/écrire leurs propres rappels
CREATE POLICY "pipeline_rappels_select" ON pipeline_rappels
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "pipeline_rappels_insert" ON pipeline_rappels
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "pipeline_rappels_update" ON pipeline_rappels
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "pipeline_rappels_delete" ON pipeline_rappels
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Index pour la détection des rappels dus
CREATE INDEX IF NOT EXISTS pipeline_rappels_rappel_at_idx ON pipeline_rappels (rappel_at) WHERE done = false;
CREATE INDEX IF NOT EXISTS pipeline_rappels_candidat_idx ON pipeline_rappels (candidat_id);
