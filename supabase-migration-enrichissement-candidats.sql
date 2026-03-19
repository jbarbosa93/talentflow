-- Migration : enrichissement table candidats
-- À exécuter dans Supabase > SQL Editor

ALTER TABLE candidats
  ADD COLUMN IF NOT EXISTS langues        text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linkedin       text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS permis_conduire boolean DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS date_naissance text    DEFAULT NULL;

-- Commentaires
COMMENT ON COLUMN candidats.langues          IS 'Langues parlées extraites du CV';
COMMENT ON COLUMN candidats.linkedin         IS 'URL profil LinkedIn';
COMMENT ON COLUMN candidats.permis_conduire  IS 'Permis de conduire mentionné dans le CV';
COMMENT ON COLUMN candidats.date_naissance   IS 'Date de naissance au format DD/MM/YYYY';
