-- Audit DB v1.8.32 — 8 fixes sécurité/performance
-- Exécuté manuellement via Supabase SQL Editor le 13/04/2026

-- Fix 1 — Index dupliqué
DROP INDEX IF EXISTS idx_candidats_created;

-- Fix 3 — Policy redondante candidats
DROP POLICY IF EXISTS "recruteurs_candidats" ON candidats;

-- Fix 4 — auth.uid() → (select auth.uid())
DROP POLICY IF EXISTS "plannings_select_own" ON plannings;
CREATE POLICY "plannings_select_own" ON plannings FOR SELECT USING (user_id = (select auth.uid()));
DROP POLICY IF EXISTS "plannings_insert_own" ON plannings;
CREATE POLICY "plannings_insert_own" ON plannings FOR INSERT WITH CHECK (user_id = (select auth.uid()));
DROP POLICY IF EXISTS "plannings_update_own" ON plannings;
CREATE POLICY "plannings_update_own" ON plannings FOR UPDATE USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
DROP POLICY IF EXISTS "plannings_delete_own" ON plannings;
CREATE POLICY "plannings_delete_own" ON plannings FOR DELETE USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "candidats_vus_own" ON candidats_vus;
CREATE POLICY "candidats_vus_own" ON candidats_vus FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "pipeline_rappels_insert" ON pipeline_rappels;
CREATE POLICY "pipeline_rappels_insert" ON pipeline_rappels FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "pipeline_rappels_delete" ON pipeline_rappels;
CREATE POLICY "pipeline_rappels_delete" ON pipeline_rappels FOR DELETE USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "pipeline_rappels_update" ON pipeline_rappels;
CREATE POLICY "pipeline_rappels_update" ON pipeline_rappels FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- Fix 5 — search_path mutable
ALTER FUNCTION search_candidats(text) SET search_path = public;
ALTER FUNCTION search_candidats_filtered(text, text, text, integer) SET search_path = public;
ALTER FUNCTION search_candidats_filtered(text, text, text, integer, integer) SET search_path = public;
ALTER FUNCTION merge_candidats(uuid, uuid, jsonb) SET search_path = public;
ALTER FUNCTION update_updated_at_column() SET search_path = public;
ALTER FUNCTION update_updated_at() SET search_path = public;
ALTER FUNCTION sync_candidat_statut() SET search_path = public;

-- Fix 6 — Tables fantômes vides
DROP TABLE IF EXISTS public.candidates;
DROP TABLE IF EXISTS public.jobs;

-- Fix 7 — Index sur FK principales
CREATE INDEX IF NOT EXISTS idx_candidats_vus_candidat ON candidats_vus(candidat_id);
CREATE INDEX IF NOT EXISTS idx_entretiens_candidat ON entretiens(candidat_id);
CREATE INDEX IF NOT EXISTS idx_missions_candidat ON missions(candidat_id);

-- Fix 8 — Vues SECURITY DEFINER → INVOKER
ALTER VIEW vue_candidats_avec_score SET (security_invoker = true);
ALTER VIEW vue_pipeline_complet SET (security_invoker = true);
