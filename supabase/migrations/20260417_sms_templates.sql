-- Étendre email_templates pour supporter les templates SMS

ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'email'
  CHECK (type IN ('email', 'sms'));

ALTER TABLE email_templates
  ALTER COLUMN sujet DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_templates_type ON email_templates(type);

INSERT INTO email_templates (nom, categorie, type, sujet, corps)
SELECT
  'Recherche de candidat',
  'general',
  'sms',
  NULL,
  $body$L-AGENCE SA à Monthey - http://www.l-agence.ch

Nous sommes à la recherche d'un [MÉTIER] pour une mission sur [LIEU].

Tu es disponible ou tu connais quelqu'un qui pourrait être intéressé ?

Réponds-nous par WhatsApp (clique sur le lien) http://wa.me/41788658774 ou envoie nous ton CV à jour par mail : info@l-agence.ch ou par WhatsApp (clique sur le lien) http://wa.me/41788658774

À disposition pour en discuter.
À bientôt et bonne journée
João 😃$body$
WHERE NOT EXISTS (
  SELECT 1 FROM email_templates WHERE nom = 'Recherche de candidat' AND type = 'sms'
);
