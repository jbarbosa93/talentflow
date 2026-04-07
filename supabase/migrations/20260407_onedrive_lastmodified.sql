-- Migration: ajouter last_modified_at à onedrive_fichiers
-- Stocke la lastModifiedDateTime du fichier OneDrive au moment du traitement
-- Permet de détecter les vrais changements (Règle 4) sans dépendre de traite_le

ALTER TABLE onedrive_fichiers
ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMPTZ;
