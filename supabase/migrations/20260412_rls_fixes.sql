-- ============================================================
-- Migration: RLS fixes — 4 corrections
-- Date: 2026-04-12
-- ============================================================

-- 1. logs_acces : ajouter SELECT pour authenticated
--    (la page Sécurité utilise createClient() côté navigateur)
CREATE POLICY "logs_acces_select" ON logs_acces
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "logs_acces_service" ON logs_acces
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. pipeline_rappels UPDATE : ajouter filtre user_id
--    (avant : USING (true) → n'importe qui pouvait modifier les rappels d'autrui)
DROP POLICY IF EXISTS "pipeline_rappels_update" ON pipeline_rappels;

CREATE POLICY "pipeline_rappels_update" ON pipeline_rappels
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. entretiens : remplacer allow_all_entretiens (FOR ALL sans filtre)
--    par des policies isolées par user_id
DROP POLICY IF EXISTS "allow_all_entretiens" ON entretiens;

CREATE POLICY "entretiens_select" ON entretiens
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "entretiens_insert" ON entretiens
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "entretiens_update" ON entretiens
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "entretiens_delete" ON entretiens
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "entretiens_service" ON entretiens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. candidates (table orpheline distincte de "candidats") : activer RLS
--    Aucune policy → bloque tout accès client (service_role bypass automatique)
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
