-- 20260419_anomalies_resolved.sql
-- v1.9.18 : Table de résolution des anomalies observabilité.
-- Collaborative : tous les consultants authentifiés lisent/écrivent.
-- Ré-apparition si le CV change (cv_url actuel ≠ resolved_cv_url).

CREATE TABLE IF NOT EXISTS public.anomalies_resolved (
  candidat_id       UUID NOT NULL REFERENCES public.candidats(id) ON DELETE CASCADE,
  anomaly_type      TEXT NOT NULL CHECK (anomaly_type IN ('texte_mismatch','onedrive_mismatch','cv_orphan')),
  resolution        TEXT NOT NULL CHECK (resolution IN ('faux_positif','corrige')),
  resolved_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_by_email TEXT,
  resolved_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_cv_url   TEXT,
  note              TEXT,
  PRIMARY KEY (candidat_id, anomaly_type)
);

CREATE INDEX IF NOT EXISTS idx_anomalies_resolved_resolved_at
  ON public.anomalies_resolved (resolved_at DESC);

ALTER TABLE public.anomalies_resolved ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anomalies_resolved_select" ON public.anomalies_resolved;
DROP POLICY IF EXISTS "anomalies_resolved_insert" ON public.anomalies_resolved;
DROP POLICY IF EXISTS "anomalies_resolved_update" ON public.anomalies_resolved;
DROP POLICY IF EXISTS "anomalies_resolved_delete" ON public.anomalies_resolved;

CREATE POLICY "anomalies_resolved_select" ON public.anomalies_resolved
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "anomalies_resolved_insert" ON public.anomalies_resolved
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = resolved_by);

CREATE POLICY "anomalies_resolved_update" ON public.anomalies_resolved
  FOR UPDATE TO authenticated USING (true) WITH CHECK ((select auth.uid()) = resolved_by);

CREATE POLICY "anomalies_resolved_delete" ON public.anomalies_resolved
  FOR DELETE TO authenticated USING (true);

COMMENT ON TABLE public.anomalies_resolved IS
'Historique collaboratif des résolutions d''anomalies observabilité (v1.9.18). Une anomalie résolue reste masquée tant que cv_url du candidat = resolved_cv_url ; si le CV change, elle réapparaît.';
