-- v2.6.6 — Mode de paiement candidats + calendrier paiement + log notifications
-- 3 changements :
--   1. ADD COLUMN mode_paiement sur secretariat_candidats
--   2. Table secretariat_paiement_calendrier (référentiel dates 2026)
--   3. Table secretariat_paiement_notifs_log (dédup envoi cron)

-- ============================================================
-- 1) Colonne mode_paiement sur secretariat_candidats
-- ============================================================
ALTER TABLE secretariat_candidats
  ADD COLUMN IF NOT EXISTS mode_paiement TEXT
  CHECK (mode_paiement IN ('calendrier_mensuel', 'mensuel', 'hebdomadaire'));

COMMENT ON COLUMN secretariat_candidats.mode_paiement IS
  'Mode de paiement du salaire : calendrier_mensuel (rouge, mensuel décalé) / mensuel (vert, payé le mois suivant) / hebdomadaire (paiement Jeudi 14h)';

-- ============================================================
-- 2) Table calendrier (référentiel paiements 2026)
-- ============================================================
CREATE TABLE IF NOT EXISTS secretariat_paiement_calendrier (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode TEXT NOT NULL CHECK (mode IN ('calendrier_mensuel', 'mensuel', 'hebdomadaire')),
  annee INTEGER NOT NULL,
  libelle TEXT NOT NULL,           -- ex: "Janvier (sem 1-2-3)" / "Janvier travaillé" / "Sem 22"
  date_limite DATE,                 -- date limite réception heures (info, pas utilisée pour notif)
  date_paiement DATE NOT NULL,      -- jour du versement
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(mode, annee, libelle)
);

CREATE INDEX IF NOT EXISTS idx_paiement_calendrier_date_paiement
  ON secretariat_paiement_calendrier(date_paiement);
CREATE INDEX IF NOT EXISTS idx_paiement_calendrier_mode_annee
  ON secretariat_paiement_calendrier(mode, annee);

-- RLS : lecture pour authentifiés, écriture admin/secrétaire
ALTER TABLE secretariat_paiement_calendrier ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "paiement_calendrier_read" ON secretariat_paiement_calendrier;
CREATE POLICY "paiement_calendrier_read" ON secretariat_paiement_calendrier
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 3) Table log notifications (dédup envoi cron)
-- ============================================================
CREATE TABLE IF NOT EXISTS secretariat_paiement_notifs_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidat_id UUID NOT NULL REFERENCES secretariat_candidats(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  date_paiement DATE NOT NULL,
  date_envoi TIMESTAMPTZ DEFAULT NOW(),
  email TEXT,
  status TEXT DEFAULT 'sent',       -- 'sent' / 'failed' / 'skipped_no_email'
  error_message TEXT,
  UNIQUE(candidat_id, date_paiement)  -- 1 seul email par candidat × date paiement
);

CREATE INDEX IF NOT EXISTS idx_paiement_notifs_log_candidat
  ON secretariat_paiement_notifs_log(candidat_id);
CREATE INDEX IF NOT EXISTS idx_paiement_notifs_log_date
  ON secretariat_paiement_notifs_log(date_envoi);

