-- v2.8.8 — Notes partagées sur un candidat
-- Visibles par le consultant L-Agence ET le client (via portail public).

CREATE TABLE IF NOT EXISTS candidat_notes_partagees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidat_id UUID NOT NULL REFERENCES candidats(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  author_type TEXT NOT NULL CHECK (author_type IN ('consultant', 'client')),
  author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidat_notes_partagees_candidat
  ON candidat_notes_partagees(candidat_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidat_notes_partagees_client
  ON candidat_notes_partagees(client_id, created_at DESC)
  WHERE client_id IS NOT NULL;

ALTER TABLE candidat_notes_partagees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON candidat_notes_partagees
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE candidat_notes_partagees IS
  'Notes partagées sur un candidat, visibles par consultant L-Agence + client (via portail public). v2.8.8.';
