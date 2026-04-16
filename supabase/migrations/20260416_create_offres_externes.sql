-- Table offres_externes — veille offres suisses (jobs.ch, jobup.ch, Indeed CH) via Apify
CREATE TABLE offres_externes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  titre TEXT NOT NULL,
  entreprise TEXT,
  lieu TEXT,
  canton TEXT,
  type_contrat TEXT,
  taux_occupation TEXT,
  description TEXT,
  competences TEXT[] DEFAULT '{}',
  salaire TEXT,
  url_source TEXT UNIQUE NOT NULL,
  source TEXT NOT NULL,
  date_publication DATE,
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE offres_externes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_offres_ext" ON offres_externes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_write_offres_ext" ON offres_externes
  FOR ALL TO service_role USING (true);

-- Index
CREATE INDEX idx_offres_ext_source ON offres_externes(source);
CREATE INDEX idx_offres_ext_canton ON offres_externes(canton);
CREATE INDEX idx_offres_ext_actif ON offres_externes(actif) WHERE actif = true;
CREATE INDEX idx_offres_ext_created ON offres_externes(created_at DESC);
