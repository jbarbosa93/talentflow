-- v1.9.66 — Historique unifié messages (email + iMessage + WhatsApp + SMS)
-- On réutilise emails_envoyes en ajoutant une colonne `canal` plutôt que créer
-- une table dédiée (permet de garder le DELETE endpoint + le GET historique).
--
-- Appliqué sur Supabase prod le 20/04/2026 via MCP execute_sql.

ALTER TABLE emails_envoyes
  ADD COLUMN IF NOT EXISTS canal text NOT NULL DEFAULT 'email'
  CHECK (canal IN ('email','imessage','whatsapp','sms'));

CREATE INDEX IF NOT EXISTS idx_emails_envoyes_canal
  ON emails_envoyes(canal);

CREATE INDEX IF NOT EXISTS idx_emails_envoyes_user_created
  ON emails_envoyes(user_id, created_at DESC);

COMMENT ON COLUMN emails_envoyes.canal IS
  'Canal d''envoi — v1.9.66 : email (default), imessage, whatsapp, sms. Historique unifié.';
