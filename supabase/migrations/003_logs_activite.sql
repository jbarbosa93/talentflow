CREATE TABLE IF NOT EXISTS logs_activite (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  action text NOT NULL,
  user_id uuid,
  user_email text,
  details jsonb DEFAULT '{}',
  ip text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE logs_activite ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_logs" ON logs_activite FOR ALL USING (true);
CREATE INDEX IF NOT EXISTS idx_logs_activite_created_at ON logs_activite(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_activite_user_email ON logs_activite(user_email);
