-- v2.8.6 — Déplacer preset_signature_data_url HORS de auth.users.user_metadata
-- vers une table dédiée.
--
-- Cause du bug : Supabase Auth embarque TOUT le user_metadata dans le JWT
-- du cookie auth-token. Un data URL PNG (~50KB) faisait exploser le cookie en
-- 17 chunks (70KB total) → dépassement limite Vercel 16KB → 494 REQUEST_HEADER_TOO_LARGE.
--
-- Le user (et donc l'admin João) ne pouvait plus accéder à talent-flow.ch même
-- en navigation privée (le cookie était reset à chaque session refresh).

CREATE TABLE IF NOT EXISTS user_preset_signatures (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data_url TEXT NOT NULL,
  set_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_preset_signatures ENABLE ROW LEVEL SECURITY;

-- Service role only (les routes API utilisent createAdminClient)
CREATE POLICY "service_role_full_access" ON user_preset_signatures
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Migrate existing data depuis user_metadata
INSERT INTO user_preset_signatures (user_id, data_url, set_at)
SELECT
  id,
  raw_user_meta_data->>'preset_signature_data_url',
  COALESCE((raw_user_meta_data->>'preset_signature_set_at')::timestamptz, NOW())
FROM auth.users
WHERE raw_user_meta_data->>'preset_signature_data_url' IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- PURGE le user_metadata pour TOUS les users → réduit taille cookie JWT
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data
  - 'preset_signature_data_url'
  - 'preset_signature_set_at'
WHERE raw_user_meta_data->>'preset_signature_data_url' IS NOT NULL;

COMMENT ON TABLE user_preset_signatures IS
  'Signature manuscrite pré-enregistrée par user (TalentFlow Sign). Séparée de auth.users.user_metadata pour éviter le bloat du cookie JWT (v2.8.6 fix 494 REQUEST_HEADER_TOO_LARGE).';
