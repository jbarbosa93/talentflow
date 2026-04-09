-- ── candidats_vus — tracking "vu" par utilisateur, cross-device ──────────────
-- Remplace le localStorage talentflow_viewed_candidats
-- Un candidat est "vu" si :
--   created_at < user_metadata.candidats_viewed_all_at
--   OU candidat_id IN (SELECT candidat_id FROM candidats_vus WHERE user_id = auth.uid())

CREATE TABLE IF NOT EXISTS candidats_vus (
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  candidat_id  uuid NOT NULL REFERENCES candidats(id)  ON DELETE CASCADE,
  viewed_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, candidat_id)
);

CREATE INDEX IF NOT EXISTS idx_candidats_vus_user ON candidats_vus (user_id);

ALTER TABLE candidats_vus ENABLE ROW LEVEL SECURITY;

-- Chaque utilisateur ne voit que ses propres lignes
CREATE POLICY "candidats_vus_own"
  ON candidats_vus FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role — accès complet pour les routes API admin
CREATE POLICY "candidats_vus_service"
  ON candidats_vus FOR ALL
  TO service_role USING (true) WITH CHECK (true);
