-- v2.7.1 — Lien mission ↔ rapport
-- Permet de créer un lien rapport pré-rempli depuis la liste des missions,
-- avec synchronisation auto des dates mission → report_link_clients.

ALTER TABLE report_links
  ADD COLUMN IF NOT EXISTS mission_id uuid
    REFERENCES missions(id) ON DELETE SET NULL;

COMMENT ON COLUMN report_links.mission_id IS
  'Mission liée — sync auto des dates + arrêts vers report_link_clients';

-- Unique partiel : une mission ne peut avoir qu'un seul lien rapport actif
CREATE UNIQUE INDEX IF NOT EXISTS idx_report_links_mission_unique
  ON report_links(mission_id)
  WHERE mission_id IS NOT NULL;

-- Dédup envois auto-arrêt (cron dimanche soir)
-- Chaque (link_id, week_start) reçoit au plus 1 notification d'arrêt.
CREATE TABLE IF NOT EXISTS report_auto_arret_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES report_links(id) ON DELETE CASCADE,
  mission_id uuid REFERENCES missions(id) ON DELETE SET NULL,
  week_start date NOT NULL,
  week_end date NOT NULL,
  arret_debut date NOT NULL,
  arret_fin date NOT NULL,
  recipients text[] NOT NULL DEFAULT '{}',
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(link_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_auto_arret_log_link ON report_auto_arret_log(link_id);

ALTER TABLE report_auto_arret_log ENABLE ROW LEVEL SECURITY;

-- Service role only (cron) — pas d'accès direct utilisateur
CREATE POLICY "service_role_all_arret_log"
  ON report_auto_arret_log
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