ALTER TABLE secretariat_paiement_notifs_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "paiement_notifs_log_read" ON secretariat_paiement_notifs_log;
CREATE POLICY "paiement_notifs_log_read" ON secretariat_paiement_notifs_log
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 4) SEED — Calendrier MENSUEL DÉCALÉ (rouge) — 2026
-- ============================================================
INSERT INTO secretariat_paiement_calendrier (mode, annee, libelle, date_limite, date_paiement) VALUES
  ('calendrier_mensuel', 2026, 'Janvier (sem 1-2-3)',       '2026-01-20', '2026-01-23'),
  ('calendrier_mensuel', 2026, 'Février (sem 4-5-6-7)',     '2026-02-17', '2026-02-20'),
  ('calendrier_mensuel', 2026, 'Mars (sem 8-9-10-11-12)',   '2026-03-24', '2026-03-27'),
  ('calendrier_mensuel', 2026, 'Avril (sem 13-14-15-16)',   '2026-04-21', '2026-04-24'),
  ('calendrier_mensuel', 2026, 'Mai (sem 17-18-19-20)',     '2026-05-19', '2026-05-22'),
  ('calendrier_mensuel', 2026, 'Juin (sem 21-22-23-24-25)', '2026-06-23', '2026-06-26'),
  ('calendrier_mensuel', 2026, 'Juillet (sem 26-27-28-29)', '2026-07-21', '2026-07-24'),
  ('calendrier_mensuel', 2026, 'Août (sem 30-31-32-33)',    '2026-08-18', '2026-08-21'),
  ('calendrier_mensuel', 2026, 'Septembre (sem 34-38)',     '2026-09-22', '2026-09-25'),
  ('calendrier_mensuel', 2026, 'Octobre (sem 39-42)',       '2026-10-20', '2026-10-23'),
  ('calendrier_mensuel', 2026, 'Novembre (sem 43-46)',      '2026-11-17', '2026-11-20'),
  ('calendrier_mensuel', 2026, 'Décembre A (sem 47-50)',    '2026-12-15', '2026-12-18'),
  ('calendrier_mensuel', 2026, 'Décembre B (sem 51)',       '2026-12-22', '2026-12-24'),
  ('calendrier_mensuel', 2026, 'Décembre C (sem 52-53)',    '2027-01-05', '2027-01-08')
ON CONFLICT (mode, annee, libelle) DO NOTHING;

-- ============================================================
-- 5) SEED — Calendrier MENSUEL (vert) — 2026
-- ============================================================
INSERT INTO secretariat_paiement_calendrier (mode, annee, libelle, date_limite, date_paiement) VALUES
  ('mensuel', 2026, 'Janvier travaillé',   '2026-01-31', '2026-02-05'),
  ('mensuel', 2026, 'Février travaillé',   '2026-02-28', '2026-03-05'),
  ('mensuel', 2026, 'Mars travaillé',      '2026-03-31', '2026-04-02'),
  ('mensuel', 2026, 'Avril travaillé',     '2026-04-30', '2026-05-05'),
  ('mensuel', 2026, 'Mai travaillé',       '2026-05-31', '2026-06-04'),
  ('mensuel', 2026, 'Juin travaillé',      '2026-06-30', '2026-07-03'),
  ('mensuel', 2026, 'Juillet travaillé',   '2026-07-31', '2026-08-05'),
  ('mensuel', 2026, 'Août travaillé',      '2026-08-31', '2026-09-03'),
  ('mensuel', 2026, 'Septembre travaillé', '2026-09-30', '2026-10-05'),
  ('mensuel', 2026, 'Octobre travaillé',   '2026-10-31', '2026-11-04'),
  ('mensuel', 2026, 'Novembre travaillé',  '2026-11-30', '2026-12-03'),
  ('mensuel', 2026, 'Décembre travaillé',  '2026-12-31', '2027-01-07')
ON CONFLICT (mode, annee, libelle) DO NOTHING;

-- ============================================================
-- 6) SEED — Calendrier HEBDOMADAIRE — 2026 (paiement chaque jeudi)
-- Généré pour toutes les semaines : 2026-W01 → 2026-W53
-- Date limite = mercredi 9h, paiement = jeudi 14h
-- ============================================================
DO $$
DECLARE
  d DATE := '2026-01-01';
  jeudi DATE;
  num_sem INTEGER;
BEGIN
  WHILE d <= '2026-12-31' LOOP
    -- jeudi de la semaine ISO contenant d
    jeudi := d + ((4 - EXTRACT(ISODOW FROM d)::INTEGER + 7) % 7);
    num_sem := EXTRACT(WEEK FROM jeudi)::INTEGER;
    IF jeudi BETWEEN '2026-01-01' AND '2026-12-31' THEN
      INSERT INTO secretariat_paiement_calendrier (mode, annee, libelle, date_limite, date_paiement)
      VALUES (
        'hebdomadaire',
        2026,
        'Semaine ' || LPAD(num_sem::TEXT, 2, '0'),
        jeudi - INTERVAL '1 day',  -- mercredi
        jeudi
      )
      ON CONFLICT (mode, annee, libelle) DO NOTHING;
    END IF;
    d := d + 7;
  END LOOP;
END $$;
