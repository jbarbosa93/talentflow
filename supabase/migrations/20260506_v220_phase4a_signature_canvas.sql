-- =====================================================
-- TalentFlow Sign — Phase 4a : Signature électronique au canvas
-- v2.2.0 — 06/05/2026
-- =====================================================
-- Option A : 1 signature globale par token, appliquée à tous les champs
-- signature/initial du destinataire (pattern DocuSign auto-adoption).
-- =====================================================

ALTER TABLE sign_tokens
  ADD COLUMN IF NOT EXISTS signature_data_url text,
  ADD COLUMN IF NOT EXISTS signature_method text,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_ip text,
  ADD COLUMN IF NOT EXISTS field_values jsonb DEFAULT '{}'::jsonb;

ALTER TABLE sign_tokens DROP CONSTRAINT IF EXISTS sign_tokens_signature_method_check;
ALTER TABLE sign_tokens ADD CONSTRAINT sign_tokens_signature_method_check
  CHECK (signature_method IS NULL OR signature_method IN ('drawn', 'typed', 'auto'));

COMMENT ON COLUMN sign_tokens.signature_data_url IS 'Data URL PNG de la signature (tracé canvas ou typed rendu) — Option A : 1 signature globale appliquée à tous les champs signature/initial du destinataire.';
COMMENT ON COLUMN sign_tokens.signature_method IS 'Méthode de signature : drawn (tracé canvas), typed (saisie + police cursive), auto (auto-adopté depuis profil).';
COMMENT ON COLUMN sign_tokens.signed_at IS 'Date/heure de signature finale (token utilisé). NULL = pas encore signé.';
COMMENT ON COLUMN sign_tokens.signed_ip IS 'IP au moment de la signature (preuve juridique).';
COMMENT ON COLUMN sign_tokens.field_values IS 'Valeurs des champs remplis par ce destinataire au signing. Format: { fieldId: value, ... }. Phase 4b utilise pour stamp PDF.';

CREATE INDEX IF NOT EXISTS idx_sign_tokens_envelope_signed
  ON sign_tokens(envelope_id, signed_at);
