-- v2.8.6 — Pré-remplir le champ Message de /sign/new depuis le template
ALTER TABLE sign_templates
  ADD COLUMN IF NOT EXISTS default_message TEXT;

COMMENT ON COLUMN sign_templates.default_message IS
  'Message par défaut pré-rempli dans le champ Message de /sign/new quand ce template est sélectionné. v2.8.6.';
