-- Ajout du champ cdc_url pour stocker l'URL signée du cahier des charges uploadé
-- Permet d'afficher le fichier original (PDF/DOCX/image) sur la card commande
ALTER TABLE offres ADD COLUMN IF NOT EXISTS cdc_url TEXT;
