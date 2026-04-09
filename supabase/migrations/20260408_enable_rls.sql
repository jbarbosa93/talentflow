-- ============================================================
-- Migration: Activer RLS sur les 5 tables publiques non protégées
-- Date: 2026-04-08
-- Contexte: Alerte sécurité Supabase — tables accessibles sans RLS
-- Impact:
--   - candidats : accessible aux authenticated (client public OK)
--   - app_settings : lecture authenticated, écriture service_role only
--   - email_otps, jobs, onedrive_fichiers : service_role uniquement
-- ============================================================

-- 1. Activer Row Level Security
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidats ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE onedrive_fichiers ENABLE ROW LEVEL SECURITY;

-- 2. Policies service_role (bypass complet pour les routes API)
CREATE POLICY "service_role_all" ON candidats
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON app_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON email_otps
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON onedrive_fichiers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Policies authenticated (accès client public navigateur)
CREATE POLICY "authenticated_all" ON candidats
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read" ON app_settings
  FOR SELECT TO authenticated USING (true);
