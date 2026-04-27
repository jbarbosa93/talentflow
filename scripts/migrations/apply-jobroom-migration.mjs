import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Use the Management API via direct SQL — the service role can execute DDL via pg_query
// since Supabase 2023+ supports executing SQL via the /sql endpoint with service role
const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL.replace('https://', '').replace('.supabase.co', '')

const sql = `
CREATE TABLE IF NOT EXISTS jobroom_candidats (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  jobroom_uuid      text        NOT NULL UNIQUE,
  metier            text        NOT NULL,
  nom               text,
  nationalite       text,
  cp                text,
  ville             text,
  mobile            text,
  telephone         text,
  region            text,
  niveau_formation  text,
  disponibilite     text,
  titre_poste       text,
  experiences       jsonb       NOT NULL DEFAULT '[]',
  raw_data          jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jobroom_metier ON jobroom_candidats(metier);
CREATE INDEX IF NOT EXISTS idx_jobroom_region ON jobroom_candidats(region);
CREATE INDEX IF NOT EXISTS idx_jobroom_created ON jobroom_candidats(created_at DESC);
ALTER TABLE jobroom_candidats ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'jobroom_candidats' AND policyname = 'jobroom_select_authenticated') THEN
    EXECUTE 'CREATE POLICY jobroom_select_authenticated ON jobroom_candidats FOR SELECT TO authenticated USING (true)';
  END IF;
END $$;
COMMENT ON TABLE jobroom_candidats IS 'v1.9.75 — Candidats scrapés de job-room.ch. Upsert via /api/jobroom/candidats (Bearer CRON_SECRET).';
`

// Try the Supabase SQL execution endpoint (available for service role)
const resp = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
  method: 'GET',
  headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY }
})

// Use pg_dump style via direct REST call to pg
const sqlResp = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.SUPABASE_ACCESS_TOKEN || ''}`,
  },
  body: JSON.stringify({ query: sql })
})
console.log('Management API status:', sqlResp.status)
console.log(await sqlResp.text())

// Also try via service role direct insert to check connection
const { data, error } = await supabase.from('jobroom_candidats').select('id').limit(1)
console.log('Table check:', error?.code || 'OK — table exists', data)
