-- =====================================================
-- TalentFlow Sign — Phase 3 : Consentement CGU + signature électronique (ZertES)
-- v2.2.0 — 06/05/2026
-- =====================================================
-- Track l'acceptation des conditions de signature électronique au niveau token
-- (chaque destinataire consent indépendamment, traçabilité fine pour preuve juridique).
-- Étend le CHECK de sign_audit_log avec une nouvelle action 'consented'.
-- =====================================================

ALTER TABLE sign_tokens
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_accepted_ip text;

COMMENT ON COLUMN sign_tokens.terms_accepted_at IS 'Date/heure d''acceptation des CGU par ce destinataire (consentement signature électronique ZertES). NULL = pas encore consenté.';
COMMENT ON COLUMN sign_tokens.terms_accepted_ip IS 'IP au moment de l''acceptation des CGU (preuve juridique).';

-- Index partiel pour les audits "qui n'a pas consenté"
CREATE INDEX IF NOT EXISTS idx_sign_tokens_not_consented
  ON sign_tokens(envelope_id)
  WHERE terms_accepted_at IS NULL;

-- Étendre le CHECK action de sign_audit_log avec 'consented'
ALTER TABLE sign_audit_log DROP CONSTRAINT IF EXISTS sign_audit_log_action_check;
ALTER TABLE sign_audit_log ADD CONSTRAINT sign_audit_log_action_check
  CHECK (action IN ('created','sent','viewed','consented','signed','completed','declined','expired','reminded'));
