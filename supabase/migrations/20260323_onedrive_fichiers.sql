-- Migration: table onedrive_fichiers
-- Stocke l'historique des fichiers OneDrive traités pour éviter les doublons

CREATE TABLE IF NOT EXISTS onedrive_fichiers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  onedrive_item_id TEXT NOT NULL,
  nom_fichier TEXT,
  traite BOOLEAN DEFAULT true,
  candidat_id UUID REFERENCES candidats(id) ON DELETE SET NULL,
  erreur TEXT,
  traite_le TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_onedrive_fichiers_item_id ON onedrive_fichiers(onedrive_item_id);
CREATE INDEX IF NOT EXISTS idx_onedrive_fichiers_integration ON onedrive_fichiers(integration_id);
CREATE INDEX IF NOT EXISTS idx_onedrive_fichiers_candidat ON onedrive_fichiers(candidat_id);
