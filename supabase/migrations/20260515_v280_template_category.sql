-- v2.8.0 — TalentFlow Sign : catégorie fonctionnelle des templates
--
-- Ajoute la colonne `template_category` à `sign_templates` pour distinguer
-- les contrats (qui reçoivent automatiquement l'en-tête L-Agence à l'upload
-- via le flag letterhead=lagence sur /api/sign/upload) des autres templates.
--
-- Valeurs autorisées :
--   - 'mappe'   : template polyvalent (défaut)
--   - 'contrat' : contrat de travail / mission — header L-Agence auto
--   - 'report'  : rapport hebdomadaire récurrent
--
-- Templates existants → NULL → comportement inchangé (pas de stamping auto).
-- Aucun backfill nécessaire.

ALTER TABLE sign_templates
  ADD COLUMN IF NOT EXISTS template_category TEXT
  CHECK (template_category IN ('mappe', 'contrat', 'report'));

COMMENT ON COLUMN sign_templates.template_category IS
  'Catégorie fonctionnelle du template : mappe (général), contrat (contrat de travail — header L-Agence auto à l''upload), report (rapport hebdo récurrent). v2.8.0.';
