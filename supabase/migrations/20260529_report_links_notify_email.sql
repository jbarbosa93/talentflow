-- v2.9.82 — Email destinataire interne (L-Agence) du rapport finalisé, par lien.
-- Avant : le PDF final partait au créateur du lien (created_by → son email), fallback ADMIN_EMAIL.
-- Désormais : si notify_email est renseigné sur le lien, il prend le dessus (modifiable même
-- sur les liens déjà existants, sans recréer). NULL = comportement historique (créateur).
ALTER TABLE report_links ADD COLUMN IF NOT EXISTS notify_email text;

COMMENT ON COLUMN report_links.notify_email IS
  'Email interne L-Agence qui reçoit le rapport finalisé (override du créateur). NULL = créateur/ADMIN_EMAIL.';
