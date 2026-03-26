-- Table de paramètres applicatifs (clé/valeur JSON)
-- Utilisée pour stocker les métiers et autres settings partagés

CREATE TABLE IF NOT EXISTS app_settings (
  key   text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_settings" ON app_settings FOR ALL USING (true);
