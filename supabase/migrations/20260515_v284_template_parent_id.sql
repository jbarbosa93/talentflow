-- v2.8.4 — TalentFlow Sign : distinguer templates ad-hoc des vrais templates
--
-- À chaque POST /api/sign/envelopes avec body.documents (override des docs du
-- template parent), une nouvelle ligne sign_templates est créée comme container
-- technique pour stocker les fields override + le PDF du jour. Avant v2.8.4 ces
-- "templates ad-hoc" polluaient la liste UI (/sign/templates) + le dropdown
-- (/sign/new) car indistinguables des vrais templates.
--
-- Cette migration ajoute une référence vers le template parent. Ad-hoc = ligne
-- avec parent_template_id NON NULL. Vrai template réutilisable = NULL.
--
-- IMPORTANT : la route GET /api/sign/templates renvoie TOUS les templates (ad-hoc
-- inclus) pour préserver le lookup côté front (templates.find(t => t.id === ...))
-- quand un brouillon pointe vers un ad-hoc. Le filtrage des ad-hoc se fait
-- côté FRONT uniquement (dropdown + liste) via `!t.parent_template_id`.
--
-- Backfill : les templates existants nommés "[Envoi] ..." créés avant cette
-- migration sont identifiés comme ad-hoc. On tente de les rattacher à leur
-- parent par matching du nom (REPLACE '[Envoi] ', '').

ALTER TABLE sign_templates
  ADD COLUMN IF NOT EXISTS parent_template_id UUID
  REFERENCES sign_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sign_templates_parent
  ON sign_templates(parent_template_id)
  WHERE parent_template_id IS NOT NULL;

COMMENT ON COLUMN sign_templates.parent_template_id IS
  'Si NULL : vrai template réutilisable. Si non NULL : template ad-hoc cloné automatiquement au POST /api/sign/envelopes (contrat + docs override). Doit être filtré hors des listes UI. v2.8.4.';

-- Backfill rétro pour les ad-hoc créés sans parent_template_id
UPDATE sign_templates SET parent_template_id = (
  SELECT id FROM sign_templates parent
  WHERE parent.template_category = 'contrat'
    AND parent.parent_template_id IS NULL
    AND parent.name = REPLACE(sign_templates.name, '[Envoi] ', '')
  LIMIT 1
)
WHERE name LIKE '[Envoi] %' AND parent_template_id IS NULL;
