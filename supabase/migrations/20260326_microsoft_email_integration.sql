-- Migration: ajouter microsoft_email comme type d'intégration valide
-- Permet à chaque utilisateur de connecter son propre compte Outlook pour l'envoi d'emails

-- Supprimer l'ancienne contrainte sur le type
ALTER TABLE integrations DROP CONSTRAINT IF EXISTS integrations_type_check;

-- Recréer avec microsoft_email inclus
ALTER TABLE integrations ADD CONSTRAINT integrations_type_check
  CHECK (type IN ('microsoft', 'microsoft_onedrive', 'microsoft_email', 'google', 'whatsapp'));
