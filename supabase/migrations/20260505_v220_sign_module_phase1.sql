-- =====================================================
-- TalentFlow Sign — Phase 1 : Module signature électronique
-- v2.2.0 — 05/05/2026
-- =====================================================
-- Tables : sign_templates, sign_envelopes, sign_tokens, sign_audit_log
-- Storage bucket privé : talentflow-sign (PDF only, 50 MB max)
-- RLS : authenticated only (page publique passe par routes API service role)
-- =====================================================

-- ============ 1. TABLES ============

CREATE TABLE IF NOT EXISTS sign_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  description     text,
  documents       jsonb NOT NULL DEFAULT '[]'::jsonb,
  recipients_schema jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE sign_templates IS 'Modèles réutilisables d''enveloppes (documents + schéma destinataires).';
COMMENT ON COLUMN sign_templates.documents IS 'JSON: [{name, storage_path, order}]';
COMMENT ON COLUMN sign_templates.recipients_schema IS 'JSON: [{role, order, required_fields[]}]';

CREATE TABLE IF NOT EXISTS sign_envelopes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text NOT NULL,
  template_id       uuid REFERENCES sign_templates(id) ON DELETE SET NULL,
  candidate_id      uuid REFERENCES candidats(id) ON DELETE SET NULL,
  status            text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','sent','in_progress','completed','expired','declined','cancelled')),
  document_category text NOT NULL DEFAULT 'autres'
                    CHECK (document_category IN ('mappe','contrat','autres')),
  recipients        jsonb NOT NULL DEFAULT '[]'::jsonb,
  message           text,
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at           timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE sign_envelopes IS 'Enveloppe = un envoi concret pour un candidat (instancie un template ou ad-hoc).';
COMMENT ON COLUMN sign_envelopes.recipients IS 'JSON: [{name, email, role, order, signed_at, status}]';

CREATE TABLE IF NOT EXISTS sign_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  envelope_id     uuid NOT NULL REFERENCES sign_envelopes(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  recipient_name  text NOT NULL,
  token           uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  expires_at      timestamptz NOT NULL,
  used_at         timestamptz,
  ip_address      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE sign_tokens IS 'Tokens uniques pour accès page publique de signature. Lecture via route API service role (jamais RLS public).';

CREATE TABLE IF NOT EXISTS sign_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  envelope_id     uuid NOT NULL REFERENCES sign_envelopes(id) ON DELETE CASCADE,
  recipient_email text,
  action          text NOT NULL
                  CHECK (action IN ('created','sent','viewed','signed','completed','declined','expired','reminded')),
  ip_address      text,
  user_agent      text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE sign_audit_log IS 'Audit log immuable. Insert via service role uniquement (page publique passe par route API).';

-- ============ 2. INDEXES ============

CREATE INDEX IF NOT EXISTS idx_sign_envelopes_candidate    ON sign_envelopes(candidate_id) WHERE candidate_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sign_envelopes_template     ON sign_envelopes(template_id) WHERE template_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sign_envelopes_status       ON sign_envelopes(status);
CREATE INDEX IF NOT EXISTS idx_sign_envelopes_created_by   ON sign_envelopes(created_by);
CREATE INDEX IF NOT EXISTS idx_sign_envelopes_category     ON sign_envelopes(document_category);
CREATE INDEX IF NOT EXISTS idx_sign_envelopes_created_at   ON sign_envelopes(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sign_tokens_envelope        ON sign_tokens(envelope_id);
CREATE INDEX IF NOT EXISTS idx_sign_tokens_token           ON sign_tokens(token);
CREATE INDEX IF NOT EXISTS idx_sign_tokens_expires_at      ON sign_tokens(expires_at) WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sign_audit_envelope         ON sign_audit_log(envelope_id);
CREATE INDEX IF NOT EXISTS idx_sign_audit_created_at       ON sign_audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sign_templates_created_by   ON sign_templates(created_by);

-- ============ 3. TRIGGERS updated_at ============

CREATE OR REPLACE FUNCTION sign_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sign_templates_updated_at ON sign_templates;
CREATE TRIGGER trg_sign_templates_updated_at
  BEFORE UPDATE ON sign_templates
  FOR EACH ROW EXECUTE FUNCTION sign_set_updated_at();

DROP TRIGGER IF EXISTS trg_sign_envelopes_updated_at ON sign_envelopes;
CREATE TRIGGER trg_sign_envelopes_updated_at
  BEFORE UPDATE ON sign_envelopes
  FOR EACH ROW EXECUTE FUNCTION sign_set_updated_at();

-- ============ 4. RLS ============

ALTER TABLE sign_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sign_envelopes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sign_tokens     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sign_audit_log  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sign_templates_auth_all" ON sign_templates;
CREATE POLICY "sign_templates_auth_all" ON sign_templates
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "sign_envelopes_auth_all" ON sign_envelopes;
CREATE POLICY "sign_envelopes_auth_all" ON sign_envelopes
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "sign_tokens_auth_all" ON sign_tokens;
CREATE POLICY "sign_tokens_auth_all" ON sign_tokens
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "sign_audit_auth_select" ON sign_audit_log;
CREATE POLICY "sign_audit_auth_select" ON sign_audit_log
  FOR SELECT TO authenticated
  USING (true);

-- ============ 5. STORAGE BUCKET ============

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'talentflow-sign',
  'talentflow-sign',
  false,
  52428800,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "talentflow_sign_auth_all" ON storage.objects;
CREATE POLICY "talentflow_sign_auth_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'talentflow-sign')
  WITH CHECK (bucket_id = 'talentflow-sign');

-- Convention dossiers : templates/{template_id}/{filename}
--                      envelopes/{envelope_id}/{filename}
--                      signed/{envelope_id}/{filename}
