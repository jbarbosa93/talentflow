-- Migration: Indexes performance sur table candidats
-- Contexte: 6500+ candidats, lenteurs sur filtres et recherche
-- Date: 2026-04-01

-- ── Tri principal ─────────────────────────────────────────────────────────────
-- Toutes les listes sont triées par created_at DESC par défaut
CREATE INDEX IF NOT EXISTS idx_candidats_created_at
  ON candidats (created_at DESC);

-- ── Filtres pipeline ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_candidats_statut_pipeline
  ON candidats (statut_pipeline)
  WHERE statut_pipeline IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_candidats_import_status
  ON candidats (import_status)
  WHERE import_status IS NOT NULL;

-- ── Filtres démographiques ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_candidats_genre
  ON candidats (genre)
  WHERE genre IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_candidats_permis_conduire
  ON candidats (permis_conduire)
  WHERE permis_conduire IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_candidats_deja_engage
  ON candidats (deja_engage)
  WHERE deja_engage = TRUE;

CREATE INDEX IF NOT EXISTS idx_candidats_cfc
  ON candidats (cfc)
  WHERE cfc = TRUE;

-- ── Recherche par localisation (ilike %...%) ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_candidats_localisation
  ON candidats USING gin (localisation gin_trgm_ops);

-- ── Recherche full-text — colonnes principales ────────────────────────────────
-- Utilisé par le fallback basique (nom, prénom, titre, email, localisation)
CREATE INDEX IF NOT EXISTS idx_candidats_nom_trgm
  ON candidats USING gin (nom gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_candidats_prenom_trgm
  ON candidats USING gin (prenom gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_candidats_titre_poste_trgm
  ON candidats USING gin (titre_poste gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_candidats_email
  ON candidats (email)
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_candidats_telephone
  ON candidats (telephone)
  WHERE telephone IS NOT NULL;

-- ── Index composé pour les combinaisons les plus fréquentes ──────────────────
-- statut + date (filtre pipeline + tri)
CREATE INDEX IF NOT EXISTS idx_candidats_statut_date
  ON candidats (statut_pipeline, created_at DESC);

-- import_status + date (filtre "à traiter" + tri)
CREATE INDEX IF NOT EXISTS idx_candidats_import_date
  ON candidats (import_status, created_at DESC);

-- ── Recherche full-text vectorielle (RPC search_candidats_filtered) ───────────
-- Accélère la RPC si elle utilise to_tsvector sur ces colonnes
ALTER TABLE candidats ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('french',
      coalesce(nom, '') || ' ' ||
      coalesce(prenom, '') || ' ' ||
      coalesce(titre_poste, '') || ' ' ||
      coalesce(email, '') || ' ' ||
      coalesce(localisation, '') || ' ' ||
      coalesce(formation, '') || ' ' ||
      coalesce(notes, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_candidats_fts
  ON candidats USING gin (fts);
