-- v1.9.68 — Historique global team + templates WhatsApp + user_name sur emails_envoyes
-- Appliqué sur Supabase prod le 21/04/2026 via MCP apply_migration.
--
-- Changements :
-- 1. RLS SELECT emails_envoyes : per-user → global team (INSERT/UPDATE/DELETE restent per-user)
-- 2. CHECK email_templates.type += 'whatsapp' (3e canal avec SMS/iMessage et Email)
-- 3. Colonne user_name sur emails_envoyes (pour afficher "envoyé par X" dans l'historique global)
-- 4. Index idx_emails_envoyes_candidat_created (pour endpoint /api/messages/recent-contacts)

-- 1. RLS SELECT global (lecture team)
DROP POLICY IF EXISTS emails_envoyes_select_own ON emails_envoyes;
CREATE POLICY emails_envoyes_select_team ON emails_envoyes
  FOR SELECT TO authenticated USING (true);

-- INSERT/UPDATE/DELETE existent déjà, on ne touche pas :
-- - INSERT : user_id IS NULL OR auth.uid() = user_id
-- - UPDATE : auth.uid() = user_id
-- - DELETE : auth.uid() = user_id
-- Raison : chaque user peut voir tous les envois mais ne peut modifier/supprimer que les siens.

-- 2. CHECK constraint email_templates.type += 'whatsapp'
ALTER TABLE email_templates DROP CONSTRAINT IF EXISTS email_templates_type_check;
ALTER TABLE email_templates ADD CONSTRAINT email_templates_type_check
  CHECK (type IN ('email', 'sms', 'whatsapp'));

-- 3. Colonne user_name (cache du prénom expéditeur, évite jointure auth.users)
ALTER TABLE emails_envoyes ADD COLUMN IF NOT EXISTS user_name text;
COMMENT ON COLUMN emails_envoyes.user_name IS
  'Prénom ou nom complet de l''expéditeur — v1.9.68 pour historique global team. Rempli à l''insert.';

-- 4. Index pour /api/messages/recent-contacts (warning 7 jours avant envoi)
CREATE INDEX IF NOT EXISTS idx_emails_envoyes_candidat_created
  ON emails_envoyes(candidat_id, created_at DESC)
  WHERE candidat_id IS NOT NULL;

-- 5. Index pour /api/messages/recent-contacts via candidat_ids JSONB array
CREATE INDEX IF NOT EXISTS idx_emails_envoyes_candidat_ids_gin
  ON emails_envoyes USING GIN (candidat_ids)
  WHERE candidat_ids IS NOT NULL;
