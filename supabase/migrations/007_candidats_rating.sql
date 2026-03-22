-- Add star rating (0-5) to candidats table
ALTER TABLE candidats ADD COLUMN IF NOT EXISTS rating smallint DEFAULT NULL;

-- Ensure rating is between 0 and 5
ALTER TABLE candidats ADD CONSTRAINT candidats_rating_check CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5));
