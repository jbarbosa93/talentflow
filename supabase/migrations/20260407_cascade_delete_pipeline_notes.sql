-- Migration: ON DELETE CASCADE pour pipeline et notes_candidat
-- Si un candidat est supprimé → ses entrées pipeline et notes sont supprimées automatiquement

-- 1. pipeline
ALTER TABLE pipeline
  DROP CONSTRAINT IF EXISTS pipeline_candidat_id_fkey,
  ADD CONSTRAINT pipeline_candidat_id_fkey
    FOREIGN KEY (candidat_id) REFERENCES candidats(id) ON DELETE CASCADE;

-- 2. notes_candidat
ALTER TABLE notes_candidat
  DROP CONSTRAINT IF EXISTS notes_candidat_candidat_id_fkey,
  ADD CONSTRAINT notes_candidat_candidat_id_fkey
    FOREIGN KEY (candidat_id) REFERENCES candidats(id) ON DELETE CASCADE;
