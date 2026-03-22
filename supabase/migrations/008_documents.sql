-- Add documents column to candidats table (jsonb array)
-- Each entry: { name: string, url: string, type: string, uploaded_at: string }
-- Types: certificat, diplome, lettre_motivation, formation, permis, autre
ALTER TABLE candidats ADD COLUMN IF NOT EXISTS documents jsonb DEFAULT '[]'::jsonb;
