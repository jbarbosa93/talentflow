-- Fix RLS : la policy SELECT sur pipeline_rappels utilisait USING (true)
-- → tout utilisateur authentifié voyait les rappels de tous les consultants
-- Correction : chaque user ne voit que ses propres rappels pipeline

DROP POLICY IF EXISTS "pipeline_rappels_select" ON pipeline_rappels;

CREATE POLICY "pipeline_rappels_select" ON pipeline_rappels
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);
